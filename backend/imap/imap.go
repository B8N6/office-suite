package imap

import (
	"bytes"
	"crypto/tls"
	"fmt"
	"io"
	"os"
	"mime"
	"regexp"
	"strings"
	"time"

	"b8n6mail/models"

	imaplib "github.com/emersion/go-imap"
	"github.com/emersion/go-imap/client"
	gomail "github.com/emersion/go-message/mail"
)

// Client wraps an IMAP connection for a single user session.
type Client struct {
	email    string
	password string
	host     string
	port     int
	ssl      bool
	conn     *client.Client
	folder   string
}

// New creates a Client from session data.
func New(email, password string, sess *models.SessionData) *Client {
	return &Client{
		email:    email,
		password: password,
		host:     sess.ImapHost,
		port:     sess.ImapPort,
		ssl:      sess.ImapSSL,
	}
}

// NewWithConfig creates a Client from a Domain config.
func NewWithConfig(email, password string, cfg *models.Domain) *Client {
	return &Client{
		email:    email,
		password: password,
		host:     cfg.ImapHost,
		port:     cfg.ImapPort,
		ssl:      cfg.ImapSSL,
	}
}

// Connect establishes an IMAP connection and selects the given folder.
func (c *Client) Connect(folder string) error {
	addr := fmt.Sprintf("%s:%d", c.host, c.port)
	var err error
	if c.ssl {
		tlsCfg := &tls.Config{InsecureSkipVerify: os.Getenv("TLS_VERIFY") != "true", ServerName: c.host}
		c.conn, err = client.DialTLS(addr, tlsCfg)
	} else {
		c.conn, err = client.Dial(addr)
		if err == nil {
			tlsCfg := &tls.Config{InsecureSkipVerify: os.Getenv("TLS_VERIFY") != "true", ServerName: c.host}
			_ = c.conn.StartTLS(tlsCfg)
		}
	}
	if err != nil {
		return fmt.Errorf("imap connect: %w", err)
	}
	if err = c.conn.Login(c.email, c.password); err != nil {
		c.conn.Logout()
		return fmt.Errorf("imap login: %w", err)
	}
	if folder != "" {
		if _, err = c.conn.Select(folder, false); err != nil {
			// try INBOX as fallback
			if _, err2 := c.conn.Select("INBOX", false); err2 != nil {
				return fmt.Errorf("imap select %s: %w", folder, err)
			}
			c.folder = "INBOX"
			return nil
		}
		c.folder = folder
	}
	return nil
}

// Close cleanly terminates the IMAP connection.
func (c *Client) Close() {
	if c.conn != nil {
		c.conn.Logout()
		c.conn = nil
	}
}

// SwitchFolder selects a different mailbox on the existing connection.
func (c *Client) SwitchFolder(folder string) error {
	if _, err := c.conn.Select(folder, false); err != nil {
		return err
	}
	c.folder = folder
	return nil
}

// -------------------------------------------------------------------------
// Folders
// -------------------------------------------------------------------------

// GetFolders lists all IMAP mailboxes with unread counts.
// System folders (Inbox, Sent, Drafts, Trash, Spam, Archive, Starred)
// are deduplicated by label — only the first match is kept.
func (c *Client) GetFolders() ([]models.Folder, error) {
	mailboxes := make(chan *imaplib.MailboxInfo, 20)
	done := make(chan error, 1)
	go func() {
		done <- c.conn.List("", "*", mailboxes)
	}()

	systemLabels := map[string]bool{
		"Inbox": true, "Sent": true, "Drafts": true, "Trash": true,
		"Spam": true, "Archive": true, "Starred": true,
	}
	seenSystem := make(map[string]bool)
	var folders []models.Folder

	for mb := range mailboxes {
		// Skip \Noselect containers (folder namespaces, not real folders)
		noselect := false
		for _, attr := range mb.Attributes {
			if strings.EqualFold(string(attr), "\\Noselect") {
				noselect = true
				break
			}
		}
		if noselect {
			continue
		}

		label := c.folderLabel(mb.Name)
		if systemLabels[label] {
			if seenSystem[label] {
				continue // already have this system folder
			}
			seenSystem[label] = true
		}

		f := models.Folder{
			Name:  mb.Name,
			Label: label,
			Icon:  c.folderIcon(mb.Name),
			Sort:  c.folderSort(mb.Name),
		}
		status, err := c.conn.Status(mb.Name, []imaplib.StatusItem{imaplib.StatusUnseen})
		if err == nil {
			f.Unread = int(status.Unseen)
		}
		folders = append(folders, f)
	}
	if err := <-done; err != nil {
		return nil, err
	}
	return folders, nil
}

