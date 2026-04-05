package storage

import (
	"crypto/md5"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"b8n6mail/models"
)

// Cloud storage layout:
//   data/cloud/<md5(email)>/index.json      — metadata index
//   data/cloud/<md5(email)>/<fileId>.blob   — binary file contents
//   data/cloud/public/<shareToken>.json     — public-token → owner+fileId pointer

var cloudLock sync.Mutex // serialise writes across goroutines

func cloudUserDir(email string) string {
	h := md5.Sum([]byte(strings.ToLower(email)))
	return filepath.Join(DataDir, "cloud", fmt.Sprintf("%x", h))
}

func cloudIndexPath(email string) string {
	return filepath.Join(cloudUserDir(email), "index.json")
}

func cloudBlobPath(email, fileID string) string {
	return filepath.Join(cloudUserDir(email), fileID+".blob")
}

func publicTokenPath(token string) string {
	return filepath.Join(DataDir, "cloud", "public", token+".json")
}

// publicRef is the content of a public-link pointer file.
type publicRef struct {
	OwnerEmail string `json:"ownerEmail"`
	FileID     string `json:"fileId"`
}

// ListCloudFiles returns all file metadata for a user (empty slice if none).
// Backfills AccessMode on legacy records ("" → derived from IsPublic).
func ListCloudFiles(email string) ([]models.CloudFile, error) {
	raw, err := os.ReadFile(cloudIndexPath(email))
	if err != nil {
		if os.IsNotExist(err) {
			return []models.CloudFile{}, nil
		}
		return nil, err
	}
	var files []models.CloudFile
	if err := json.Unmarshal(raw, &files); err != nil {
		return []models.CloudFile{}, nil
	}
	for i := range files {
		if files[i].AccessMode == "" {
			if files[i].IsPublic {
				files[i].AccessMode = "public"
			} else {
				files[i].AccessMode = "private"
			}
		}
	}
	return files, nil
}

// WriteCloudIndex persists the file index for a user.
func writeCloudIndex(email string, files []models.CloudFile) error {
	path := cloudIndexPath(email)
	_ = os.MkdirAll(filepath.Dir(path), 0755)
	return WriteJSON(path, files)
}

// SaveCloudBlob streams an upload into storage and records its metadata.
// Returns the new CloudFile record or an error.
func SaveCloudBlob(email, origName, mimeType string, src io.Reader, declaredSize int64) (*models.CloudFile, error) {
	cloudLock.Lock()
	defer cloudLock.Unlock()

	userDir := cloudUserDir(email)
	if err := os.MkdirAll(userDir, 0755); err != nil {
		return nil, err
	}
	fileID := newFileID()
	blobPath := cloudBlobPath(email, fileID)

	dst, err := os.Create(blobPath)
	if err != nil {
		return nil, err
	}
	written, copyErr := io.Copy(dst, src)
	_ = dst.Close()
	if copyErr != nil {
		_ = os.Remove(blobPath)
		return nil, copyErr
	}
	if declaredSize > 0 && written != declaredSize {
		// Not fatal — trust the actual bytes on disk and keep the real byte count.
	}

	// Update index
	files, _ := ListCloudFiles(email)
	rec := models.CloudFile{
		ID:         fileID,
		OwnerEmail: strings.ToLower(email),
		Name:       sanitizeCloudFilename(origName),
		Size:       written,
		MimeType:   mimeType,
		UploadedAt: nowISO(),
		AccessMode: "private",
		IsPublic:   false,
	}
	files = append([]models.CloudFile{rec}, files...)
	if err := writeCloudIndex(email, files); err != nil {
		_ = os.Remove(blobPath)
		return nil, err
	}

	// Bump user quota usage
	_ = recomputeUserStorage(email, files)
	return &rec, nil
}

// DeleteCloudFile removes a blob and its index entry.
func DeleteCloudFile(email, fileID string) error {
	cloudLock.Lock()
	defer cloudLock.Unlock()

	files, err := ListCloudFiles(email)
	if err != nil {
		return err
	}
	var kept []models.CloudFile
	var removed *models.CloudFile
	for _, f := range files {
		if f.ID == fileID {
			rc := f
			removed = &rc
			continue
		}
		kept = append(kept, f)
	}
	if removed == nil {
		return os.ErrNotExist
	}
	// If the file was public, unlink its public token too
	if removed.IsPublic && removed.ShareToken != "" {
		_ = os.Remove(publicTokenPath(removed.ShareToken))
	}
	_ = os.Remove(cloudBlobPath(email, fileID))
	if err := writeCloudIndex(email, kept); err != nil {
		return err
	}
	_ = recomputeUserStorage(email, kept)
	return nil
}

