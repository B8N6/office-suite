package models

// Branding holds customization for the application's appearance.
type Branding struct {
	AppName           string `json:"appName"`
	Tagline           string `json:"tagline"`
	Logo              string `json:"logo"`              // data: URL, shown in dark mode
	LogoLight         string `json:"logoLight"`         // data: URL, shown in light mode (falls back to logo)
	Favicon           string `json:"favicon"`           // data: URL
	// Dark-mode palette
	ColorPrimary      string `json:"colorPrimary"`      // hex
	ColorPrimaryDim   string `json:"colorPrimaryDim"`   // hex
	ColorBackground   string `json:"colorBackground"`   // hex
	ColorText         string `json:"colorText"`         // hex
	ColorAccent       string `json:"colorAccent"`       // hex — used for links/info
	// Light-mode palette
	ColorPrimaryLight      string `json:"colorPrimaryLight"`
	ColorPrimaryDimLight   string `json:"colorPrimaryDimLight"`
	ColorBackgroundLight   string `json:"colorBackgroundLight"`
	ColorTextLight         string `json:"colorTextLight"`
	ColorAccentLight       string `json:"colorAccentLight"`
	TickerTopLabel    string `json:"tickerTopLabel"`
	TickerBottomLabel string `json:"tickerBottomLabel"`
	ShowTickerTop     bool   `json:"showTickerTop"`
	ShowTickerBottom  bool   `json:"showTickerBottom"`
	SupportEmail      string `json:"supportEmail"`
	Updated           string `json:"updated"`
}

// DefaultBranding returns the baked-in b8n6 theme.
func DefaultBranding() Branding {
	return Branding{
		AppName:           "B8N6 MAIL",
		Tagline:           "Secure · Fast · Private",
		Logo:              "",
		Favicon:           "",
		ColorPrimary:           "#F5C400",
		ColorPrimaryDim:        "#b38e00",
		ColorBackground:        "#050505",
		ColorText:              "#F0EDE8",
		ColorAccent:            "#38bdf8",
		ColorPrimaryLight:      "#b38200",
		ColorPrimaryDimLight:   "#6b5000",
		ColorBackgroundLight:   "#ffffff",
		ColorTextLight:         "#000000",
		ColorAccentLight:       "#0284c7",
		TickerTopLabel:    "▶ LIVE",
		TickerBottomLabel: "B8N6",
		ShowTickerTop:     true,
		ShowTickerBottom:  true,
		SupportEmail:      "",
	}
}

// Domain holds IMAP/SMTP configuration for a mail domain.
type Domain struct {
	ID       string `json:"id"`
	Domain   string `json:"domain"`
	ImapHost string `json:"imap_host"`
	ImapPort int    `json:"imap_port"`
	ImapSSL  bool   `json:"imap_ssl"`
	SmtpHost string `json:"smtp_host"`
	SmtpPort int    `json:"smtp_port"`
	SmtpSSL  bool   `json:"smtp_ssl"`
	Active   bool   `json:"active"`
	Notes    string `json:"notes"`
	Icon      string `json:"icon"`      // data: URL, shown in dark mode
	IconLight string `json:"iconLight"` // data: URL, shown in light mode (falls back to icon)
	// Per-domain theme overrides (empty = inherit global branding).
	// Dark-mode palette:
	ColorPrimary    string `json:"colorPrimary"`
	ColorPrimaryDim string `json:"colorPrimaryDim"`
	ColorBackground string `json:"colorBackground"`
	ColorText       string `json:"colorText"`
	ColorAccent     string `json:"colorAccent"`
	// Light-mode palette:
	ColorPrimaryLight    string `json:"colorPrimaryLight"`
	ColorPrimaryDimLight string `json:"colorPrimaryDimLight"`
	ColorBackgroundLight string `json:"colorBackgroundLight"`
	ColorTextLight       string `json:"colorTextLight"`
	ColorAccentLight     string `json:"colorAccentLight"`
	// Cloud storage limits (0 = no limit / use system default)
	MaxFileSizeMB       int `json:"maxFileSizeMB"`       // per-file upload limit (owner sets)
	MaxUserStorageMB    int `json:"maxUserStorageMB"`    // per-user quota (domain admin sets)
	MaxDomainStorageMB  int `json:"maxDomainStorageMB"`  // overall domain cap (owner sets)
	Created  string `json:"created"`
	Updated  string `json:"updated"`
}

