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

// -----------------------------------------------------------------------
// User-facing endpoints (require email-user auth)
// -----------------------------------------------------------------------

// ListUserTickets returns the current user's tickets (most recent first).
func ListUserTickets(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	tickets, err := storage.ReadUserTickets(sess.Email)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "read tickets: "+err.Error())
		return
	}
	jsonOK(w, map[string]any{"tickets": tickets})
}

// CreateUserTicket opens a new support ticket.
func CreateUserTicket(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	var req struct {
		Subject  string `json:"subject"`
		Body     string `json:"body"`
		Priority string `json:"priority"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Subject = strings.TrimSpace(req.Subject)
	req.Body = strings.TrimSpace(req.Body)
	if req.Subject == "" || req.Body == "" {
		jsonErr(w, http.StatusBadRequest, "subject and body required")
		return
	}
	if req.Priority != "high" && req.Priority != "low" {
		req.Priority = "normal"
	}

	now := time.Now().UTC().Format(time.RFC3339)
	ticket := models.SupportTicket{
		ID:        uuid.NewString(),
		UserEmail: sess.Email,
		Subject:   req.Subject,
		Status:    "open",
		Priority:  req.Priority,
		CreatedAt: now,
		UpdatedAt: now,
		Messages: []models.TicketMessage{{
			ID:         uuid.NewString(),
			Author:     sess.Email,
			AuthorKind: "user",
			Body:       req.Body,
			CreatedAt:  now,
		}},
	}

	tickets, _ := storage.ReadUserTickets(sess.Email)
	tickets = append([]models.SupportTicket{ticket}, tickets...)
	if err := storage.WriteUserTickets(sess.Email, tickets); err != nil {
		jsonErr(w, http.StatusInternalServerError, "write ticket: "+err.Error())
		return
	}
	jsonOK(w, map[string]any{"ok": true, "ticket": ticket})
}

// ReplyUserTicket adds a message to one of the user's own tickets.
func ReplyUserTicket(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	id := mux.Vars(r)["id"]
	var req struct {
		Body string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Body = strings.TrimSpace(req.Body)
	if req.Body == "" {
		jsonErr(w, http.StatusBadRequest, "body required")
		return
	}

	tickets, err := storage.ReadUserTickets(sess.Email)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "read tickets: "+err.Error())
		return
	}
	found := false
	now := time.Now().UTC().Format(time.RFC3339)
	for i := range tickets {
		if tickets[i].ID == id {
			tickets[i].Messages = append(tickets[i].Messages, models.TicketMessage{
				ID:         uuid.NewString(),
				Author:     sess.Email,
				AuthorKind: "user",
				Body:       req.Body,
				CreatedAt:  now,
			})
			tickets[i].UpdatedAt = now
			if tickets[i].Status == "closed" {
				tickets[i].Status = "open" // reopen on new reply
			}
			found = true
			break
		}
	}
	if !found {
		jsonErr(w, http.StatusNotFound, "ticket not found")
		return
	}
	if err := storage.WriteUserTickets(sess.Email, tickets); err != nil {
		jsonErr(w, http.StatusInternalServerError, "write ticket: "+err.Error())
		return
	}
	jsonOK(w, map[string]bool{"ok": true})
}

// -----------------------------------------------------------------------
// Admin-facing endpoints
// -----------------------------------------------------------------------

// AdminListTickets returns all tickets (scoped to assigned domains for
// non-owner admins).
func AdminListTickets(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	allowed, _ := getAdminDomainScope(r)
	tickets, err := storage.ListAllTickets(allowed)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "read tickets: "+err.Error())
		return
	}
	jsonOK(w, map[string]any{"tickets": tickets})
}

// AdminReplyTicket adds an admin response to a ticket.
func AdminReplyTicket(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	adminUsername := middleware.GetAdminSession(r)
	if adminUsername == "" {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	id := mux.Vars(r)["id"]
	var req struct {
		Body   string `json:"body"`
		Close  bool   `json:"close"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Body = strings.TrimSpace(req.Body)
	if req.Body == "" && !req.Close {
		jsonErr(w, http.StatusBadRequest, "body or close flag required")
		return
	}

	ticket, userEmail, err := storage.FindTicketByID(id)
	if err != nil || ticket == nil {
		jsonErr(w, http.StatusNotFound, "ticket not found")
		return
	}
	// Enforce domain scope
	allowed, isOwner := getAdminDomainScope(r)
	if !isOwner && !allowed[domainOf(ticket.UserEmail)] {
		jsonErr(w, http.StatusForbidden, "ticket outside your assigned domains")
		return
	}

	tickets, _ := storage.ReadUserTickets(userEmail)
	now := time.Now().UTC().Format(time.RFC3339)
	for i := range tickets {
		if tickets[i].ID == id {
			if req.Body != "" {
				tickets[i].Messages = append(tickets[i].Messages, models.TicketMessage{
					ID:         uuid.NewString(),
					Author:     adminUsername,
					AuthorKind: "admin",
					Body:       req.Body,
					CreatedAt:  now,
				})
			}
			tickets[i].UpdatedAt = now
			if req.Close {
				tickets[i].Status = "closed"
			}
			break
		}
	}
	if err := storage.WriteUserTickets(userEmail, tickets); err != nil {
		jsonErr(w, http.StatusInternalServerError, "write ticket: "+err.Error())
		return
	}
	jsonOK(w, map[string]bool{"ok": true})
}
