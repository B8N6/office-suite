# Changelog

All notable changes to B8N6 Office Suite.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) ·
Versioning: [SemVer 2.0](https://semver.org/spec/v2.0.0.html)

---

## [1.0.0] — 2026-04-05

Initial public release.

### Features — Email client
- Full IMAP mail reader + writer (any IMAP server)
- Multi-account support with colour-coded avatars
- Unified "All Inboxes" view with read-only cross-account message open
- Thread grouping by `In-Reply-To` / `References`
- TipTap rich-text compose with attachments (25MB cap)
- Reply / Reply-All / Forward with quoted original + threaded headers
- Inline quick-reply from message detail (Ctrl+Enter)
- Scheduled send (UTC-normalized future delivery)
- Filter rules (auto move / flag / read / delete)
- Custom IMAP folders (create/delete)
- Email signatures (HTML, toggleable)
- Server-side IMAP search with debounced input
- Contact book (auto + manual)
- Browser notifications (opt-in, mutable)
- 5-minute silent background polling
- Print to new window with sanitized HTML
- Keyboard shortcuts

### Features — Cloud storage
- Per-user file cloud with quota enforcement
- 4 share modes: private, specific emails, domain, public link
- Anonymous download via share tokens
- "Shared with me" inbox

### Features — Calendar
- Day / week / month views
- Event CRUD with colour coding
- Calendar sharing between users

### Features — Admin panel
- Sidebar-layout admin UI with dark-red theme
- **Dashboard** — stat cards + recent activity
- **Domains** — per-domain IMAP/SMTP config, logos (dark+light), per-domain colour palettes (dark+light), storage quotas
- **Users** — activity monitoring (scheduled/filters/contacts/calendar/tickets/storage per user)
- **Tickets** — threaded support-ticket conversations
- **Storage** — per-user storage-usage overview
- **Branding** — global app name, tagline, favicon, logos, dual-palette colours, ticker labels
- **Admin Users** — owner-only admin CRUD, email-linked identities, domain-assignment scoping
- **My Account** — info card (no passwords stored for admins)
- Two role levels: `owner` (full access) and `admin` (scoped to assigned domains)

### Features — Support tickets
- User-side ticket creation from Settings → Support
- Threaded conversation view (user + admin messages)
- Admin ticket inbox with Open/Closed/All filters
- Domain-scoped for non-owner admins

### Features — Theming
- Dark mode (default) + Light mode toggle
- Per-user preference persisted
- Global branding customization by owner
- Per-domain theme overrides by admins (dark + light palettes)
- b8n6.com aesthetic: Bebas Neue + Rajdhani + Share Tech Mono fonts, clip-path angular buttons, yellow grid background, live ticker bars

### Authentication model (v1.0)
- Unified login page for users, admins, and owners
- Admins authenticate via IMAP mailbox password (no separate admin password)
- Admin role granted automatically when email is in `data/admin.json`
- Dual-session (user + admin) set atomically on login
- 7-day session cookies, HttpOnly + SameSite=Lax + Secure (when behind HTTPS)

### Security
- TLS certificate verification configurable via `TLS_VERIFY` env var
- Secure cookies toggle via `SECURE_COOKIES` env var
- SPA file server path-traversal guard
- Email HTML sandboxing + script/handler stripping
- RFC-822 header injection prevention
- File upload size caps (per-file, per-user, per-domain)
- Attachment path sanitization
- Owner-only gates on: CreateDomain, DeleteDomain, UpdateBranding, all admin-user CRUD, ListAdminUsers
- Last-owner protection on DeleteAdminUser + UpdateAdminUser
- Unified error responses on UnifiedMessage (no credential oracle)
- Startup security warnings for insecure defaults

### Deployment
- Single-binary Go backend + static React frontend
- File-based JSON storage (no database)
- Ubuntu/Debian one-shot installer with hardened systemd unit
- Manual install + NGINX reverse proxy docs
- Environment-variable configuration

### Known limitations
- File-based storage has practical limit around ~50k users/domain
- No built-in spam filtering (delegated to mail server)
- No mobile apps (responsive web only)
- Support ticket notifications are in-app only
- Admin password recovery requires direct `data/admin.json` edit

---

_Future versions will track changes here under a new heading._