// CreateFolder creates a new IMAP mailbox.
func (c *Client) CreateFolder(name string) error {
	return c.conn.Create(name)
}

// DeleteFolder removes an IMAP mailbox.
func (c *Client) DeleteFolder(name string) error {
	return c.conn.Delete(name)
}

func (c *Client) folderLabel(name string) string {
	upper := strings.ToUpper(name)
	// Strip common namespace prefixes (INBOX., [Gmail]/, etc.)
	stripped := upper
	for _, prefix := range []string{"INBOX.", "INBOX/", "[GMAIL]/", "[GOOGLE MAIL]/"} {
		stripped = strings.TrimPrefix(stripped, prefix)
	}
	// Take final segment for nested folders
	if idx := strings.LastIndexAny(stripped, "./"); idx >= 0 {
		stripped = stripped[idx+1:]
	}

	switch {
	case upper == "INBOX":
		return "Inbox"
	case stripped == "SENT" || stripped == "SENT ITEMS" || stripped == "SENT MAIL" ||
		stripped == "SENT MESSAGES" || stripped == "OUTBOX":
		return "Sent"
	case stripped == "DRAFTS" || stripped == "DRAFT":
		return "Drafts"
	case stripped == "TRASH" || stripped == "DELETED" || stripped == "DELETED ITEMS" ||
		stripped == "DELETED MESSAGES" || stripped == "BIN":
		return "Trash"
	case stripped == "JUNK" || stripped == "SPAM" || stripped == "JUNK E-MAIL" ||
		stripped == "BULK MAIL":
		return "Spam"
	case stripped == "ARCHIVE" || stripped == "ARCHIVES" || stripped == "ALL MAIL":
		return "Archive"
	case stripped == "STARRED" || stripped == "FLAGGED":
		return "Starred"
	default:
		// Return the original name's last segment, preserving case
		parts := strings.FieldsFunc(name, func(r rune) bool { return r == '.' || r == '/' })
		if len(parts) > 0 {
			return parts[len(parts)-1]
		}
		return name
	}
}

func (c *Client) folderIcon(name string) string {
	switch c.folderLabel(name) {
	case "Inbox":
		return "bi-inbox-fill"
	case "Sent":
		return "bi-send-fill"
	case "Drafts":
		return "bi-file-earmark-text"
	case "Trash":
		return "bi-trash3-fill"
	case "Spam":
		return "bi-shield-slash-fill"
	case "Archive":
		return "bi-archive-fill"
	case "Starred":
		return "bi-star-fill"
	default:
		return "bi-folder-fill"
	}
}

func (c *Client) folderSort(name string) int {
	switch c.folderLabel(name) {
	case "Inbox":
		return 0
	case "Starred":
		return 1
	case "Sent":
		return 2
	case "Drafts":
		return 3
	case "Archive":
		return 4
	case "Spam":
		return 5
	case "Trash":
		return 6
	default:
		return 10
	}
}

// -------------------------------------------------------------------------
// Messages
// -------------------------------------------------------------------------

