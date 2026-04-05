package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"b8n6mail/middleware"
	"b8n6mail/models"
	"b8n6mail/storage"

	"github.com/gorilla/mux"
)

// Default cloud limits when a domain doesn't set its own.
const (
	defaultMaxFileMB      = 25  // per-file upload
	defaultMaxUserMB      = 500 // per-user quota
	defaultMaxDomainMB    = 10 * 1024 // 10 GB per domain
	maxMultipartFormBytes = 200 << 20 // 200MB — enough for one file at domain cap
)

// CloudQuota is the response shape for GET /api/cloud/quota.
type CloudQuota struct {
	StorageUsed        int64 `json:"storageUsed"`        // bytes
	StorageLimit       int64 `json:"storageLimit"`       // bytes (per-user cap)
	MaxFileSize        int64 `json:"maxFileSize"`        // bytes
	DomainStorageUsed  int64 `json:"domainStorageUsed"`  // bytes
	DomainStorageLimit int64 `json:"domainStorageLimit"` // bytes
}

// GetCloudQuota returns the current user's cloud quota + usage info.
func GetCloudQuota(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	q := buildQuotaFor(sess.Email)
	jsonOK(w, q)
}

// buildQuotaFor resolves the effective limits for an email's domain.
func buildQuotaFor(email string) CloudQuota {
	rec := storage.ReadUserRecord(email)
	var used int64
	if rec != nil {
		used = rec.StorageUsed
	}
	maxFile := int64(defaultMaxFileMB)
	maxUser := int64(defaultMaxUserMB)
	maxDomain := int64(defaultMaxDomainMB)
	domainName := ""
	if d, err := storage.FindDomain(email); err == nil && d != nil {
		domainName = d.Domain
		if d.MaxFileSizeMB > 0 {
			maxFile = int64(d.MaxFileSizeMB)
		}
		if d.MaxUserStorageMB > 0 {
			maxUser = int64(d.MaxUserStorageMB)
		}
		if d.MaxDomainStorageMB > 0 {
			maxDomain = int64(d.MaxDomainStorageMB)
		}
	}
	var domainUsed int64
	if domainName != "" {
		domainUsed = storage.TotalDomainStorage(domainName)
	}
	return CloudQuota{
		StorageUsed:        used,
		StorageLimit:       maxUser * 1024 * 1024,
		MaxFileSize:        maxFile * 1024 * 1024,
		DomainStorageUsed:  domainUsed,
		DomainStorageLimit: maxDomain * 1024 * 1024,
	}
}

// ListCloudFiles returns all files belonging to the current user.
func ListCloudFiles(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	files, err := storage.ListCloudFiles(sess.Email)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "read files: "+err.Error())
		return
	}
	// Strip share tokens from API response — only deliver them via the
	// ToggleCloudPublic endpoint (so they don't leak into listing logs).
	for i := range files {
		if files[i].IsPublic {
			continue
		}
		files[i].ShareToken = ""
	}
	jsonOK(w, map[string]any{"files": files})
}

// UploadCloudFile accepts a multipart form with one file, enforces quotas,
// and saves it to the user's cloud storage.
func UploadCloudFile(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	if err := r.ParseMultipartForm(maxMultipartFormBytes); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid upload: "+err.Error())
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "no file provided")
		return
	}
	defer file.Close()

	q := buildQuotaFor(sess.Email)
	if header.Size > q.MaxFileSize {
		jsonErr(w, http.StatusRequestEntityTooLarge,
			fmt.Sprintf("file exceeds per-file limit of %d MB", q.MaxFileSize/1024/1024))
		return
	}
	if q.StorageLimit > 0 && q.StorageUsed+header.Size > q.StorageLimit {
		jsonErr(w, http.StatusInsufficientStorage,
			fmt.Sprintf("per-user storage quota exhausted (%d MB)", q.StorageLimit/1024/1024))
		return
	}
	if q.DomainStorageLimit > 0 && q.DomainStorageUsed+header.Size > q.DomainStorageLimit {
		jsonErr(w, http.StatusInsufficientStorage, "domain storage quota exhausted")
		return
	}

	mime := header.Header.Get("Content-Type")
	if mime == "" {
		mime = "application/octet-stream"
	}
	rec, err := storage.SaveCloudBlob(sess.Email, header.Filename, mime, file, header.Size)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "save file: "+err.Error())
		return
	}
	jsonOK(w, map[string]any{"ok": true, "file": rec})
}

// DeleteCloudFile removes a file owned by the current user.
func DeleteCloudFile(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	id := mux.Vars(r)["id"]
	if err := storage.DeleteCloudFile(sess.Email, id); err != nil {
		jsonErr(w, http.StatusNotFound, "file not found")
		return
	}
	jsonOK(w, map[string]bool{"ok": true})
}

