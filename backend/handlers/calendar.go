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

const calendarsDir = "calendars"
const calendarSharesDir = "calendar_shares"

// ListCalendar returns the user's events plus any shared calendar events.
func ListCalendar(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	events := loadEvents(sess.Email)

	// Add events from shared calendars
	shares := loadShares(sess.Email)
	for _, sharedEmail := range shares {
		sharedEvents := loadEvents(sharedEmail)
		for i := range sharedEvents {
			sharedEvents[i].Readonly = true
			sharedEvents[i].OwnerEmail = sharedEmail
		}
		events = append(events, sharedEvents...)
	}

	if events == nil {
		events = []models.CalendarEvent{}
	}
	jsonOK(w, map[string]any{"events": events})
}

// ListShares returns the list of emails this user has shared with.
func ListShares(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	shares := loadShares(sess.Email)
	if shares == nil {
		shares = []string{}
	}
	jsonOK(w, map[string]any{"shares": shares})
}

// CreateEvent adds a new calendar event.
func CreateEvent(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	var ev models.CalendarEvent
	if err := json.NewDecoder(r.Body).Decode(&ev); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	now := time.Now().UTC().Format(time.RFC3339)
	ev.ID = uuid.New().String()
	ev.Created = now
	ev.Updated = now

	events := loadEvents(sess.Email)
	events = append(events, ev)
	saveEvents(sess.Email, events)

	jsonOK(w, map[string]any{"ok": true, "event": ev})
}

// UpdateEvent modifies an existing calendar event.
func UpdateEvent(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	id := mux.Vars(r)["id"]
	var ev models.CalendarEvent
	if err := json.NewDecoder(r.Body).Decode(&ev); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ev.ID = id
	ev.Updated = time.Now().UTC().Format(time.RFC3339)

	events := loadEvents(sess.Email)
	found := false
	for i := range events {
		if events[i].ID == id {
			ev.Created = events[i].Created
			events[i] = ev
			found = true
			break
		}
	}
	if !found {
		jsonErr(w, http.StatusNotFound, "event not found")
		return
	}
	saveEvents(sess.Email, events)
	jsonOK(w, map[string]any{"ok": true, "event": ev})
}

// DeleteEvent removes a calendar event.
func DeleteEvent(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	id := mux.Vars(r)["id"]
	events := loadEvents(sess.Email)
	updated := events[:0]
	for _, ev := range events {
		if ev.ID != id {
			updated = append(updated, ev)
		}
	}
	saveEvents(sess.Email, updated)
	jsonOK(w, map[string]bool{"ok": true})
}

// ShareCalendar adds an email to the user's calendar share list.
func ShareCalendar(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Email == "" {
		jsonErr(w, http.StatusBadRequest, "email required")
		return
	}

	// Validate that the email's domain is configured
	if _, err := storage.FindDomain(req.Email); err != nil {
		jsonErr(w, http.StatusBadRequest, "unknown email domain")
		return
	}

	shares := loadShares(sess.Email)
	for _, s := range shares {
		if strings.EqualFold(s, req.Email) {
			jsonOK(w, map[string]bool{"ok": true}) // already shared
			return
		}
	}
	shares = append(shares, req.Email)
	saveShares(sess.Email, shares)

	jsonOK(w, map[string]bool{"ok": true})
}

// UnshareCalendar removes a share.
func UnshareCalendar(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	email := mux.Vars(r)["email"]
	shares := loadShares(sess.Email)
	updated := shares[:0]
	for _, s := range shares {
		if !strings.EqualFold(s, email) {
			updated = append(updated, s)
		}
	}
	saveShares(sess.Email, updated)
	jsonOK(w, map[string]bool{"ok": true})
}

func loadEvents(email string) []models.CalendarEvent {
	var events []models.CalendarEvent
	_ = storage.ReadUserJSON(calendarsDir, email, &events)
	if events == nil {
		events = []models.CalendarEvent{}
	}
	return events
}

func saveEvents(email string, events []models.CalendarEvent) {
	_ = storage.WriteUserJSON(calendarsDir, email, events)
}

func loadShares(email string) []string {
	var shares []string
	_ = storage.ReadUserJSON(calendarSharesDir, email, &shares)
	return shares
}

func saveShares(email string, shares []string) {
	_ = storage.WriteUserJSON(calendarSharesDir, email, shares)
}
