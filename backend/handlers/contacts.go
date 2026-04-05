package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"b8n6mail/middleware"
	"b8n6mail/storage"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
)

type Contact struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	Notes     string `json:"notes,omitempty"`
	CreatedAt string `json:"createdAt"`
}

type contactsFile struct {
	Version  int       `json:"version"`
	Contacts []Contact `json:"contacts"`
}

// ListContacts returns all saved contacts for the current user.
func ListContacts(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	data := loadContacts(sess.Email)
	jsonOK(w, map[string]any{"contacts": data.Contacts})
}

// CreateContact adds a new contact. If the email already exists, the
// existing record is updated (name/notes).
func CreateContact(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	var req struct {
		Name  string `json:"name"`
		Email string `json:"email"`
		Notes string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.Name = strings.TrimSpace(req.Name)
	if req.Email == "" || !strings.Contains(req.Email, "@") {
		jsonErr(w, http.StatusBadRequest, "valid email required")
		return
	}

	data := loadContacts(sess.Email)
	// dedupe by email
	for i := range data.Contacts {
		if strings.EqualFold(data.Contacts[i].Email, req.Email) {
			if req.Name != "" {
				data.Contacts[i].Name = req.Name
			}
			if req.Notes != "" {
				data.Contacts[i].Notes = req.Notes
			}
			saveContacts(sess.Email, data)
			jsonOK(w, map[string]any{"ok": true, "contact": data.Contacts[i], "updated": true})
			return
		}
	}

	contact := Contact{
		ID:        uuid.NewString(),
		Name:      req.Name,
		Email:     req.Email,
		Notes:     req.Notes,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	}
	data.Contacts = append(data.Contacts, contact)
	saveContacts(sess.Email, data)
	jsonOK(w, map[string]any{"ok": true, "contact": contact})
}

// DeleteContact removes a contact by ID.
func DeleteContact(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	id := mux.Vars(r)["id"]
	if id == "" {
		jsonErr(w, http.StatusBadRequest, "id required")
		return
	}
	data := loadContacts(sess.Email)
	out := data.Contacts[:0]
	for _, c := range data.Contacts {
		if c.ID != id {
			out = append(out, c)
		}
	}
	data.Contacts = out
	saveContacts(sess.Email, data)
	jsonOK(w, map[string]bool{"ok": true})
}

func loadContacts(email string) *contactsFile {
	var f contactsFile
	_ = storage.ReadUserJSON("contacts", email, &f)
	if f.Version == 0 {
		f.Version = 1
	}
	if f.Contacts == nil {
		f.Contacts = []Contact{}
	}
	return &f
}

func saveContacts(email string, data *contactsFile) {
	_ = storage.WriteUserJSON("contacts", email, data)
}