// SetCloudFileAccess rewrites the access mode + allowed-email list for a file.
// Modes: "private" | "emails" | "domain" | "public". Returns the updated
// record (with ShareToken populated if mode == "public").
func SetCloudFileAccess(email, fileID, mode string, allowedEmails []string) (*models.CloudFile, error) {
	cloudLock.Lock()
	defer cloudLock.Unlock()

	if mode != "private" && mode != "emails" && mode != "domain" && mode != "public" {
		mode = "private"
	}
	// Normalise and dedupe allowed list
	seen := map[string]bool{}
	cleaned := allowedEmails[:0]
	for _, e := range allowedEmails {
		e = strings.ToLower(strings.TrimSpace(e))
		if e == "" || !strings.Contains(e, "@") || seen[e] {
			continue
		}
		seen[e] = true
		cleaned = append(cleaned, e)
	}

	files, err := ListCloudFiles(email)
	if err != nil {
		return nil, err
	}
	var result *models.CloudFile
	for i := range files {
		if files[i].ID != fileID {
			continue
		}
		// Clean up previous public pointer if transitioning away from public
		wasPublic := files[i].AccessMode == "public" || files[i].IsPublic
		if wasPublic && mode != "public" && files[i].ShareToken != "" {
			_ = os.Remove(publicTokenPath(files[i].ShareToken))
			files[i].ShareToken = ""
		}

		files[i].AccessMode = mode
		files[i].IsPublic = (mode == "public")
		if mode == "emails" {
			files[i].AllowedEmails = cleaned
		} else {
			files[i].AllowedEmails = nil
		}
		if mode == "public" {
			if files[i].ShareToken == "" {
				files[i].ShareToken = newShareToken()
			}
			_ = os.MkdirAll(filepath.Dir(publicTokenPath(files[i].ShareToken)), 0755)
			_ = WriteJSON(publicTokenPath(files[i].ShareToken), publicRef{
				OwnerEmail: strings.ToLower(email),
				FileID:     fileID,
			})
		}
		result = &files[i]
		break
	}
	if result == nil {
		return nil, os.ErrNotExist
	}
	if err := writeCloudIndex(email, files); err != nil {
		return nil, err
	}
	return result, nil
}

// CanUserAccessFile checks whether callerEmail is permitted to download a file.
// Returns true for: the owner, anyone in AllowedEmails, anyone on the owner's
// domain (if domain mode), or always true for public files (pass "" as caller).
func CanUserAccessFile(f *models.CloudFile, callerEmail string) bool {
	if f == nil {
		return false
	}
	caller := strings.ToLower(strings.TrimSpace(callerEmail))
	owner := strings.ToLower(f.OwnerEmail)
	if caller == owner {
		return true
	}
	switch f.AccessMode {
	case "private":
		return false
	case "public":
		return true // handled via share token
	case "domain":
		return caller != "" && domainOfEmail(caller) == domainOfEmail(owner)
	case "emails":
		if caller == "" {
			return false
		}
		for _, e := range f.AllowedEmails {
			if strings.EqualFold(e, caller) {
				return true
			}
		}
		return false
	}
	return false
}

// ListFilesSharedWith scans every user's cloud index and returns files
// that the given caller has been granted access to (via emails or domain).
func ListFilesSharedWith(caller string) []models.CloudFile {
	caller = strings.ToLower(strings.TrimSpace(caller))
	if caller == "" {
		return nil
	}
	callerDomain := domainOfEmail(caller)

	cloudDir := filepath.Join(DataDir, "cloud")
	entries, err := os.ReadDir(cloudDir)
	if err != nil {
		return nil
	}
	var out []models.CloudFile
	for _, e := range entries {
		if !e.IsDir() || e.Name() == "public" {
			continue
		}
		indexPath := filepath.Join(cloudDir, e.Name(), "index.json")
		raw, err := os.ReadFile(indexPath)
		if err != nil {
			continue
		}
		var files []models.CloudFile
		if err := json.Unmarshal(raw, &files); err != nil {
			continue
		}
		for _, f := range files {
			if strings.EqualFold(f.OwnerEmail, caller) {
				continue // own files show up in the main list
			}
			shared := false
			if f.AccessMode == "emails" {
				for _, e := range f.AllowedEmails {
					if strings.EqualFold(e, caller) {
						shared = true
						break
					}
				}
			} else if f.AccessMode == "domain" {
				shared = domainOfEmail(f.OwnerEmail) == callerDomain
			}
			if shared {
				// Never leak the share token to recipients
				f.ShareToken = ""
				out = append(out, f)
			}
		}
	}
	return out
}

