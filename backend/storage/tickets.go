package storage

import (
	"crypto/md5"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"b8n6mail/models"
)

// ticketFilePath returns data/tickets/<md5(email)>.json for per-user storage.
func ticketFilePath(email string) string {
	h := md5.Sum([]byte(strings.ToLower(email)))
	return filepath.Join(DataDir, "tickets", fmt.Sprintf("%x.json", h))
}

// ReadUserTickets returns all tickets belonging to a single user.
func ReadUserTickets(email string) ([]models.SupportTicket, error) {
	var tickets []models.SupportTicket
	path := ticketFilePath(email)
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return []models.SupportTicket{}, nil
		}
		return nil, err
	}
	if err := json.Unmarshal(raw, &tickets); err != nil {
		return []models.SupportTicket{}, nil
	}
	return tickets, nil
}

// WriteUserTickets persists a user's ticket list.
func WriteUserTickets(email string, tickets []models.SupportTicket) error {
	path := ticketFilePath(email)
	_ = os.MkdirAll(filepath.Dir(path), 0755)
	return WriteJSON(path, tickets)
}

// ListAllTickets scans every user's ticket file and returns all tickets,
// sorted by updatedAt descending (most recent first). Used by admin views.
// If restrictDomains is non-empty, only tickets for users in those domains
// are returned.
func ListAllTickets(restrictDomains map[string]bool) ([]models.SupportTicket, error) {
	ticketsDir := filepath.Join(DataDir, "tickets")
	entries, err := os.ReadDir(ticketsDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []models.SupportTicket{}, nil
		}
		return nil, err
	}

	var all []models.SupportTicket
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(ticketsDir, e.Name()))
		if err != nil {
			continue
		}
		var list []models.SupportTicket
		if err := json.Unmarshal(raw, &list); err != nil {
			continue
		}
		for _, t := range list {
			if restrictDomains != nil {
				d := domainOfEmail(t.UserEmail)
				if !restrictDomains[d] {
					continue
				}
			}
			all = append(all, t)
		}
	}

	sort.Slice(all, func(i, j int) bool {
		return all[i].UpdatedAt > all[j].UpdatedAt
	})
	return all, nil
}

// FindTicketByID looks up a single ticket across all users.
func FindTicketByID(id string) (*models.SupportTicket, string, error) {
	ticketsDir := filepath.Join(DataDir, "tickets")
	entries, err := os.ReadDir(ticketsDir)
	if err != nil {
		return nil, "", err
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(ticketsDir, e.Name()))
		if err != nil {
			continue
		}
		var list []models.SupportTicket
		if err := json.Unmarshal(raw, &list); err != nil {
			continue
		}
		for i := range list {
			if list[i].ID == id {
				return &list[i], list[i].UserEmail, nil
			}
		}
	}
	return nil, "", os.ErrNotExist
}

// domainOfEmail returns the lowercase domain part of an email address.
func domainOfEmail(email string) string {
	at := strings.LastIndex(email, "@")
	if at < 0 {
		return ""
	}
	return strings.ToLower(email[at+1:])
}
