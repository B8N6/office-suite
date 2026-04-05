package handlers

import (
	"encoding/json"
	"net/http"

	imapClient "b8n6mail/imap"
	"b8n6mail/middleware"
)

// GetAccount returns the current user's display info.
func GetAccount(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	jsonOK(w, map[string]any{
		"name":  sess.Name,
		"email": sess.Email,
	})
}

// UpdateAccount handles account updates (name or password).
func UpdateAccount(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	var req struct {
		Action          string `json:"action"`
		Name            string `json:"name"`
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid request body")
		return
	}

	switch req.Action {
	case "update_name":
		if req.Name == "" {
			jsonErr(w, http.StatusBadRequest, "name required")
			return
		}
		sess.Name = req.Name
		middleware.SetSession(w, r, sess)

	case "change_password":
		if req.CurrentPassword == "" || req.NewPassword == "" {
			jsonErr(w, http.StatusBadRequest, "currentPassword and newPassword required")
			return
		}
		if req.CurrentPassword != sess.Password {
			jsonErr(w, http.StatusUnauthorized, "current password incorrect")
			return
		}
		// Verify new password against IMAP
		testSess := *sess
		testSess.Password = req.NewPassword
		c := imapClient.New(sess.Email, req.NewPassword, &testSess)
		if err := c.Connect("INBOX"); err != nil {
			jsonErr(w, http.StatusUnauthorized, "new password verification failed: "+err.Error())
			return
		}
		c.Close()
		sess.Password = req.NewPassword
		middleware.SetSession(w, r, sess)

	default:
		jsonErr(w, http.StatusBadRequest, "unknown action")
		return
	}

	jsonOK(w, map[string]bool{"ok": true})
}
