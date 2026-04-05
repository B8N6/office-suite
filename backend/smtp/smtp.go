package smtp

import (
	"bytes"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/smtp"
	"net/textproto"
	"os"
	"path/filepath"
	"strings"
	"time"

	"b8n6mail/models"
)

// Mailer sends email using SMTP.
type Mailer struct {
	host     string
	port     int
	ssl      bool
	email    string
	password string
	lastRaw  string
}

// Address is a named email address.
type Address struct {
	Name  string `json:"name"`
	Email string `json:"email"`
}

// New creates a Mailer from session data.
func New(sess *models.SessionData) *Mailer {
	return &Mailer{
		host:     sess.SmtpHost,
		port:     sess.SmtpPort,
		ssl:      sess.SmtpSSL,
		email:    sess.Email,
		password: sess.Password,
	}
}

// Send composes and sends an email message.
func (m *Mailer) Send(
	to, cc, bcc []Address,
	subject, html, text string,
	attachments []string,
	inReplyTo, references, fromName string,
) error {
	raw, err := m.buildMessage(to, cc, bcc, subject, html, text, attachments, inReplyTo, references, fromName)
	if err != nil {
		return err
	}
	m.lastRaw = raw

	// Collect all recipients
	var rcpts []string
	for _, a := range to {
		rcpts = append(rcpts, a.Email)
	}
	for _, a := range cc {
		rcpts = append(rcpts, a.Email)
	}
	for _, a := range bcc {
		rcpts = append(rcpts, a.Email)
	}

	addr := fmt.Sprintf("%s:%d", m.host, m.port)
	tlsCfg := &tls.Config{InsecureSkipVerify: os.Getenv("TLS_VERIFY") != "true", ServerName: m.host}

	if m.ssl {
		// Direct TLS (port 465)
		conn, err := tls.Dial("tcp", addr, tlsCfg)
		if err != nil {
			return fmt.Errorf("smtp tls dial: %w", err)
		}
		c, err := smtp.NewClient(conn, m.host)
		if err != nil {
			conn.Close()
			return fmt.Errorf("smtp client: %w", err)
		}
		defer c.Close()
		return m.sendViaClient(c, rcpts, raw)
	}

	// STARTTLS (port 587 or 25)
	c, err := smtp.Dial(addr)
	if err != nil {
		return fmt.Errorf("smtp dial: %w", err)
	}
	defer c.Close()
	if ok, _ := c.Extension("STARTTLS"); ok {
		if err := c.StartTLS(tlsCfg); err != nil {
			return fmt.Errorf("starttls: %w", err)
		}
	}
	return m.sendViaClient(c, rcpts, raw)
}

