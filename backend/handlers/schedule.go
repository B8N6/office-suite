package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	imapClient "b8n6mail/imap"
	"b8n6mail/middleware"
	"b8n6mail/models"
	smtpClient "b8n6mail/smtp"
	"b8n6mail/storage"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
)

const scheduledDir = "scheduled"

// ListScheduled returns all scheduled jobs for the current user.
func ListScheduled(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	jobs := loadJobs(sess.Email)
	jsonOK(w, map[string]any{"jobs": jobs})
}

// CreateScheduled queues a message for future delivery.
func CreateScheduled(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	var req struct {
		To          string `json:"to"`
		CC          string `json:"cc"`
		BCC         string `json:"bcc"`
		Subject     string `json:"subject"`
		HTML        string `json:"html"`
		Text        string `json:"text"`
		FromName    string `json:"fromName"`
		InReplyTo   string `json:"inReplyTo"`
		References  string `json:"references"`
		ScheduledAt string `json:"scheduledAt"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ScheduledAt == "" {
		jsonErr(w, http.StatusBadRequest, "scheduledAt required")
		return
	}
	t, err := time.Parse(time.RFC3339, req.ScheduledAt)
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid scheduledAt format (use ISO-8601)")
		return
	}

	job := models.ScheduledJob{
		ID:          uuid.New().String(),
		User:        sess.Email,
		To:          req.To,
		CC:          req.CC,
		BCC:         req.BCC,
		Subject:     req.Subject,
		HTML:        req.HTML,
		Text:        req.Text,
		FromName:    req.FromName,
		InReplyTo:   req.InReplyTo,
		References:  req.References,
		ScheduledAt: req.ScheduledAt,
		ScheduledTs: t.Unix(),
		Status:      "pending",
		CreatedAt:   time.Now().UTC().Format(time.RFC3339),
	}

	jobs := loadJobs(sess.Email)
	jobs = append(jobs, job)
	saveJobs(sess.Email, jobs)

	jsonOK(w, map[string]any{"ok": true, "job": job})
}

// DeleteScheduled removes a scheduled job.
func DeleteScheduled(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	id := mux.Vars(r)["id"]
	jobs := loadJobs(sess.Email)
	updated := jobs[:0]
	for _, j := range jobs {
		if j.ID != id {
			updated = append(updated, j)
		}
	}
	saveJobs(sess.Email, updated)
	jsonOK(w, map[string]bool{"ok": true})
}

// RunScheduled processes all due jobs for the current user.
func RunScheduled(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	now := time.Now().Unix()
	jobs := loadJobs(sess.Email)
	sent := 0
	failed := 0

	mailer := smtpClient.New(sess)

	for i := range jobs {
		if jobs[i].Status != "pending" {
			continue
		}
		if jobs[i].ScheduledTs > now {
			continue
		}

		toAddrs := parseAddressList(jobs[i].To)
		ccAddrs := parseAddressList(jobs[i].CC)
		bccAddrs := parseAddressList(jobs[i].BCC)

		err := mailer.Send(toAddrs, ccAddrs, bccAddrs,
			jobs[i].Subject, jobs[i].HTML, jobs[i].Text, nil,
			jobs[i].InReplyTo, jobs[i].References, jobs[i].FromName)
		if err != nil {
			jobs[i].Status = "failed"
			jobs[i].Error = err.Error()
			failed++
		} else {
			jobs[i].Status = "sent"
			jobs[i].SentAt = time.Now().UTC().Format(time.RFC3339)
			sent++

			// Append to Sent folder
			raw := mailer.GetLastRaw()
			if raw != "" {
				c := imapClient.New(sess.Email, sess.Password, sess)
				if err := c.Connect(""); err == nil {
					sentFolder := c.GetFolderByLabel("Sent")
					if sentFolder == "" {
						sentFolder = "Sent"
					}
					_ = c.AppendMessage(sentFolder, raw, []string{"\\Seen"})
					c.Close()
				}
			}
		}
	}

	saveJobs(sess.Email, jobs)
	jsonOK(w, map[string]any{"ok": true, "sent": sent, "failed": failed})
}

func loadJobs(email string) []models.ScheduledJob {
	var jobs []models.ScheduledJob
	_ = storage.ReadUserJSON(scheduledDir, email, &jobs)
	if jobs == nil {
		jobs = []models.ScheduledJob{}
	}
	return jobs
}

func saveJobs(email string, jobs []models.ScheduledJob) {
	_ = storage.WriteUserJSON(scheduledDir, email, jobs)
}

func parseAddressList(s string) []smtpClient.Address {
	if s == "" {
		return nil
	}
	var addrs []smtpClient.Address
	for _, part := range strings.Split(s, ",") {
		part = strings.TrimSpace(part)
		if part != "" {
			addrs = append(addrs, smtpClient.Address{Email: part})
		}
	}
	return addrs
}
