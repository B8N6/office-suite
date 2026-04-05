package storage

import (
	"encoding/json"
	"os"
	"strings"
	"time"

	"b8n6mail/models"

	"github.com/google/uuid"
)

const adminFile = "admin.json"

// ReadAdminStore returns the admin users list. If the file is in the legacy
// single-admin format, it's migrated to the new multi-admin format on the fly.
func ReadAdminStore() (*models.AdminStore, error) {
	path := FilePath(adminFile)
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &models.AdminStore{Version: 2, Users: []models.AdminUser{}}, nil
		}
		return nil, err
	}

	// Try new format first
	var store models.AdminStore
	if err := json.Unmarshal(raw, &store); err == nil && store.Version >= 2 {
		// Migration: backfill Email for any admin user that's missing one.
		// The seeded "admin" user gets "admin@b8n6.com" by default.
		migrated := false
		for i := range store.Users {
			if store.Users[i].Email == "" {
				if store.Users[i].Username == "admin" {
					store.Users[i].Email = "admin@b8n6.com"
				} else {
					// Default: use the username + @b8n6.com
					store.Users[i].Email = strings.ToLower(store.Users[i].Username) + "@b8n6.com"
				}
				migrated = true
			}
		}
		if migrated {
			_ = WriteAdminStore(&store)
		}
		return &store, nil
	}

	// Try legacy format and migrate
	var legacy models.AdminConfig
	if err := json.Unmarshal(raw, &legacy); err == nil && legacy.Username != "" {
		email := strings.ToLower(legacy.Username) + "@b8n6.com"
		if legacy.Username == "admin" {
			email = "admin@b8n6.com"
		}
		migrated := &models.AdminStore{
			Version: 2,
			Users: []models.AdminUser{{
				ID:           uuid.NewString(),
				Email:        email,
				Username:     legacy.Username,
				PasswordHash: legacy.PasswordHash,
				Role:         "owner",
				CreatedAt:    time.Now().UTC().Format(time.RFC3339),
			}},
		}
		_ = WriteAdminStore(migrated)
		return migrated, nil
	}

	return &models.AdminStore{Version: 2, Users: []models.AdminUser{}}, nil
}

// WriteAdminStore persists the multi-admin store.
func WriteAdminStore(s *models.AdminStore) error {
	if s.Version == 0 {
		s.Version = 2
	}
	return WriteJSON(FilePath(adminFile), s)
}

// FindAdminByUsername returns the admin with the given username OR email,
// or nil if none matches. Case-insensitive.
func FindAdminByUsername(identifier string) *models.AdminUser {
	store, err := ReadAdminStore()
	if err != nil {
		return nil
	}
	id := strings.ToLower(strings.TrimSpace(identifier))
	for i := range store.Users {
		if strings.ToLower(store.Users[i].Username) == id ||
			strings.ToLower(store.Users[i].Email) == id {
			return &store.Users[i]
		}
	}
	return nil
}

// FindAdminByEmail is an explicit email-only lookup for clarity in callers.
func FindAdminByEmail(email string) *models.AdminUser {
	store, err := ReadAdminStore()
	if err != nil {
		return nil
	}
	id := strings.ToLower(strings.TrimSpace(email))
	for i := range store.Users {
		if strings.ToLower(store.Users[i].Email) == id {
			return &store.Users[i]
		}
	}
	return nil
}

// UpdateAdminPassword replaces a user's password hash by ID.
func UpdateAdminPassword(id, newHash string) error {
	store, err := ReadAdminStore()
	if err != nil {
		return err
	}
	for i := range store.Users {
		if store.Users[i].ID == id {
			store.Users[i].PasswordHash = newHash
			return WriteAdminStore(store)
		}
	}
	return os.ErrNotExist
}

// Legacy compatibility helpers (still used by AdminChangePassword/initial seed)
func ReadAdmin() (*models.AdminConfig, error) {
	store, err := ReadAdminStore()
	if err != nil || len(store.Users) == 0 {
		return &models.AdminConfig{}, err
	}
	u := store.Users[0]
	return &models.AdminConfig{Username: u.Username, PasswordHash: u.PasswordHash}, nil
}

func WriteAdmin(cfg *models.AdminConfig) error {
	store, _ := ReadAdminStore()
	if len(store.Users) == 0 {
		store.Users = append(store.Users, models.AdminUser{
			ID:           uuid.NewString(),
			Username:     cfg.Username,
			PasswordHash: cfg.PasswordHash,
			Role:         "owner",
			CreatedAt:    time.Now().UTC().Format(time.RFC3339),
		})
	} else {
		store.Users[0].Username = cfg.Username
		store.Users[0].PasswordHash = cfg.PasswordHash
	}
	return WriteAdminStore(store)
}