// GetMessages fetches a page of messages from the currently selected folder.
func (c *Client) GetMessages(page, perPage int) ([]models.Message, int, error) {
	mbox := c.conn.Mailbox()
	if mbox == nil {
		return nil, 0, fmt.Errorf("no folder selected")
	}
	total := int(mbox.Messages)
	if total == 0 {
		return []models.Message{}, 0, nil
	}

	// Search all messages to get UIDs
	criteria := imaplib.NewSearchCriteria()
	uids, err := c.conn.UidSearch(criteria)
	if err != nil {
		return nil, 0, err
	}
	// Sort descending (newest first)
	reversed := make([]uint32, len(uids))
	for i, uid := range uids {
		reversed[len(uids)-1-i] = uid
	}

	// Paginate
	start := (page - 1) * perPage
	if start >= len(reversed) {
		return []models.Message{}, total, nil
	}
	end := start + perPage
	if end > len(reversed) {
		end = len(reversed)
	}
	pageUIDs := reversed[start:end]

	seqset := new(imaplib.SeqSet)
	for _, uid := range pageUIDs {
		seqset.AddNum(uid)
	}

	items := []imaplib.FetchItem{
		imaplib.FetchUid,
		imaplib.FetchFlags,
		imaplib.FetchEnvelope,
		imaplib.FetchRFC822Size,
		"BODY.PEEK[TEXT]<0.200>",
	}

	ch := make(chan *imaplib.Message, 20)
	fetchDone := make(chan error, 1)
	go func() {
		fetchDone <- c.conn.UidFetch(seqset, items, ch)
	}()

	msgMap := map[uint32]*imaplib.Message{}
	for msg := range ch {
		msgMap[msg.Uid] = msg
	}
	if err := <-fetchDone; err != nil {
		return nil, 0, err
	}

	var messages []models.Message
	for _, uid := range pageUIDs {
		raw, ok := msgMap[uid]
		if !ok {
			continue
		}
		m := parseEnvelope(raw, c.folder)
		messages = append(messages, m)
	}
	return messages, total, nil
}

// GetRawMessage returns the raw RFC822 bytes of a message by UID.
func (c *Client) GetRawMessage(uid uint32) ([]byte, error) {
	seqset := new(imaplib.SeqSet)
	seqset.AddNum(uid)
	items := []imaplib.FetchItem{imaplib.FetchRFC822}
	ch := make(chan *imaplib.Message, 1)
	done := make(chan error, 1)
	go func() {
		done <- c.conn.UidFetch(seqset, items, ch)
	}()
	var raw *imaplib.Message
	for msg := range ch {
		raw = msg
	}
	if err := <-done; err != nil {
		return nil, err
	}
	if raw == nil {
		return nil, fmt.Errorf("message not found")
	}
	for _, v := range raw.Body {
		data, _ := io.ReadAll(io.LimitReader(v, 100*1024*1024))
		return data, nil
	}
	return nil, fmt.Errorf("empty message body")
}

// GetMessage fetches the full content of a message by UID.
func (c *Client) GetMessage(uid uint32) (*models.MessageDetail, error) {
	seqset := new(imaplib.SeqSet)
	seqset.AddNum(uid)

	items := []imaplib.FetchItem{imaplib.FetchRFC822, imaplib.FetchFlags, imaplib.FetchUid, imaplib.FetchEnvelope}
	ch := make(chan *imaplib.Message, 1)
	done := make(chan error, 1)
	go func() {
		done <- c.conn.UidFetch(seqset, items, ch)
	}()

	var raw *imaplib.Message
	for msg := range ch {
		raw = msg
	}
	if err := <-done; err != nil {
		return nil, err
	}
	if raw == nil {
		return nil, fmt.Errorf("message not found")
	}

	// Extract RFC822 body
	var rfc822Buf []byte
	for _, v := range raw.Body {
		data, _ := io.ReadAll(io.LimitReader(v, 100*1024*1024))
		rfc822Buf = append(rfc822Buf, data...)
		break
	}

	detail := &models.MessageDetail{}
	base := parseEnvelope(raw, c.folder)
	detail.Message = base

	if len(rfc822Buf) == 0 {
		return detail, nil
	}

	// Parse with go-message
	mr, err := gomail.CreateReader(bytes.NewReader(rfc822Buf))
	if err != nil {
		detail.TextBody = string(rfc822Buf)
		return detail, nil
	}
	detail.DateFull = ""
	if t, err := mr.Header.Date(); err == nil {
		detail.DateFull = t.Format("Monday, January 2, 2006 3:04 PM")
	}

	partIndex := 0
	for {
		p, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			break
		}
		partIndex++
		ct, _, _ := mime.ParseMediaType(p.Header.Get("Content-Type"))
		cd := p.Header.Get("Content-Disposition")
		isAttachment := strings.Contains(strings.ToLower(cd), "attachment")

		body, _ := io.ReadAll(io.LimitReader(p.Body, 50*1024*1024))

		if isAttachment {
			name := extractFilename(cd, p.Header.Get("Content-Type"))
			att := models.Attachment{
				Part:     fmt.Sprintf("%d", partIndex),
				Name:     name,
				MimeType: ct,
				Size:     len(body),
			}
			detail.Attachments = append(detail.Attachments, att)
			detail.HasAttach = true
		} else {
			switch {
			case strings.HasPrefix(ct, "text/html"):
				detail.HTMLBody = string(body)
			case strings.HasPrefix(ct, "text/plain"):
				detail.TextBody = string(body)
			}
		}
	}

	return detail, nil
}

