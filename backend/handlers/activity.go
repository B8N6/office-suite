package handlers

import (
	"net/http"
	"strings"

	"b8n6mail/middleware"
	"b8n6mail/models"
	"b8n6mail/storage"
)

// ListUserActivity returns an activity summary for all known users.
// For non-owner admins, results are filtered to their assigned domains only.
func ListUserActivity(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)

	allowedDomains, _ := getAdminDomainScope(r)

	emails := storage.ListAllUsers()
	var rows []models.UserActivity
	for _, email := range emails {
		domain := domainOf(email)
		if allowedDomains != nil && !allowedDomains[domain] {
			continue
		}
		row := models.UserActivity{
			Email:          email,
			Domain:         domain,
			ScheduledCount: storage.ReadUserJSONCount("scheduled", email, ""),
			FilterCount:    storage.ReadUserJSONCount("filters", email, "rules"),
			ContactCount:   storage.ReadUserJSONCount("contacts", email, "contacts"),
			CalendarEvents: storage.ReadUserJSONCount("calendars", email, "events"),
			HasSignature:   storage.CountUserFile("signatures", email) > 0,
		}
		if last := storage.ReadLogin(email); last != nil {
			row.LastLoginAt = last.LastLoginAt
		}
		// Count open tickets for this user
		if tickets, err := storage.ReadUserTickets(email); err == nil {
			for _, t := range tickets {
				if t.Status == "open" {
					row.OpenTickets++
				}
			}
		}
		rows = append(rows, row)
	}
	if rows == nil {
		rows = []models.UserActivity{}
	}

	jsonOK(w, map[string]any{"users": rows, "total": len(rows)})
}

// getAdminDomainScope returns the set of domains an admin is restricted to.
// Returns (nil, true) for owners (unrestricted). Returns (map, false) for
// scoped admins.
func getAdminDomainScope(r *http.Request) (map[string]bool, bool) {
	username := middleware.GetAdminSession(r)
	if username == "" {
		return map[string]bool{}, false
	}
	admin := storage.FindAdminByUsername(username)
	if admin == nil || admin.Role == "owner" {
		return nil, true // unrestricted
	}
	allowed := map[string]bool{}
	// Map admin's assigned domain IDs to domain names
	domains, _ := storage.ReadDomains()
	for _, d := range domains {
		for _, id := range admin.AssignedDomains {
			if d.ID == id {
				allowed[strings.ToLower(d.Domain)] = true
				break
			}
		}
	}
	return allowed, false
}

func domainOf(email string) string {
	i := strings.LastIndex(email, "@")
	if i < 0 {
		return ""
	}
	return strings.ToLower(email[i+1:])
}
