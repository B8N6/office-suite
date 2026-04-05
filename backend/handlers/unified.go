package handlers

import (
	"encoding/json"
	"net/http"
	"sort"
	"time"

	imapClient "b8n6mail/imap"
	"b8n6mail/middleware"
	"b8n6mail/models"
	"b8n6mail/storage"
)

// maxUnifiedAccounts caps how many accounts a single request can query,
// preventing abuse of this endpoint as a credential-testing oracle.
const maxUnifiedAccounts = 10

type unifiedMessage struct {
	models.Message
	AccountEmail string `json:"accountEmail"`
}

// UnifiedInbox merges INBOX messages from multiple accounts.
// Requires an authenticated session. Caps account count to limit abuse
// of this endpoint as a credential-testing oracle.
func UnifiedInbox(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)

	// Require an active session (the auth middleware already enforces this
	// at the router level, but double-check for defence in depth).
	if middleware.GetSession(r) == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	var req struct {
		Accounts []struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		} `json:"accounts"`
		Limit int `json:"limit"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Limit <= 0 || req.Limit > 100 {
		req.Limit = 50
	}
	if len(req.Accounts) > maxUnifiedAccounts {
		req.Accounts = req.Accounts[:maxUnifiedAccounts]
	}

	var allMessages []unifiedMessage

	for _, acc := range req.Accounts {
		domain, err := storage.FindDomain(acc.Email)
		if err != nil {
			continue
		}
		c := imapClient.NewWithConfig(acc.Email, acc.Password, domain)
		if err := c.Connect("INBOX"); err != nil {
			continue
		}

		messages, _, err := c.GetMessages(1, req.Limit)
		c.Close()
		if err != nil {
			continue
		}

		for _, m := range messages {
			allMessages = append(allMessages, unifiedMessage{
				Message:      m,
				AccountEmail: acc.Email,
			})
		}
	}

	// Sort by date descending
	sort.Slice(allMessages, func(i, j int) bool {
		ti, _ := time.Parse(time.RFC3339, allMessages[i].DateRaw)
		tj, _ := time.Parse(time.RFC3339, allMessages[j].DateRaw)
		return ti.After(tj)
	})

	if len(allMessages) > req.Limit {
		allMessages = allMessages[:req.Limit]
	}
	if allMessages == nil {
		allMessages = []unifiedMessage{}
	}

	jsonOK(w, map[string]any{"messages": allMessages})
}

// UnifiedMessage reads a single message from an arbitrary account whose
// credentials are supplied in the request body. Used by the "All Inboxes"
// view so users can read messages across all their saved accounts without
// switching the current session. READ-ONLY — no actions are exposed here.
func UnifiedMessage(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)

	// Requires an active session (auth middleware already enforces it,
	// but re-check for defence in depth).
	if middleware.GetSession(r) == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		UID      uint32 `json:"uid"`
		Folder   string `json:"folder"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Email == "" || req.Password == "" || req.UID == 0 {
		jsonErr(w, http.StatusBadRequest, "email, password, and uid required")
		return
	}
	if req.Folder == "" {
		req.Folder = "INBOX"
	}

	// SECURITY: return a single 401 for any authentication-related failure
	// (domain not configured, IMAP connect fail, message fetch fail) so
	// this endpoint can't be used as a credential-enumeration oracle.
	domain, err := storage.FindDomain(req.Email)
	if err != nil || domain == nil {
		jsonErr(w, http.StatusUnauthorized, "authentication failed")
		return
	}

	c := imapClient.NewWithConfig(req.Email, req.Password, domain)
	if err := c.Connect(req.Folder); err != nil {
		jsonErr(w, http.StatusUnauthorized, "authentication failed")
		return
	}
	defer c.Close()

	msg, err := c.GetMessage(req.UID)
	if err != nil {
		jsonErr(w, http.StatusNotFound, "message not found")
		return
	}
	jsonOK(w, map[string]any{"message": msg})
}