// Search performs an IMAP search and returns matching messages.
func (c *Client) Search(query string) ([]models.Message, error) {
	criteria := imaplib.NewSearchCriteria()
	criteria.Text = []string{query}
	uids, err := c.conn.UidSearch(criteria)
	if err != nil {
		return nil, err
	}
	if len(uids) == 0 {
		return []models.Message{}, nil
	}

	seqset := new(imaplib.SeqSet)
	for _, uid := range uids {
		seqset.AddNum(uid)
	}
	items := []imaplib.FetchItem{imaplib.FetchUid, imaplib.FetchFlags, imaplib.FetchEnvelope}
	ch := make(chan *imaplib.Message, 20)
	done := make(chan error, 1)
	go func() {
		done <- c.conn.UidFetch(seqset, items, ch)
	}()

	var messages []models.Message
	for msg := range ch {
		messages = append(messages, parseEnvelope(msg, c.folder))
	}
	if err := <-done; err != nil {
		return nil, err
	}
	return messages, nil
}

// PollInbox checks for new messages since sinceUID.
func (c *Client) PollInbox(sinceUID uint32) (int, []models.Message, uint32, error) {
	// Get unread count
	status, err := c.conn.Status("INBOX", []imaplib.StatusItem{imaplib.StatusUnseen})
	if err != nil {
		return 0, nil, 0, err
	}
	unread := int(status.Unseen)

	// Re-select inbox to get fresh data
	if _, err := c.conn.Select("INBOX", false); err != nil {
		return unread, nil, 0, nil
	}

	criteria := imaplib.NewSearchCriteria()
	if sinceUID > 0 {
		criteria.Uid = new(imaplib.SeqSet)
		criteria.Uid.AddRange(sinceUID+1, 0)
	}
	uids, err := c.conn.UidSearch(criteria)
	if err != nil || len(uids) == 0 {
		return unread, []models.Message{}, sinceUID, nil
	}

	var latestUID uint32
	for _, uid := range uids {
		if uid > latestUID {
			latestUID = uid
		}
	}

	seqset := new(imaplib.SeqSet)
	for _, uid := range uids {
		seqset.AddNum(uid)
	}
	items := []imaplib.FetchItem{imaplib.FetchUid, imaplib.FetchFlags, imaplib.FetchEnvelope}
	ch := make(chan *imaplib.Message, 20)
	done := make(chan error, 1)
	go func() {
		done <- c.conn.UidFetch(seqset, items, ch)
	}()

	var messages []models.Message
	for msg := range ch {
		messages = append(messages, parseEnvelope(msg, "INBOX"))
	}
	<-done

	return unread, messages, latestUID, nil
}

// -------------------------------------------------------------------------
// Actions
// -------------------------------------------------------------------------