// FindOwnedCloudFile looks up a file inside an owner's index.
func FindOwnedCloudFile(ownerEmail, fileID string) (*models.CloudFile, error) {
	files, err := ListCloudFiles(ownerEmail)
	if err != nil {
		return nil, err
	}
	for i := range files {
		if files[i].ID == fileID {
			return &files[i], nil
		}
	}
	return nil, os.ErrNotExist
}

// OpenCloudBlob returns an open file handle to the raw bytes of a file.
func OpenCloudBlob(ownerEmail, fileID string) (*os.File, error) {
	return os.Open(cloudBlobPath(ownerEmail, fileID))
}

// SetCloudFilePublic toggles the public flag and manages its share token.
// When isPublic flips on, a token is generated and a pointer file written
// so the /p/{token} route can locate the blob without a session.
func SetCloudFilePublic(email, fileID string, isPublic bool) (string, error) {
	cloudLock.Lock()
	defer cloudLock.Unlock()

	files, err := ListCloudFiles(email)
	if err != nil {
		return "", err
	}
	var token string
	found := false
	for i := range files {
		if files[i].ID != fileID {
			continue
		}
		found = true
		if isPublic {
			if files[i].ShareToken == "" {
				files[i].ShareToken = newShareToken()
			}
			files[i].IsPublic = true
			token = files[i].ShareToken
			// Write pointer file
			_ = os.MkdirAll(filepath.Dir(publicTokenPath(token)), 0755)
			_ = WriteJSON(publicTokenPath(token), publicRef{OwnerEmail: strings.ToLower(email), FileID: fileID})
		} else {
			if files[i].ShareToken != "" {
				_ = os.Remove(publicTokenPath(files[i].ShareToken))
			}
			files[i].IsPublic = false
			files[i].ShareToken = ""
		}
		break
	}
	if !found {
		return "", os.ErrNotExist
	}
	if err := writeCloudIndex(email, files); err != nil {
		return "", err
	}
	return token, nil
}

// ReadCloudBlobForUser opens a file blob for an authenticated download.
func ReadCloudBlobForUser(email, fileID string) (*models.CloudFile, *os.File, error) {
	files, _ := ListCloudFiles(email)
	for _, f := range files {
		if f.ID == fileID {
			fh, err := os.Open(cloudBlobPath(email, fileID))
			if err != nil {
				return nil, nil, err
			}
			return &f, fh, nil
		}
	}
	return nil, nil, os.ErrNotExist
}

// ReadCloudBlobByToken resolves a public share token to an open file.
// Increments the download counter.
func ReadCloudBlobByToken(token string) (*models.CloudFile, *os.File, error) {
	raw, err := os.ReadFile(publicTokenPath(token))
	if err != nil {
		return nil, nil, err
	}
	var ref publicRef
	if err := json.Unmarshal(raw, &ref); err != nil {
		return nil, nil, err
	}
	files, _ := ListCloudFiles(ref.OwnerEmail)
	for i := range files {
		if files[i].ID != ref.FileID {
			continue
		}
		f := files[i]
		if !f.IsPublic {
			return nil, nil, os.ErrPermission
		}
		fh, err := os.Open(cloudBlobPath(ref.OwnerEmail, f.ID))
		if err != nil {
			return nil, nil, err
		}
		// best-effort download counter
		files[i].DownloadCount++
		_ = writeCloudIndex(ref.OwnerEmail, files)
		return &f, fh, nil
	}
	return nil, nil, os.ErrNotExist
}

// TotalDomainStorage adds up used bytes across every user of a domain.
// Used to enforce per-domain caps at upload time.
func TotalDomainStorage(domain string) int64 {
	domain = strings.ToLower(domain)
	var total int64
	for _, u := range ListAllUserRecords() {
		if strings.EqualFold(u.Domain, domain) {
			total += u.StorageUsed
		}
	}
	return total
}

// recomputeUserStorage sums the user's file sizes and updates their record.
func recomputeUserStorage(email string, files []models.CloudFile) error {
	var total int64
	for _, f := range files {
		total += f.Size
	}
	return UpdateUserStorage(email, total)
}

// newFileID generates a short random ID for a file.
func newFileID() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// newShareToken generates a harder-to-guess public token.
func newShareToken() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// sanitizeCloudFilename strips path components + control characters.
func sanitizeCloudFilename(name string) string {
	name = filepath.Base(name)
	out := make([]rune, 0, len(name))
	for _, r := range name {
		if r < 32 || r == '/' || r == '\\' {
			continue
		}
		out = append(out, r)
	}
	if len(out) == 0 {
		return "file"
	}
	if len(out) > 200 {
		out = out[:200]
	}
	return string(out)
}

func nowISO() string {
	// Same format used elsewhere — inline to avoid import cycle
	return time.Now().UTC().Format(time.RFC3339)
}
