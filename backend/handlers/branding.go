package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"b8n6mail/middleware"
	"b8n6mail/models"
	"b8n6mail/storage"
)

// GetBranding is a PUBLIC endpoint that returns the current branding config.
// Frontend loads this on every page to theme the UI.
func GetBranding(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	b, err := storage.ReadBranding()
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "read branding: "+err.Error())
		return
	}
	jsonOK(w, b)
}

// UpdateBranding is OWNER-ONLY. Global branding affects every user of every
// domain, so non-owner admins must not be able to deface the app.
func UpdateBranding(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	// Inline owner check (requireOwner lives in admin.go same package)
	caller := storage.FindAdminByUsername(middleware.GetAdminSession(r))
	if caller == nil || caller.Role != "owner" {
		jsonErr(w, http.StatusForbidden, "owner role required")
		return
	}

	cur, _ := storage.ReadBranding()
	if cur == nil {
		d := models.DefaultBranding()
		cur = &d
	}
	// Decode partial update over current config.
	if err := json.NewDecoder(r.Body).Decode(cur); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	// Enforce reasonable size limits on base64 data URLs to keep
	// branding.json and downstream responses small.
	const maxLogoBytes = 300 * 1024   // 300KB
	const maxFaviconBytes = 100 * 1024 // 100KB
	if len(cur.Logo) > maxLogoBytes {
		jsonErr(w, http.StatusBadRequest, "dark-mode logo exceeds 300KB")
		return
	}
	if len(cur.LogoLight) > maxLogoBytes {
		jsonErr(w, http.StatusBadRequest, "light-mode logo exceeds 300KB")
		return
	}
	if len(cur.Favicon) > maxFaviconBytes {
		jsonErr(w, http.StatusBadRequest, "favicon exceeds 100KB")
		return
	}
	cur.Updated = time.Now().UTC().Format(time.RFC3339)

	if err := storage.WriteBranding(cur); err != nil {
		jsonErr(w, http.StatusInternalServerError, "failed to save branding")
		return
	}
	jsonOK(w, map[string]any{"ok": true, "branding": cur})
}