// MarkRead sets or clears the \Seen flag on a message.
func (c *Client) MarkRead(uid uint32, read bool) error {
	seqset := new(imaplib.SeqSet)
	seqset.AddNum(uid)
	var op imaplib.StoreItem
	if read {
		op = imaplib.AddFlags
	} else {
		op = imaplib.RemoveFlags
	}
	flags := []interface{}{imaplib.SeenFlag}
	return c.conn.UidStore(seqset, op, flags, nil)
}

// ToggleFlag toggles the \Flagged flag on a message.
func (c *Client) ToggleFlag(uid uint32) error {
	seqset := new(imaplib.SeqSet)
	seqset.AddNum(uid)

	items := []imaplib.FetchItem{imaplib.FetchFlags, imaplib.FetchUid}
	ch := make(chan *imaplib.Message, 1)
	done := make(chan error, 1)
	go func() {
		done <- c.conn.UidFetch(seqset, items, ch)
	}()
	var msg *imaplib.Message
	for m := range ch {
		msg = m
	}
	<-done

	flagged := false
	if msg != nil {
		for _, f := range msg.Flags {
			if f == imaplib.FlaggedFlag {
				flagged = true
				break
			}
		}
	}

	var op imaplib.StoreItem
	if flagged {
		op = imaplib.RemoveFlags
	} else {
		op = imaplib.AddFlags
	}
	return c.conn.UidStore(seqset, op, []interface{}{imaplib.FlaggedFlag}, nil)
}

// MoveMessage copies a message to target and marks original deleted.
func (c *Client) MoveMessage(uid uint32, target string) error {
	seqset := new(imaplib.SeqSet)
	seqset.AddNum(uid)
	if err := c.conn.UidCopy(seqset, target); err != nil {
		return err
	}
	return c.conn.UidStore(seqset, imaplib.AddFlags, []interface{}{imaplib.DeletedFlag}, nil)
}

// DeleteMessage permanently deletes a message (marks deleted + expunge).
func (c *Client) DeleteMessage(uid uint32) error {
	seqset := new(imaplib.SeqSet)
	seqset.AddNum(uid)
	if err := c.conn.UidStore(seqset, imaplib.AddFlags, []interface{}{imaplib.DeletedFlag}, nil); err != nil {
		return err
	}
	return c.conn.Expunge(nil)
}

// TrashMessage moves a message to the Trash folder.
func (c *Client) TrashMessage(uid uint32) error {
	trash := c.GetFolderByLabel("Trash")
	if trash == "" {
		trash = "Trash"
	}
	return c.MoveMessage(uid, trash)
}

// SpamMessage moves a message to the Spam/Junk folder.
func (c *Client) SpamMessage(uid uint32) error {
	spam := c.GetFolderByLabel("Spam")
	if spam == "" {
		spam = "Junk"
	}
	return c.MoveMessage(uid, spam)
}

// EmptyFolder marks all messages in current folder as deleted and expunges.
func (c *Client) EmptyFolder() error {
	mbox := c.conn.Mailbox()
	if mbox == nil || mbox.Messages == 0 {
		return nil
	}
	seqset := new(imaplib.SeqSet)
	seqset.AddRange(1, mbox.Messages)
	if err := c.conn.Store(seqset, imaplib.AddFlags, []interface{}{imaplib.DeletedFlag}, nil); err != nil {
		return err
	}
	return c.conn.Expunge(nil)
}

// AppendMessage appends a raw RFC822 message to the given folder.
func (c *Client) AppendMessage(folder, rawMsg string, flags []string) error {
	return c.conn.Append(folder, flags, time.Now(), strings.NewReader(rawMsg))
}

// -------------------------------------------------------------------------
// Filters
// -------------------------------------------------------------------------

