package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"b8n6mail/middleware"
	"b8n6mail/models"
	"b8n6mail/storage"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
)

// AdminLogin is retained only for backward-compat. Admins now log in via
// the unified /api/auth/login endpoint using their mailbox password.
// This endpoint returns 410 Gone so clients know to migrate.
func AdminLogin(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	jsonErr(w, http.StatusGone, "admin login moved — use /api/auth/login with your email and mailbox password")
}

// AdminLogout destroys the admin session.
func AdminLogout(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	middleware.ClearAdminSession(w, r)
	jsonOK(w, map[string]bool{"ok": true})
}

// AdminMe returns the currently authenticated admin, or 401.
func AdminMe(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	username := middleware.GetAdminSession(r)
	if username == "" {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	user := storage.FindAdminByUsername(username)
	if user == nil {
		jsonErr(w, http.StatusUnauthorized, "admin not found")
		return
	}
	jsonOK(w, map[string]any{
		"ok":       true,
		"username": user.Username,
		"role":     user.Role,
	})
}

// ListDomains returns all domains for owners, or only the assigned
// domains for scoped admins.
func ListDomains(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	domains, err := storage.ReadDomains()
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "read domains: "+err.Error())
		return
	}
	caller := storage.FindAdminByUsername(middleware.GetAdminSession(r))
	if caller != nil && caller.Role != "owner" {
		allowed := map[string]bool{}
		for _, id := range caller.AssignedDomains {
			allowed[id] = true
		}
		filtered := domains[:0]
		for _, d := range domains {
			if allowed[d.ID] {
				filtered = append(filtered, d)
			}
		}
		domains = filtered
	}
	jsonOK(w, map[string]any{"domains": domains})
}

// requireOwner rejects the request if the caller isn't an owner.
// Returns true if the check passed (i.e. caller is an owner).
func requireOwner(w http.ResponseWriter, r *http.Request) bool {
	caller := storage.FindAdminByUsername(middleware.GetAdminSession(r))
	if caller == nil || caller.Role != "owner" {
		jsonErr(w, http.StatusForbidden, "owner role required")
		return false
	}
	return true
}

// adminCanEditDomain returns true if the caller may modify the given domain.
func adminCanEditDomain(r *http.Request, domainID string) bool {
	caller := storage.FindAdminByUsername(middleware.GetAdminSession(r))
	if caller == nil {
		return false
	}
	if caller.Role == "owner" {
		return true
	}
	for _, id := range caller.AssignedDomains {
		if id == domainID {
			return true
		}
	}
	return false
}

// CreateDomain adds a new domain configuration. Owner-only.
func CreateDomain(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	if !requireOwner(w, r) {
		return
	}

	var d models.Domain
	if err := json.NewDecoder(r.Body).Decode(&d); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if d.Domain == "" {
		jsonErr(w, http.StatusBadRequest, "domain required")
		return
	}
	now := time.Now().UTC().Format(time.RFC3339)
	d.ID = uuid.New().String()
	d.Created = now
	d.Updated = now
	d.Active = true

	domains, _ := storage.ReadDomains()
	domains = append(domains, d)
	if err := storage.WriteDomains(domains); err != nil {
		jsonErr(w, http.StatusInternalServerError, "failed to save domain data")
		return
	}
	jsonOK(w, map[string]any{"ok": true, "domain": d})
}

// UpdateDomain modifies an existing domain. Requires the caller to have
// edit access (owner or domain assigned).
func UpdateDomain(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)

	id := mux.Vars(r)["id"]
	if !adminCanEditDomain(r, id) {
		jsonErr(w, http.StatusForbidden, "not authorised to edit this domain")
		return
	}
	var d models.Domain
	if err := json.NewDecoder(r.Body).Decode(&d); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	d.ID = id
	d.Updated = time.Now().UTC().Format(time.RFC3339)

	domains, _ := storage.ReadDomains()
	found := false
	for i := range domains {
		if domains[i].ID == id {
			d.Created = domains[i].Created
			domains[i] = d
			found = true
			break
		}
	}
	if !found {
		jsonErr(w, http.StatusNotFound, "domain not found")
		return
	}
	if err := storage.WriteDomains(domains); err != nil {
		jsonErr(w, http.StatusInternalServerError, "failed to save domain data")
		return
	}
	jsonOK(w, map[string]any{"ok": true, "domain": d})
}

// DeleteDomain removes a domain configuration. Owner-only.
func DeleteDomain(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	if !requireOwner(w, r) {
		return
	}

	id := mux.Vars(r)["id"]
	domains, _ := storage.ReadDomains()
	updated := domains[:0]
	for _, d := range domains {
		if d.ID != id {
			updated = append(updated, d)
		}
	}
	if err := storage.WriteDomains(updated); err != nil {
		jsonErr(w, http.StatusInternalServerError, "failed to save domain data")
		return
	}
	jsonOK(w, map[string]bool{"ok": true})
}

// ListAdminUsers returns all admin users (without password hashes).
// Owner-only: enumeration of admin accounts is a recon vector for
// attackers targeting the panel.
func ListAdminUsers(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	if !requireOwner(w, r) {
		return
	}
	store, err := storage.ReadAdminStore()
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "read admins")
		return
	}
	// Strip password hashes from response
	users := make([]models.AdminUser, len(store.Users))
	for i, u := range store.Users {
		users[i] = u
		users[i].PasswordHash = ""
	}
	jsonOK(w, map[string]any{"users": users})
}