func (m *Mailer) sendViaClient(c *smtp.Client, rcpts []string, raw string) error {
	// Try LOGIN auth first (most common for IMAP/SMTP hosting)
	if err := c.Auth(&loginAuth{user: m.email, pass: m.password}); err != nil {
		// Fallback to PLAIN
		if err2 := c.Auth(smtp.PlainAuth("", m.email, m.password, m.host)); err2 != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}
	if err := c.Mail(m.email); err != nil {
		return fmt.Errorf("smtp MAIL FROM: %w", err)
	}
	for _, rcpt := range rcpts {
		if err := c.Rcpt(rcpt); err != nil {
			return fmt.Errorf("smtp RCPT TO %s: %w", rcpt, err)
		}
	}
	w, err := c.Data()
	if err != nil {
		return fmt.Errorf("smtp DATA: %w", err)
	}
	_, err = io.WriteString(w, raw)
	if err != nil {
		w.Close()
		return fmt.Errorf("smtp write: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("smtp close data: %w", err)
	}
	return c.Quit()
}

// loginAuth implements smtp.Auth for LOGIN mechanism.
type loginAuth struct{ user, pass string }

func (a *loginAuth) Start(_ *smtp.ServerInfo) (string, []byte, error) {
	return "LOGIN", []byte{}, nil
}

func (a *loginAuth) Next(fromServer []byte, more bool) ([]byte, error) {
	if !more {
		return nil, nil
	}
	switch strings.ToLower(strings.TrimSpace(string(fromServer))) {
	case "username:":
		return []byte(a.user), nil
	case "password:":
		return []byte(a.pass), nil
	}
	return nil, fmt.Errorf("unknown LOGIN challenge: %s", fromServer)
}

func (m *Mailer) buildMessage(
	to, cc, bcc []Address,
	subject, html, text string,
	attachments []string,
	inReplyTo, references, fromName string,
) (string, error) {
	var buf bytes.Buffer

	displayName := fromName
	if displayName == "" {
		displayName = m.email
	}

	// Headers
	writeHeader(&buf, "From", formatAddr(displayName, m.email))
	writeHeader(&buf, "To", formatAddrs(to))
	if len(cc) > 0 {
		writeHeader(&buf, "Cc", formatAddrs(cc))
	}
	writeHeader(&buf, "Subject", encodeSubject(subject))
	writeHeader(&buf, "Date", time.Now().UTC().Format(time.RFC1123Z))
	writeHeader(&buf, "MIME-Version", "1.0")
	msgID := fmt.Sprintf("<%d.%s@b8n6mail>", time.Now().UnixNano(), sanitizeMsgIDPart(m.email))
	writeHeader(&buf, "Message-Id", msgID)
	if inReplyTo != "" {
		writeHeader(&buf, "In-Reply-To", inReplyTo)
	}
	if references != "" {
		writeHeader(&buf, "References", references)
	}

	hasAttachments := len(attachments) > 0

	if hasAttachments {
		// multipart/mixed wrapping multipart/alternative
		mixedWriter := multipart.NewWriter(&buf)
		writeHeader(&buf, "Content-Type", fmt.Sprintf("multipart/mixed; boundary=%s", mixedWriter.Boundary()))
		buf.WriteString("\r\n")

		// Body part (multipart/alternative)
		bodyHeaders := make(textproto.MIMEHeader)
		altBuf := &bytes.Buffer{}
		altWriter := multipart.NewWriter(altBuf)
		bodyHeaders.Set("Content-Type", fmt.Sprintf("multipart/alternative; boundary=%s", altWriter.Boundary()))

		writeAlternative(altWriter, text, html)
		altWriter.Close()

		bodyPart, _ := mixedWriter.CreatePart(bodyHeaders)
		bodyPart.Write(altBuf.Bytes())

		// Attachment parts
		for _, path := range attachments {
			data, err := os.ReadFile(path)
			if err != nil {
				continue
			}
			name := filepath.Base(path)
			ct := mime.TypeByExtension(filepath.Ext(path))
			if ct == "" {
				ct = "application/octet-stream"
			}
			attHeaders := make(textproto.MIMEHeader)
			attHeaders.Set("Content-Type", fmt.Sprintf("%s; name=%q", ct, name))
			attHeaders.Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", name))
			attHeaders.Set("Content-Transfer-Encoding", "base64")
			part, _ := mixedWriter.CreatePart(attHeaders)
			encoded := base64.StdEncoding.EncodeToString(data)
			// Line-wrap at 76 chars
			for i := 0; i < len(encoded); i += 76 {
				end := i + 76
				if end > len(encoded) {
					end = len(encoded)
				}
				part.Write([]byte(encoded[i:end] + "\r\n"))
			}
		}
		mixedWriter.Close()
	} else {
		// No attachments: multipart/alternative
		altWriter := multipart.NewWriter(&buf)
		writeHeader(&buf, "Content-Type", fmt.Sprintf("multipart/alternative; boundary=%s", altWriter.Boundary()))
		buf.WriteString("\r\n")
		writeAlternative(altWriter, text, html)
		altWriter.Close()
	}

	return buf.String(), nil
}

func writeAlternative(w *multipart.Writer, text, html string) {
	if text != "" {
		h := make(textproto.MIMEHeader)
		h.Set("Content-Type", "text/plain; charset=utf-8")
		h.Set("Content-Transfer-Encoding", "quoted-printable")
		p, _ := w.CreatePart(h)
		p.Write([]byte(text))
	}
	if html != "" {
		h := make(textproto.MIMEHeader)
		h.Set("Content-Type", "text/html; charset=utf-8")
		h.Set("Content-Transfer-Encoding", "quoted-printable")
		p, _ := w.CreatePart(h)
		p.Write([]byte(html))
	}
}

// GetLastRaw returns the raw RFC822 message from the last Send call.
func (m *Mailer) GetLastRaw() string {
	return m.lastRaw
}

// writeHeader writes an RFC-822 header line, stripping CR/LF from the value
// to prevent header-injection attacks.
func writeHeader(buf *bytes.Buffer, key, value string) {
	value = strings.ReplaceAll(value, "\r", "")
	value = strings.ReplaceAll(value, "\n", "")
	buf.WriteString(key)
	buf.WriteString(": ")
	buf.WriteString(value)
	buf.WriteString("\r\n")
}

func formatAddr(name, email string) string {
	if name != "" {
		return fmt.Sprintf("%s <%s>", encodeSubject(name), email)
	}
	return email
}

func formatAddrs(addrs []Address) string {
	parts := make([]string, 0, len(addrs))
	for _, a := range addrs {
		parts = append(parts, formatAddr(a.Name, a.Email))
	}
	return strings.Join(parts, ", ")
}

func encodeSubject(s string) string {
	if isASCII(s) {
		return s
	}
	return "=?UTF-8?B?" + base64.StdEncoding.EncodeToString([]byte(s)) + "?="
}

func isASCII(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] > 127 {
			return false
		}
	}
	return true
}

func sanitizeMsgIDPart(s string) string {
	return strings.NewReplacer("@", "_at_", " ", "_").Replace(s)
}