// ApplyFilters runs filter rules against the given UIDs in the selected folder.
func (c *Client) ApplyFilters(uids []uint32, rules []models.FilterRule) error {
	if len(uids) == 0 || len(rules) == 0 {
		return nil
	}

	seqset := new(imaplib.SeqSet)
	for _, uid := range uids {
		seqset.AddNum(uid)
	}
	items := []imaplib.FetchItem{imaplib.FetchUid, imaplib.FetchFlags, imaplib.FetchEnvelope}
	ch := make(chan *imaplib.Message, 20)
	done := make(chan error, 1)
	go func() {
		done <- c.conn.UidFetch(seqset, items, ch)
	}()
	var msgs []*imaplib.Message
	for msg := range ch {
		msgs = append(msgs, msg)
	}
	if err := <-done; err != nil {
		return err
	}

	for _, msg := range msgs {
		m := parseEnvelope(msg, c.folder)
		for _, rule := range rules {
			if !rule.Enabled {
				continue
			}
			if matchesRule(m, rule) {
				for _, action := range rule.Actions {
					c.applyAction(msg.Uid, action)
				}
			}
		}
	}
	return nil
}

func matchesRule(m models.Message, rule models.FilterRule) bool {
	results := make([]bool, len(rule.Conditions))
	for i, cond := range rule.Conditions {
		var field string
		switch cond.Field {
		case "from":
			field = strings.ToLower(m.From)
		case "to":
			field = strings.ToLower(m.To)
		case "subject":
			field = strings.ToLower(m.Subject)
		}
		val := strings.ToLower(cond.Value)
		switch cond.Op {
		case "contains":
			results[i] = strings.Contains(field, val)
		case "equals":
			results[i] = field == val
		case "startsWith":
			results[i] = strings.HasPrefix(field, val)
		case "endsWith":
			results[i] = strings.HasSuffix(field, val)
		}
	}
	if rule.Logic == "any" {
		for _, r := range results {
			if r {
				return true
			}
		}
		return false
	}
	// "all"
	for _, r := range results {
		if !r {
			return false
		}
	}
	return true
}