// Message is a lightweight mail envelope used in list views.
type Message struct {
	UID        uint32 `json:"uid"`
	Subject    string `json:"subject"`
	From       string `json:"from"`
	To         string `json:"to"`
	CC         string `json:"cc"`
	Date       string `json:"date"`
	DateRaw    string `json:"dateRaw"`
	Seen       bool   `json:"seen"`
	Flagged    bool   `json:"flagged"`
	HasAttach  bool   `json:"hasAttach"`
	Preview    string `json:"preview"`
	MessageID  string `json:"messageId"`
	InReplyTo  string `json:"inReplyTo"`
	References string `json:"references"`
	ThreadKey  string `json:"threadKey"`
	Folder     string `json:"folder"`
}

// MessageDetail extends Message with full body and attachments.
type MessageDetail struct {
	Message
	HTMLBody    string       `json:"htmlBody"`
	TextBody    string       `json:"textBody"`
	Attachments []Attachment `json:"attachments"`
	DateFull    string       `json:"dateFull"`
}

// Attachment describes a MIME attachment part.
type Attachment struct {
	Part     string `json:"part"`
	Name     string `json:"name"`
	MimeType string `json:"mimeType"`
	Size     int    `json:"size"`
}

// Folder represents an IMAP mailbox.
type Folder struct {
	Name   string `json:"name"`
	Label  string `json:"label"`
	Icon   string `json:"icon"`
	Unread int    `json:"unread"`
	Sort   int    `json:"sort"`
}

// FilterRule is a user-defined mail processing rule.
type FilterRule struct {
	ID         string            `json:"id"`
	Name       string            `json:"name"`
	Enabled    bool              `json:"enabled"`
	Logic      string            `json:"logic"` // "all" | "any"
	Conditions []FilterCondition `json:"conditions"`
	Actions    []FilterAction    `json:"actions"`
	Created    string            `json:"created"`
	Updated    string            `json:"updated"`
}

// FilterCondition is a single condition within a FilterRule.
type FilterCondition struct {
	Field string `json:"field"` // from|to|subject
	Op    string `json:"op"`    // contains|equals|startsWith|endsWith
	Value string `json:"value"`
}

// FilterAction is a single action to perform when a rule matches.
type FilterAction struct {
	Type   string `json:"type"`   // read|star|move|delete
	Target string `json:"target"` // folder name for move
}

// CalendarEvent is a user calendar entry.
type CalendarEvent struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Start       string `json:"start"`
	End         string `json:"end"`
	AllDay      bool   `json:"allDay"`
	Color       string `json:"color"`
	Location    string `json:"location"`
	Readonly    bool   `json:"readonly,omitempty"`
	OwnerEmail  string `json:"ownerEmail,omitempty"`
	Created     string `json:"created"`
	Updated     string `json:"updated"`
}

// ScheduledJob is an email queued for future delivery.
type ScheduledJob struct {
	ID          string `json:"id"`
	User        string `json:"user"`
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
	ScheduledTs int64  `json:"scheduledTs"`
	Status      string `json:"status"` // pending|sent|failed
	CreatedAt   string `json:"createdAt"`
	SentAt      string `json:"sentAt,omitempty"`
	Error       string `json:"error,omitempty"`
}

// Signature holds a user's email signature.
type Signature struct {
	HTML    string `json:"html"`
	Enabled bool   `json:"enabled"`
	Name    string `json:"name"`
}

// AdminConfig stores admin credentials (legacy single-user format).
// New format uses AdminStore with a list of AdminUsers.
type AdminConfig struct {
	Username     string `json:"username"`
	PasswordHash string `json:"password_hash"`
}