// CreateAdminUser adds a new admin. Owner-only.
func CreateAdminUser(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	if !requireOwner(w, r) {
		return
	}
	var req struct {
		Email           string   `json:"email"`
		Username        string   `json:"username"`
		Role            string   `json:"role"`
		AssignedDomains []string `json:"assignedDomains"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Email == "" || !strings.Contains(req.Email, "@") {
		jsonErr(w, http.StatusBadRequest, "valid email required")
		return
	}
	// Verify the email belongs to a configured mail domain — otherwise the
	// user would never be able to log in and gain admin access.
	if _, err := storage.FindDomain(req.Email); err != nil {
		jsonErr(w, http.StatusBadRequest, "email's domain is not configured; add the domain first")
		return
	}
	if req.Username == "" {
		req.Username = strings.Split(req.Email, "@")[0]
	}
	if req.Role != "owner" && req.Role != "admin" {
		req.Role = "admin"
	}
	if req.AssignedDomains == nil {
		req.AssignedDomains = []string{}
	}

	store, _ := storage.ReadAdminStore()
	for _, u := range store.Users {
		if strings.EqualFold(u.Email, req.Email) {
			jsonErr(w, http.StatusConflict, "email is already an admin")
			return
		}
	}

	u := models.AdminUser{
		ID:              uuid.NewString(),
		Email:           req.Email,
		Username:        req.Username,
		Role:            req.Role,
		AssignedDomains: req.AssignedDomains,
		CreatedAt:       time.Now().UTC().Format(time.RFC3339),
	}
	store.Users = append(store.Users, u)
	if err := storage.WriteAdminStore(store); err != nil {
		jsonErr(w, http.StatusInternalServerError, "failed to save admin data")
		return
	}
	jsonOK(w, map[string]any{"ok": true, "user": u})
}

// UpdateAdminUser updates role / assigned domains on an existing admin.
// Owner-only operation.
func UpdateAdminUser(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	if !requireOwner(w, r) {
		return
	}
	id := mux.Vars(r)["id"]

	var req struct {
		Email           *string  `json:"email"`
		Username        *string  `json:"username"`
		Role            string   `json:"role"`
		AssignedDomains []string `json:"assignedDomains"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Role != "" && req.Role != "owner" && req.Role != "admin" {
		jsonErr(w, http.StatusBadRequest, "invalid role")
		return
	}
	if req.AssignedDomains == nil {
		req.AssignedDomains = []string{}
	}
	// Normalise/validate email if caller is changing it.
	if req.Email != nil {
		e := strings.ToLower(strings.TrimSpace(*req.Email))
		if e == "" || !strings.Contains(e, "@") {
			jsonErr(w, http.StatusBadRequest, "valid email required")
			return
		}
		if _, err := storage.FindDomain(e); err != nil {
			jsonErr(w, http.StatusBadRequest, "email's domain is not configured")
			return
		}
		*req.Email = e
	}

	store, _ := storage.ReadAdminStore()
	// Check for email conflict with other users
	if req.Email != nil {
		for _, u := range store.Users {
			if u.ID != id && strings.EqualFold(u.Email, *req.Email) {
				jsonErr(w, http.StatusConflict, "email is already used by another admin")
				return
			}
		}
	}
	found := false
	for i := range store.Users {
		if store.Users[i].ID == id {
			if req.Email != nil {
				store.Users[i].Email = *req.Email
			}
			if req.Username != nil {
				store.Users[i].Username = *req.Username
			}
			if req.Role != "" {
				// Prevent demoting the last owner — the system needs at
				// least one owner to manage domains/admins/branding.
				if store.Users[i].Role == "owner" && req.Role != "owner" {
					owners := 0
					for _, u := range store.Users {
						if u.Role == "owner" {
							owners++
						}
					}
					if owners <= 1 {
						jsonErr(w, http.StatusBadRequest, "cannot demote the last owner")
						return
					}
				}
				store.Users[i].Role = req.Role
			}
			store.Users[i].AssignedDomains = req.AssignedDomains
			found = true
			break
		}
	}
	if !found {
		jsonErr(w, http.StatusNotFound, "user not found")
		return
	}
	if err := storage.WriteAdminStore(store); err != nil {
		jsonErr(w, http.StatusInternalServerError, "failed to save admin data")
		return
	}
	jsonOK(w, map[string]bool{"ok": true})
}

// DeleteAdminUser removes an admin. Owner-only. Refuses to delete the last owner.
func DeleteAdminUser(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	if !requireOwner(w, r) {
		return
	}
	id := mux.Vars(r)["id"]
	store, _ := storage.ReadAdminStore()

	// Count owners
	ownerCount := 0
	for _, u := range store.Users {
		if u.Role == "owner" {
			ownerCount++
		}
	}

	kept := store.Users[:0]
	removedIsOwner := false
	for _, u := range store.Users {
		if u.ID == id {
			if u.Role == "owner" && ownerCount <= 1 {
				jsonErr(w, http.StatusBadRequest, "cannot delete the last owner")
				return
			}
			removedIsOwner = u.Role == "owner"
			continue
		}
		kept = append(kept, u)
	}
	_ = removedIsOwner
	if len(kept) == len(store.Users) {
		jsonErr(w, http.StatusNotFound, "user not found")
		return
	}
	store.Users = kept
	if err := storage.WriteAdminStore(store); err != nil {
		jsonErr(w, http.StatusInternalServerError, "failed to save admin data")
		return
	}
	jsonOK(w, map[string]bool{"ok": true})
}

// ResetAdminPassword is gone — admins no longer have passwords. Returns 410.
func ResetAdminPassword(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	jsonErr(w, http.StatusGone, "admins authenticate via their mailbox — no password to reset")
}

// AdminChangePassword is gone — admins no longer have passwords. Returns 410.
func AdminChangePassword(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	jsonErr(w, http.StatusGone, "admins authenticate via their mailbox — change your mailbox password instead")
}