// ToggleCloudPublic flips the public-share flag on a file and returns
// the share URL path.
func ToggleCloudPublic(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	id := mux.Vars(r)["id"]
	var req struct {
		IsPublic bool `json:"isPublic"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	token, err := storage.SetCloudFilePublic(sess.Email, id, req.IsPublic)
	if err != nil {
		jsonErr(w, http.StatusNotFound, "file not found")
		return
	}
	resp := map[string]any{"ok": true, "isPublic": req.IsPublic, "shareToken": token}
	if req.IsPublic && token != "" {
		resp["shareUrl"] = "/p/" + token
	}
	jsonOK(w, resp)
}

// SetCloudFileAccess updates a file's access mode and allowed-email list.
// Called by the owner via the share modal.
func SetCloudFileAccess(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	id := mux.Vars(r)["id"]
	var req struct {
		Mode          string   `json:"mode"`
		AllowedEmails []string `json:"allowedEmails"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	rec, err := storage.SetCloudFileAccess(sess.Email, id, req.Mode, req.AllowedEmails)
	if err != nil {
		jsonErr(w, http.StatusNotFound, "file not found")
		return
	}
	resp := map[string]any{"ok": true, "file": rec}
	if rec.AccessMode == "public" && rec.ShareToken != "" {
		resp["shareUrl"] = "/p/" + rec.ShareToken
	}
	jsonOK(w, resp)
}

// ListSharedWithMe returns all files other users have shared with the caller
// (via "emails" ACL or same-domain rule).
func ListSharedWithMe(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	files := storage.ListFilesSharedWith(sess.Email)
	if files == nil {
		files = []models.CloudFile{}
	}
	jsonOK(w, map[string]any{"files": files})
}

// DownloadSharedFile lets a recipient download a file an owner has shared
// with them. The URL is /api/cloud/shared/{owner}/{id}/download — we need
// the owner in the path because file IDs live under the owner's index.
func DownloadSharedFile(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	ownerEmail := mux.Vars(r)["owner"]
	fileID := mux.Vars(r)["id"]
	meta, err := storage.FindOwnedCloudFile(ownerEmail, fileID)
	if err != nil {
		jsonErr(w, http.StatusNotFound, "file not found")
		return
	}
	if !storage.CanUserAccessFile(meta, sess.Email) {
		jsonErr(w, http.StatusForbidden, "access denied")
		return
	}
	fh, err := storage.OpenCloudBlob(ownerEmail, fileID)
	if err != nil {
		jsonErr(w, http.StatusNotFound, "file not found")
		return
	}
	defer fh.Close()
	streamFile(w, meta.Name, meta.MimeType, meta.Size, fh)
}

// DownloadCloudFile streams an authenticated download to the owner.
func DownloadCloudFile(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	id := mux.Vars(r)["id"]
	meta, fh, err := storage.ReadCloudBlobForUser(sess.Email, id)
	if err != nil {
		jsonErr(w, http.StatusNotFound, "file not found")
		return
	}
	defer fh.Close()
	streamFile(w, meta.Name, meta.MimeType, meta.Size, fh)
}

// PublicDownloadCloudFile resolves a share token and streams the file
// without requiring authentication.
func PublicDownloadCloudFile(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	token := mux.Vars(r)["token"]
	if token == "" {
		http.Error(w, "missing token", http.StatusBadRequest)
		return
	}
	meta, fh, err := storage.ReadCloudBlobByToken(token)
	if err != nil {
		http.Error(w, "not found or unshared", http.StatusNotFound)
		return
	}
	defer fh.Close()
	streamFile(w, meta.Name, meta.MimeType, meta.Size, fh)
}

// streamFile writes an HTTP download response with proper headers.
func streamFile(w http.ResponseWriter, name, mime string, size int64, fh interface {
	Read([]byte) (int, error)
}) {
	if mime == "" {
		mime = "application/octet-stream"
	}
	w.Header().Set("Content-Type", mime)
	w.Header().Set("Content-Length", fmt.Sprintf("%d", size))
	safeName := strings.NewReplacer("\r", "", "\n", "", `"`, "", `\`, "").Replace(name)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, safeName))
	buf := make([]byte, 64*1024)
	for {
		n, err := fh.Read(buf)
		if n > 0 {
			_, _ = w.Write(buf[:n])
		}
		if err != nil {
			return
		}
	}
}

// -----------------------------------------------------------------------
// Admin-side
// -----------------------------------------------------------------------

// AdminListStorage returns per-user storage usage (scoped to assigned domains).
func AdminListStorage(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	allowed, _ := getAdminDomainScope(r)
	records := storage.ListAllUserRecords()
	var out []any
	for _, u := range records {
		if allowed != nil && !allowed[u.Domain] {
			continue
		}
		out = append(out, map[string]any{
			"email":       u.Email,
			"domain":      u.Domain,
			"storageUsed": u.StorageUsed,
			"createdAt":   u.CreatedAt,
			"lastSeenAt":  u.LastSeenAt,
		})
	}
	if out == nil {
		out = []any{}
	}
	jsonOK(w, map[string]any{"users": out})
}