// AdminUser represents a single administrator account.
// Admin identity is proven by IMAP login to the linked email — there is NO
// separate admin password. Role is granted automatically when the email
// successfully authenticates against its mail server.
//   - Owners have full access to everything (domains, admins, branding).
//   - Admins are scoped to their AssignedDomains.
type AdminUser struct {
	ID              string   `json:"id"`
	Email           string   `json:"email"`    // login identifier (must match an IMAP mailbox)
	Username        string   `json:"username"` // display name
	Role            string   `json:"role"`     // "owner" | "admin"
	AssignedDomains []string `json:"assignedDomains"` // domain IDs; empty for owner
	CreatedAt       string   `json:"createdAt"`
	// Legacy field — kept only for backward-compat reading of old admin.json
	// files (e.g. the seeded admin@b8n6.com). Never written back.
	PasswordHash string `json:"password_hash,omitempty"`
}

// SupportTicket represents a support conversation between an email user
// and an admin. Tickets are stored per-user under data/tickets/.
type SupportTicket struct {
	ID        string           `json:"id"`
	UserEmail string           `json:"userEmail"`
	Subject   string           `json:"subject"`
	Status    string           `json:"status"` // "open" | "closed"
	Priority  string           `json:"priority"`
	CreatedAt string           `json:"createdAt"`
	UpdatedAt string           `json:"updatedAt"`
	Messages  []TicketMessage  `json:"messages"`
}

// TicketMessage is a single message in a support ticket thread.
type TicketMessage struct {
	ID        string `json:"id"`
	Author    string `json:"author"`     // email for users, username for admins
	AuthorKind string `json:"authorKind"` // "user" | "admin"
	Body      string `json:"body"`
	CreatedAt string `json:"createdAt"`
}

// UserRecord is the canonical account record for an email user. Created
// automatically on first successful login.
type UserRecord struct {
	ID          string `json:"id"`          // stable UUID
	Email       string `json:"email"`
	Domain      string `json:"domain"`
	CreatedAt   string `json:"createdAt"`
	LastSeenAt  string `json:"lastSeenAt"`
	StorageUsed int64  `json:"storageUsed"` // bytes
}

// CloudFile represents a single uploaded file in a user's cloud storage.
// AccessMode controls who can download:
//   "private" — only the owner
//   "emails"  — owner + AllowedEmails list (recipients must be logged in)
//   "domain"  — owner + any user on the owner's mail domain (logged in)
//   "public"  — anyone with the ShareToken (no login required)
type CloudFile struct {
	ID            string   `json:"id"`
	OwnerEmail    string   `json:"ownerEmail"`
	Name          string   `json:"name"`
	Size          int64    `json:"size"`
	MimeType      string   `json:"mimeType"`
	UploadedAt    string   `json:"uploadedAt"`
	AccessMode    string   `json:"accessMode"`              // "private" | "emails" | "domain" | "public"
	AllowedEmails []string `json:"allowedEmails,omitempty"` // set when AccessMode == "emails"
	IsPublic      bool     `json:"isPublic"`                // legacy — kept in sync with AccessMode == "public"
	ShareToken    string   `json:"shareToken,omitempty"`    // set when AccessMode == "public"
	DownloadCount int      `json:"downloadCount"`
}

// UserActivity is a lightweight per-user activity snapshot exposed to admins.
type UserActivity struct {
	Email           string `json:"email"`
	Domain          string `json:"domain"`
	LastLoginAt     string `json:"lastLoginAt"`
	ScheduledCount  int    `json:"scheduledCount"`
	FilterCount     int    `json:"filterCount"`
	ContactCount    int    `json:"contactCount"`
	CalendarEvents  int    `json:"calendarEvents"`
	HasSignature    bool   `json:"hasSignature"`
	OpenTickets     int    `json:"openTickets"`
}

// AdminStore is the new multi-admin storage format.
type AdminStore struct {
	Version int         `json:"version"`
	Users   []AdminUser `json:"users"`
}

// SessionData holds authenticated user connection details.
type SessionData struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
	ImapHost string `json:"imap_host"`
	ImapPort int    `json:"imap_port"`
	ImapSSL  bool   `json:"imap_ssl"`
	SmtpHost string `json:"smtp_host"`
	SmtpPort int    `json:"smtp_port"`
	SmtpSSL  bool   `json:"smtp_ssl"`
}
