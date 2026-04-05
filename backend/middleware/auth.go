package middleware

import (
	"encoding/json"
	"net/http"

	"b8n6mail/models"

	"github.com/gorilla/sessions"
)

const (
	sessionName      = "b8n6mail"
	adminSessionName = "b8n6admin"
)

// Store is the gorilla sessions store. Initialised by main.go.
var Store *sessions.FilesystemStore

// SecureCookies toggles the Secure flag on session cookies. Set by main.go
// based on the SECURE_COOKIES env var / config. Keep false for local HTTP
// development, true behind HTTPS in production.
var SecureCookies bool

// RequireAuth is middleware that rejects unauthenticated requests.
func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sess, err := Store.Get(r, sessionName)
		if err != nil || sess.Values["email"] == nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RequireAdmin is middleware that rejects non-admin requests.
func RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sess, err := Store.Get(r, adminSessionName)
		if err != nil || sess.Values["admin_ok"] == nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

// GetSession reads the user session data from the request.
func GetSession(r *http.Request) *models.SessionData {
	sess, err := Store.Get(r, sessionName)
	if err != nil {
		return nil
	}
	email, ok := sess.Values["email"].(string)
	if !ok || email == "" {
		return nil
	}
	sd := &models.SessionData{
		Email: email,
	}
	if v, ok := sess.Values["password"].(string); ok {
		sd.Password = v
	}
	if v, ok := sess.Values["name"].(string); ok {
		sd.Name = v
	}
	if v, ok := sess.Values["imap_host"].(string); ok {
		sd.ImapHost = v
	}
	if v, ok := sess.Values["imap_port"].(int); ok {
		sd.ImapPort = v
	}
	if v, ok := sess.Values["imap_ssl"].(bool); ok {
		sd.ImapSSL = v
	}
	if v, ok := sess.Values["smtp_host"].(string); ok {
		sd.SmtpHost = v
	}
	if v, ok := sess.Values["smtp_port"].(int); ok {
		sd.SmtpPort = v
	}
	if v, ok := sess.Values["smtp_ssl"].(bool); ok {
		sd.SmtpSSL = v
	}
	return sd
}

// SetSession writes the session data to the response.
func SetSession(w http.ResponseWriter, r *http.Request, data *models.SessionData) {
	sess, _ := Store.Get(r, sessionName)
	sess.Values["email"] = data.Email
	sess.Values["password"] = data.Password
	sess.Values["name"] = data.Name
	sess.Values["imap_host"] = data.ImapHost
	sess.Values["imap_port"] = data.ImapPort
	sess.Values["imap_ssl"] = data.ImapSSL
	sess.Values["smtp_host"] = data.SmtpHost
	sess.Values["smtp_port"] = data.SmtpPort
	sess.Values["smtp_ssl"] = data.SmtpSSL
	sess.Options = &sessions.Options{
		Path:     "/",
		MaxAge:   86400 * 7,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   SecureCookies,
	}
	sess.Save(r, w)
}

// ClearSession destroys the user session.
func ClearSession(w http.ResponseWriter, r *http.Request) {
	sess, _ := Store.Get(r, sessionName)
	sess.Options = &sessions.Options{MaxAge: -1}
	sess.Save(r, w)
}

// GetAdminSession returns the admin username from session, or empty string.
func GetAdminSession(r *http.Request) string {
	sess, err := Store.Get(r, adminSessionName)
	if err != nil {
		return ""
	}
	v, _ := sess.Values["admin_ok"].(string)
	return v
}

// SetAdminSession marks the admin as authenticated.
func SetAdminSession(w http.ResponseWriter, r *http.Request, username string) {
	sess, _ := Store.Get(r, adminSessionName)
	sess.Values["admin_ok"] = username
	sess.Options = &sessions.Options{
		Path:     "/",
		MaxAge:   86400 * 7,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   SecureCookies,
	}
	sess.Save(r, w)
}

// ClearAdminSession destroys the admin session.
func ClearAdminSession(w http.ResponseWriter, r *http.Request) {
	sess, _ := Store.Get(r, adminSessionName)
	sess.Options = &sessions.Options{MaxAge: -1}
	sess.Save(r, w)
}
