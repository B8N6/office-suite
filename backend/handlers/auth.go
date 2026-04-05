package handlers

import (
	"encoding/json"
	"net/http"

	imapClient "b8n6mail/imap"
	"b8n6mail/middleware"
	"b8n6mail/models"
	"b8n6mail/storage"
)

// Login authenticates a user via IMAP and creates a session.
func Login(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)

	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Email == "" || req.Password == "" {
		jsonErr(w, http.StatusBadRequest, "email and password required")
		return
	}

	// Authenticate the email against its configured IMAP server. No
	// separate admin password: admin status is inferred purely from the
	// IMAP-verified email address.
	domain, err := storage.FindDomain(req.Email)
	if err != nil || domain == nil {
		jsonErr(w, http.StatusUnauthorized, "domain not configured for this email")
		return
	}

	sess := &models.SessionData{
		Email:    req.Email,
		Password: req.Password,
		ImapHost: domain.ImapHost,
		ImapPort: domain.ImapPort,
		ImapSSL:  domain.ImapSSL,
		SmtpHost: domain.SmtpHost,
		SmtpPort: domain.SmtpPort,
		SmtpSSL:  domain.SmtpSSL,
		Name:     req.Email,
	}

	c := imapClient.New(req.Email, req.Password, sess)
	if err := c.Connect("INBOX"); err != nil {
		jsonErr(w, http.StatusUnauthorized, "authentication failed: "+err.Error())
		return
	}
	c.Close()

	middleware.SetSession(w, r, sess)
	_ = storage.RecordLogin(sess.Email)         // best-effort activity tracking
	_, _ = storage.EnsureUserRecord(sess.Email) // auto-create account + unique ID on first sight

	// Grant admin session if this IMAP-verified email is registered as an
	// admin. No separate admin password — proving control of the mailbox
	// is sufficient.
	adminRole := ""
	if a := storage.FindAdminByEmail(req.Email); a != nil {
		middleware.SetAdminSession(w, r, a.Username)
		adminRole = a.Role
	}

	jsonOK(w, map[string]any{
		"ok":              true,
		"email":           sess.Email,
		"name":            sess.Name,
		"icon":            domain.Icon,
		"iconLight":       domain.IconLight,
		"domain":          domain.Domain,
		"colorPrimary":         domain.ColorPrimary,
		"colorPrimaryDim":      domain.ColorPrimaryDim,
		"colorBackground":      domain.ColorBackground,
		"colorText":            domain.ColorText,
		"colorAccent":          domain.ColorAccent,
		"colorPrimaryLight":    domain.ColorPrimaryLight,
		"colorPrimaryDimLight": domain.ColorPrimaryDimLight,
		"colorBackgroundLight": domain.ColorBackgroundLight,
		"colorTextLight":       domain.ColorTextLight,
		"colorAccentLight":     domain.ColorAccentLight,
		"isAdmin":              adminRole != "",
		"adminRole":            adminRole,
	})
}

// Logout destroys both the user and any paired admin session.
func Logout(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	middleware.ClearSession(w, r)
	middleware.ClearAdminSession(w, r) // drop the linked admin session too
	jsonOK(w, map[string]bool{"ok": true})
}

// Me returns the currently authenticated user's info.
func Me(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	// Look up domain branding for this session's domain (best effort)
	out := map[string]any{
		"ok":    true,
		"email": sess.Email,
		"name":  sess.Name,
	}
	if d, err := storage.FindDomain(sess.Email); err == nil {
		out["icon"] = d.Icon
		out["iconLight"] = d.IconLight
		out["domain"] = d.Domain
		out["colorPrimary"] = d.ColorPrimary
		out["colorPrimaryDim"] = d.ColorPrimaryDim
		out["colorBackground"] = d.ColorBackground
		out["colorText"] = d.ColorText
		out["colorAccent"] = d.ColorAccent
		out["colorPrimaryLight"] = d.ColorPrimaryLight
		out["colorPrimaryDimLight"] = d.ColorPrimaryDimLight
		out["colorBackgroundLight"] = d.ColorBackgroundLight
		out["colorTextLight"] = d.ColorTextLight
		out["colorAccentLight"] = d.ColorAccentLight
	}
	// Admin flag — set when this email is linked to an admin account.
	// The admin session itself is established during /auth/login when the
	// passwords match; the admin page re-checks that session on entry.
	if a := storage.FindAdminByEmail(sess.Email); a != nil {
		out["isAdmin"] = true
		out["adminRole"] = a.Role
		out["adminSessionActive"] = middleware.GetAdminSession(r) != ""
	}
	jsonOK(w, out)
}
