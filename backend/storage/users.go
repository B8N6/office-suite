package storage

import (
	"crypto/md5"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"b8n6mail/models"

	"github.com/google/uuid"
)

func userRecordPath(email string) string {
	h := md5.Sum([]byte(strings.ToLower(email)))
	return filepath.Join(DataDir, "users", fmt.Sprintf("%x.json", h))
}

// EnsureUserRecord creates the user's account record on first sight and
// bumps lastSeenAt on every call. Returns the current record.
func EnsureUserRecord(email string) (*models.UserRecord, error) {
	path := userRecordPath(email)
	_ = os.MkdirAll(filepath.Dir(path), 0755)
	now := time.Now().UTC().Format(time.RFC3339)

	var rec models.UserRecord
	if raw, err := os.ReadFile(path); err == nil {
		if err := json.Unmarshal(raw, &rec); err == nil && rec.ID != "" {
			rec.LastSeenAt = now
			_ = WriteJSON(path, &rec)
			return &rec, nil
		}
	}

	// Fresh record
	rec = models.UserRecord{
		ID:         uuid.NewString(),
		Email:      strings.ToLower(email),
		Domain:     domainOfEmail(email),
		CreatedAt:  now,
		LastSeenAt: now,
	}
	if err := WriteJSON(path, &rec); err != nil {
		return nil, err
	}
	return &rec, nil
}

// ReadUserRecord fetches a user record by email (nil if not found).
func ReadUserRecord(email string) *models.UserRecord {
	raw, err := os.ReadFile(userRecordPath(email))
	if err != nil {
		return nil
	}
	var rec models.UserRecord
	if err := json.Unmarshal(raw, &rec); err != nil {
		return nil
	}
	return &rec
}

// UpdateUserStorage sets the stored-bytes total on a user record.
func UpdateUserStorage(email string, bytes int64) error {
	rec := ReadUserRecord(email)
	if rec == nil {
		var err error
		rec, err = EnsureUserRecord(email)
		if err != nil {
			return err
		}
	}
	rec.StorageUsed = bytes
	return WriteJSON(userRecordPath(email), rec)
}

// ListAllUserRecords returns every user record on disk.
func ListAllUserRecords() []models.UserRecord {
	dir := filepath.Join(DataDir, "users")
	entries, err := os.ReadDir(dir)
	if err != nil {
		return []models.UserRecord{}
	}
	var out []models.UserRecord
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			continue
		}
		var rec models.UserRecord
		if err := json.Unmarshal(raw, &rec); err != nil {
			continue
		}
		out = append(out, rec)
	}
	return out
}