func (c *Client) applyAction(uid uint32, action models.FilterAction) {
	switch action.Type {
	case "read":
		c.MarkRead(uid, true)
	case "star":
		seqset := new(imaplib.SeqSet)
		seqset.AddNum(uid)
		c.conn.UidStore(seqset, imaplib.AddFlags, []interface{}{imaplib.FlaggedFlag}, nil)
	case "move":
		if action.Target != "" {
			c.MoveMessage(uid, action.Target)
		}
	case "delete":
		c.DeleteMessage(uid)
	}
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

// GetFolderByLabel returns the IMAP folder name matching a label like "Trash".
func (c *Client) GetFolderByLabel(label string) string {
	mailboxes := make(chan *imaplib.MailboxInfo, 20)
	done := make(chan error, 1)
	go func() {
		done <- c.conn.List("", "*", mailboxes)
	}()
	result := ""
	for mb := range mailboxes {
		if c.folderLabel(mb.Name) == label {
			result = mb.Name
		}
	}
	<-done
	return result
}

// GetUnread returns the unread message count for INBOX.
func (c *Client) GetUnread() (int, error) {
	status, err := c.conn.Status("INBOX", []imaplib.StatusItem{imaplib.StatusUnseen})
	if err != nil {
		return 0, err
	}
	return int(status.Unseen), nil
}

// -------------------------------------------------------------------------
// Internal parsing helpers
// -------------------------------------------------------------------------

var reSubjectNorm = regexp.MustCompile(`(?i)^(re|fwd|fw):\s*`)

func normalizeSubject(s string) string {
	for {
		ns := reSubjectNorm.ReplaceAllString(s, "")
		if ns == s {
			break
		}
		s = strings.TrimSpace(ns)
	}
	return strings.ToLower(strings.TrimSpace(s))
}

func threadKey(subject, inReplyTo string) string {
	ns := normalizeSubject(subject)
	if inReplyTo != "" {
		return ns + "|" + inReplyTo
	}
	return ns
}

func formatDate(t time.Time) string {
	now := time.Now()
	if t.Year() == now.Year() && t.Month() == now.Month() && t.Day() == now.Day() {
		return t.Format("3:04 PM")
	}
	if t.Year() == now.Year() {
		return t.Format("Jan 2")
	}
	return t.Format("Jan 2 2006")
}

func parseEnvelope(raw *imaplib.Message, folder string) models.Message {
	m := models.Message{
		UID:    raw.Uid,
		Folder: folder,
	}
	for _, f := range raw.Flags {
		switch f {
		case imaplib.SeenFlag:
			m.Seen = true
		case imaplib.FlaggedFlag:
			m.Flagged = true
		}
	}
	if env := raw.Envelope; env != nil {
		m.Subject = env.Subject
		if len(env.From) > 0 {
			m.From = addressString(env.From[0])
		}
		if len(env.To) > 0 {
			var tos []string
			for _, a := range env.To {
				tos = append(tos, addressString(a))
			}
			m.To = strings.Join(tos, ", ")
		}
		if len(env.Cc) > 0 {
			var ccs []string
			for _, a := range env.Cc {
				ccs = append(ccs, addressString(a))
			}
			m.CC = strings.Join(ccs, ", ")
		}
		if !env.Date.IsZero() {
			m.Date = formatDate(env.Date)
			m.DateRaw = env.Date.Format(time.RFC3339)
		}
		m.MessageID = env.MessageId
		m.InReplyTo = env.InReplyTo
		m.ThreadKey = threadKey(env.Subject, env.InReplyTo)
	}

	// Extract preview from body section
	for _, v := range raw.Body {
		data, _ := io.ReadAll(io.LimitReader(v, 100*1024*1024))
		text := string(data)
		text = cleanPreviewText(text)
		if len(text) > 150 {
			text = text[:150]
		}
		m.Preview = text
		break
	}

	return m
}

// cleanPreviewText strips HTML, MIME boundaries, header-like lines, and
// collapses whitespace so previews stay readable.
func cleanPreviewText(s string) string {
	// Drop MIME boundary markers and lone header-looking lines
	var out []string
	lines := strings.Split(s, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		// Skip MIME boundaries
		if strings.HasPrefix(line, "--") {
			continue
		}
		// Skip MIME/header-ish lines (e.g. "Content-Type: text/plain")
		lower := strings.ToLower(line)
		if strings.HasPrefix(lower, "content-type:") ||
			strings.HasPrefix(lower, "content-transfer-encoding:") ||
			strings.HasPrefix(lower, "content-disposition:") ||
			strings.HasPrefix(lower, "mime-version:") ||
			strings.HasPrefix(lower, "charset=") {
			continue
		}
		out = append(out, line)
	}
	joined := strings.Join(out, " ")
	joined = stripHTMLTags(joined)
	// Collapse whitespace runs
	joined = regexp.MustCompile(`\s+`).ReplaceAllString(joined, " ")
	return strings.TrimSpace(joined)
}

func addressString(a *imaplib.Address) string {
	if a == nil {
		return ""
	}
	if a.PersonalName != "" {
		return fmt.Sprintf("%s <%s@%s>", a.PersonalName, a.MailboxName, a.HostName)
	}
	if a.MailboxName != "" && a.HostName != "" {
		return fmt.Sprintf("%s@%s", a.MailboxName, a.HostName)
	}
	return a.MailboxName
}

var reHTML = regexp.MustCompile(`<[^>]*>`)

func stripHTMLTags(s string) string {
	return reHTML.ReplaceAllString(s, "")
}

func extractFilename(cd, ct string) string {
	for _, part := range strings.Split(cd, ";") {
		part = strings.TrimSpace(part)
		lower := strings.ToLower(part)
		if strings.HasPrefix(lower, "filename=") {
			name := part[9:]
			name = strings.Trim(name, "\"")
			if name != "" {
				return name
			}
		}
	}
	for _, part := range strings.Split(ct, ";") {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(strings.ToLower(part), "name=") {
			name := part[5:]
			name = strings.Trim(name, "\"")
			if name != "" {
				return name
			}
		}
	}
	return "attachment"
}
