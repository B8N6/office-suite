package storage

import (
	"crypto/md5"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// LastLoginFile tracks the last-login timestamp per user (email-hashed).
// Writes are lightweight and happen on every successful /auth/login.
type LastLoginRecord struct {
	Email       string `json:"email"`
	LastLoginAt string `json:"lastLoginAt"`
	LoginCount  int    `json:"loginCount"`
}

func loginFilePath(email string) string {
	h := md5.Sum([]byte(strings.ToLower(email)))
	return filepath.Join(DataDir, "activity", fmt.Sprintf("%x.json", h))
}

// RecordLogin bumps the user's login counter and timestamp.
func RecordLogin(email string) error {
	path := loginFilePath(email)
	_ = os.MkdirAll(filepath.Dir(path), 0755)

	var rec LastLoginRecord
	if raw, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(raw, &rec)
	}
	rec.Email = email
	rec.LastLoginAt = time.Now().UTC().Format(time.RFC3339)
	rec.LoginCount++
	return WriteJSON(path, &rec)
}

// ReadLogin returns the last-login record for a user, or nil if none.
func ReadLogin(email string) *LastLoginRecord {
	path := loginFilePath(email)
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var rec LastLoginRecord
	if err := json.Unmarshal(raw, &rec); err != nil {
		return nil
	}
	return &rec
}

// ListAllUsers scans every per-user data directory and returns a unique
// list of emails that have left a footprint (logged in, saved a signature,
// scheduled an email, etc).
func ListAllUsers() []string {
	seen := map[string]bool{}
	// Walk the activity dir first — every login records here
	walkEmails(filepath.Join(DataDir, "activity"), seen)
	// Also walk signatures/filters/contacts/calendars for legacy users
	// that predate activity tracking.
	for _, sub := range []string{"signatures", "filters", "contacts", "calendars", "scheduled"} {
		walkEmailsFromHashes(filepath.Join(DataDir, sub), seen)
	}
	out := make([]string, 0, len(seen))
	for e := range seen {
		out = append(out, e)
	}
	return out
}

// walkEmails reads JSON files in a dir and pulls out `email` fields.
func walkEmails(dir string, seen map[string]bool) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			continue
		}
		var probe struct {
			Email string `json:"email"`
			User  string `json:"user"`
		}
		if err := json.Unmarshal(raw, &probe); err == nil {
			if probe.Email != "" {
				seen[strings.ToLower(probe.Email)] = true
			} else if probe.User != "" {
				seen[strings.ToLower(probe.User)] = true
			}
		}
	}
}

// walkEmailsFromHashes is best-effort; hash-only filenames can't be
// reversed, so we try to read the JSON body for user/email fields.
func walkEmailsFromHashes(dir string, seen map[string]bool) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			continue
		}
		// Try array of jobs (scheduled/tickets) first
		var arr []struct {
			User      string `json:"user"`
			UserEmail string `json:"userEmail"`
		}
		if err := json.Unmarshal(raw, &arr); err == nil && len(arr) > 0 {
			for _, it := range arr {
				if it.User != "" {
					seen[strings.ToLower(it.User)] = true
				}
				if it.UserEmail != "" {
					seen[strings.ToLower(it.UserEmail)] = true
				}
			}
			continue
		}
	}
}

// CountUserFile returns 1 if a per-user file (by md5 hash) exists for the
// given subdirectory, else 0. Used to build activity summaries.
func CountUserFile(subdir, email string) int {
	h := md5.Sum([]byte(strings.ToLower(email)))
	path := filepath.Join(DataDir, subdir, fmt.Sprintf("%x.json", h))
	if _, err := os.Stat(path); err == nil {
		return 1
	}
	return 0
}

// ReadUserJSONCount unmarshals a per-user file and counts an array field.
func ReadUserJSONCount(subdir, email, arrayField string) int {
	h := md5.Sum([]byte(strings.ToLower(email)))
	path := filepath.Join(DataDir, subdir, fmt.Sprintf("%x.json", h))
	raw, err := os.ReadFile(path)
	if err != nil {
		return 0
	}
	// Handle two shapes: { [arrayField]: [...] } OR top-level array.
	var wrapper map[string]json.RawMessage
	if err := json.Unmarshal(raw, &wrapper); err == nil {
		if v, ok := wrapper[arrayField]; ok {
			var list []any
			if err := json.Unmarshal(v, &list); err == nil {
				return len(list)
			}
		}
	}
	var list []any
	if err := json.Unmarshal(raw, &list); err == nil {
		return len(list)
	}
	return 0
}
