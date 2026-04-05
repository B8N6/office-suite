package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"net/mail"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	imapClient "b8n6mail/imap"
	"b8n6mail/middleware"
	smtpClient "b8n6mail/smtp"
	"b8n6mail/storage"
)

// SendMessage sends an email or saves it as a draft.
// Accepts either JSON or multipart/form-data (for attachments).
func SendMessage(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)

	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	var (
		toStr, ccStr, bccStr            string
		subject, htmlBody, textBody     string
		inReplyTo, references, fromName string
		isDraft                         bool
		attachPaths                     []string
	)

	ct := r.Header.Get("Content-Type")
	if strings.HasPrefix(ct, "multipart/form-data") {
		// Parse multipart
		if err := r.ParseMultipartForm(30 << 20); err != nil {
			jsonErr(w, http.StatusBadRequest, "invalid multipart body: "+err.Error())
			return
		}
		toStr = r.FormValue("to")
		ccStr = r.FormValue("cc")
		bccStr = r.FormValue("bcc")
		subject = r.FormValue("subject")
		htmlBody = r.FormValue("html")
		if htmlBody == "" {
			htmlBody = r.FormValue("body")
		}
		textBody = r.FormValue("text")
		inReplyTo = r.FormValue("inReplyTo")
		references = r.FormValue("references")
		fromName = r.FormValue("fromName")
		isDraft = r.FormValue("draft") == "true" || r.FormValue("draft") == "1"

		// Save uploaded files to temp dir
		uploadDir := filepath.Join(storage.DataDir, "uploads")
		_ = os.MkdirAll(uploadDir, 0755)
		if r.MultipartForm != nil && r.MultipartForm.File != nil {
			for _, hdrs := range r.MultipartForm.File {
				for _, fh := range hdrs {
					src, err := fh.Open()
					if err != nil {
						continue
					}
					dst, err := os.CreateTemp(uploadDir, "attach-*-"+fh.Filename)
					if err != nil {
						src.Close()
						continue
					}
					_, _ = io.Copy(dst, src)
					src.Close()
					dst.Close()
					attachPaths = append(attachPaths, dst.Name())
				}
			}
		}
	} else {
		// JSON body
		var req struct {
			To          any      `json:"to"`
			CC          any      `json:"cc"`
			BCC         any      `json:"bcc"`
			Subject     string   `json:"subject"`
			HTML        string   `json:"html"`
			Body        string   `json:"body"` // alias for html
			Text        string   `json:"text"`
			Attachments []string `json:"attachments"`
			Draft       bool     `json:"draft"`
			InReplyTo   string   `json:"inReplyTo"`
			References  string   `json:"references"`
			FromName    string   `json:"fromName"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonErr(w, http.StatusBadRequest, "invalid request body")
			return
		}
		toStr = addrsToString(req.To)
		ccStr = addrsToString(req.CC)
		bccStr = addrsToString(req.BCC)
		subject = req.Subject
		htmlBody = req.HTML
		if htmlBody == "" {
			htmlBody = req.Body
		}
		textBody = req.Text
		inReplyTo = req.InReplyTo
		references = req.References
		fromName = req.FromName
		isDraft = req.Draft
		// SECURITY: Do NOT accept attachment paths from JSON clients. These
		// paths would be read from the server filesystem — a user could
		// exfiltrate arbitrary files (e.g. data/admin.json, /etc/passwd).
		// Attachments may ONLY arrive via multipart/form-data uploads.
		_ = req.Attachments
	}

	to := parseAddrList(toStr)
	cc := parseAddrList(ccStr)
	bcc := parseAddrList(bccStr)

	// Clean up temp attachments when done. Strict path check: must live
	// under data/uploads/ after cleaning — no traversal possible.
	uploadDirAbs, _ := filepath.Abs(filepath.Join(storage.DataDir, "uploads"))
	defer func() {
		for _, p := range attachPaths {
			clean, err := filepath.Abs(filepath.Clean(p))
			if err != nil {
				continue
			}
			if strings.HasPrefix(clean, uploadDirAbs+string(filepath.Separator)) {
				_ = os.Remove(clean)
			}
		}
	}()

	if isDraft {
		// Save to Drafts via IMAP append
		raw := buildDraftRaw(sess.Email, to, subject, htmlBody, textBody, inReplyTo, references)
		c := imapClient.New(sess.Email, sess.Password, sess)
		if err := c.Connect("INBOX"); err != nil {
			jsonErr(w, http.StatusBadGateway, "imap connect failed: "+err.Error())
			return
		}
		defer c.Close()
		draftsFolder := c.GetFolderByLabel("Drafts")
		if draftsFolder == "" {
			draftsFolder = "Drafts"
		}
		if err := c.AppendMessage(draftsFolder, raw, []string{"\\Draft", "\\Seen"}); err != nil {
			jsonErr(w, http.StatusBadGateway, "save draft failed: "+err.Error())
			return
		}
		jsonOK(w, map[string]any{"ok": true, "savedTo": draftsFolder})
		return
	}

	// Validate recipients
	if len(to) == 0 {
		jsonErr(w, http.StatusBadRequest, "at least one recipient required")
		return
	}

	// Send via SMTP
	mailer := smtpClient.New(sess)
	if err := mailer.Send(to, cc, bcc, subject, htmlBody, textBody, attachPaths, inReplyTo, references, fromName); err != nil {
		jsonErr(w, http.StatusBadGateway, "send failed: "+err.Error())
		return
	}

	// Append to Sent folder (best-effort)
	raw := mailer.GetLastRaw()
	if raw != "" {
		c := imapClient.New(sess.Email, sess.Password, sess)
		if err := c.Connect("INBOX"); err == nil {
			defer c.Close()
			sentFolder := c.GetFolderByLabel("Sent")
			if sentFolder == "" {
				sentFolder = "Sent"
			}
			_ = c.AppendMessage(sentFolder, raw, []string{"\\Seen"})
		}
	}

	jsonOK(w, map[string]bool{"ok": true})
}

// parseAddrList splits "Alice <a@x.com>, b@y.com" into Address objects.
func parseAddrList(s string) []smtpClient.Address {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	// First try stdlib mail.ParseAddressList (handles quotes, RFC-5322)
	if addrs, err := mail.ParseAddressList(s); err == nil && len(addrs) > 0 {
		out := make([]smtpClient.Address, 0, len(addrs))
		for _, a := range addrs {
			out = append(out, smtpClient.Address{Name: a.Name, Email: a.Address})
		}
		return out
	}
	// Fallback: split on comma/semicolon
	var out []smtpClient.Address
	parts := regexp.MustCompile(`[,;]+`).Split(s, -1)
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		out = append(out, smtpClient.Address{Email: p})
	}
	return out
}

// addrsToString converts JSON "to" field into a comma-separated string,
// whether it arrives as []Address, []string, or string.
func addrsToString(v any) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return t
	case []any:
		parts := make([]string, 0, len(t))
		for _, item := range t {
			switch m := item.(type) {
			case string:
				parts = append(parts, m)
			case map[string]any:
				email, _ := m["email"].(string)
				name, _ := m["name"].(string)
				if name != "" {
					parts = append(parts, name+" <"+email+">")
				} else if email != "" {
					parts = append(parts, email)
				}
			}
		}
		return strings.Join(parts, ", ")
	}
	return ""
}

// buildDraftRaw creates a minimal RFC822 message string for IMAP append.
func buildDraftRaw(from string, to []smtpClient.Address, subject, html, text, inReplyTo, references string) string {
	var sb strings.Builder
	sb.WriteString("From: " + from + "\r\n")
	if len(to) > 0 {
		var tos []string
		for _, a := range to {
			if a.Name != "" {
				tos = append(tos, a.Name+" <"+a.Email+">")
			} else {
				tos = append(tos, a.Email)
			}
		}
		sb.WriteString("To: " + strings.Join(tos, ", ") + "\r\n")
	}
	sb.WriteString("Subject: " + subject + "\r\n")
	if inReplyTo != "" {
		sb.WriteString("In-Reply-To: " + inReplyTo + "\r\n")
	}
	if references != "" {
		sb.WriteString("References: " + references + "\r\n")
	}
	sb.WriteString("MIME-Version: 1.0\r\n")
	sb.WriteString("Content-Type: text/html; charset=UTF-8\r\n")
	sb.WriteString("\r\n")
	if html != "" {
		sb.WriteString(html)
	} else {
		sb.WriteString(text)
	}
	return sb.String()
}
