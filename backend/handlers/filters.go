package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	imapClient "b8n6mail/imap"
	"b8n6mail/middleware"
	"b8n6mail/models"
	"b8n6mail/storage"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
)

const filtersDir = "filters"

// ListFilters returns all filter rules for the current user.
func ListFilters(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	rules := loadFilters(sess.Email)
	jsonOK(w, map[string]any{"filters": rules})
}

// CreateFilter creates a new filter rule.
func CreateFilter(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	var rule models.FilterRule
	if err := json.NewDecoder(r.Body).Decode(&rule); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	rule.ID = uuid.New().String()
	now := time.Now().UTC().Format(time.RFC3339)
	rule.Created = now
	rule.Updated = now

	rules := loadFilters(sess.Email)
	rules = append(rules, rule)
	saveFilters(sess.Email, rules)

	jsonOK(w, map[string]any{"ok": true, "filter": rule})
}

// UpdateFilter replaces an existing filter rule.
func UpdateFilter(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	id := mux.Vars(r)["id"]
	var rule models.FilterRule
	if err := json.NewDecoder(r.Body).Decode(&rule); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	rule.ID = id
	rule.Updated = time.Now().UTC().Format(time.RFC3339)

	rules := loadFilters(sess.Email)
	found := false
	for i := range rules {
		if rules[i].ID == id {
			rule.Created = rules[i].Created
			rules[i] = rule
			found = true
			break
		}
	}
	if !found {
		jsonErr(w, http.StatusNotFound, "filter not found")
		return
	}
	saveFilters(sess.Email, rules)
	jsonOK(w, map[string]any{"ok": true, "filter": rule})
}

// DeleteFilter removes a filter rule.
func DeleteFilter(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	id := mux.Vars(r)["id"]
	rules := loadFilters(sess.Email)
	updated := rules[:0]
	for _, f := range rules {
		if f.ID != id {
			updated = append(updated, f)
		}
	}
	saveFilters(sess.Email, updated)
	jsonOK(w, map[string]bool{"ok": true})
}

// ApplyFilters runs all enabled filter rules against new INBOX messages.
func ApplyFilters(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	rules := loadFilters(sess.Email)
	var enabled []models.FilterRule
	for _, f := range rules {
		if f.Enabled {
			enabled = append(enabled, f)
		}
	}
	if len(enabled) == 0 {
		jsonOK(w, map[string]any{"ok": true, "applied": 0})
		return
	}

	c := imapClient.New(sess.Email, sess.Password, sess)
	if err := c.Connect("INBOX"); err != nil {
		jsonErr(w, http.StatusBadGateway, "imap connect failed: "+err.Error())
		return
	}
	defer c.Close()

	// Search for all unseen messages
	messages, _, err := c.GetMessages(1, 100)
	if err != nil {
		jsonErr(w, http.StatusBadGateway, "fetch messages failed: "+err.Error())
		return
	}

	uids := make([]uint32, 0, len(messages))
	for _, m := range messages {
		uids = append(uids, m.UID)
	}

	if err := c.ApplyFilters(uids, enabled); err != nil {
		jsonErr(w, http.StatusBadGateway, "apply filters failed: "+err.Error())
		return
	}

	jsonOK(w, map[string]any{"ok": true, "applied": len(uids)})
}

func loadFilters(email string) []models.FilterRule {
	var rules []models.FilterRule
	_ = storage.ReadUserJSON(filtersDir, email, &rules)
	if rules == nil {
		rules = []models.FilterRule{}
	}
	return rules
}

func saveFilters(email string, rules []models.FilterRule) {
	_ = storage.WriteUserJSON(filtersDir, email, rules)
}
