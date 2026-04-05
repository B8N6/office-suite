package handlers

import (
	"encoding/json"
	"net/http"
	"regexp"

	"b8n6mail/middleware"
	"b8n6mail/models"
	"b8n6mail/storage"
)

const signaturesDir = "signatures"

// GetSignature returns the user's current signature.
func GetSignature(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	var sig models.Signature
	_ = storage.ReadUserJSON(signaturesDir, sess.Email, &sig)
	jsonOK(w, sig)
}

// SaveSignature stores the user's signature after sanitizing HTML.
func SaveSignature(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	var sig models.Signature
	if err := json.NewDecoder(r.Body).Decode(&sig); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid request body")
		return
	}

	sig.HTML = sanitizeHTML(sig.HTML)

	if err := storage.WriteUserJSON(signaturesDir, sess.Email, sig); err != nil {
		jsonErr(w, http.StatusInternalServerError, "save failed: "+err.Error())
		return
	}

	jsonOK(w, map[string]bool{"ok": true})
}

var (
	reScriptTag  = regexp.MustCompile(`(?i)<script[\s\S]*?</script>`)
	reOnEvent    = regexp.MustCompile(`(?i)\s+on\w+\s*=\s*"[^"]*"`)
	reOnEventSQ  = regexp.MustCompile(`(?i)\s+on\w+\s*=\s*'[^']*'`)
	reJavascript = regexp.MustCompile(`(?i)javascript\s*:`)
)

func sanitizeHTML(html string) string {
	html = reScriptTag.ReplaceAllString(html, "")
	html = reOnEvent.ReplaceAllString(html, "")
	html = reOnEventSQ.ReplaceAllString(html, "")
	html = reJavascript.ReplaceAllString(html, "#")
	return html
}
