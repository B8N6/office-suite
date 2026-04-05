# B8N6 Office Suite

A self-hosted, multi-domain web mail client with cloud storage, calendar sharing,
support tickets, and a full admin panel. Single Go binary + React SPA.

**Version:** 1.0.0
**License:** Proprietary — © B8N6
**Stack:** Go 1.22+ · React 18 · TypeScript · Vite · IMAP · SMTP

---

## Features

### For email users
| Feature | Description |
|---|---|
| **IMAP mail client** | Full-featured reader + writer supporting any IMAP server (Namecheap, Zoho, Google Workspace, custom) |
| **Multi-account** | Log in to multiple mailboxes; switch with one click; colour-coded avatars |
| **All Inboxes** | Unified cross-account inbox with read-only open of messages from other accounts |
| **Threading** | Messages grouped by `In-Reply-To` / `References` |
| **Rich compose** | TipTap WYSIWYG editor, attachments (25MB), CC/BCC, inline signatures |
| **Reply / Reply-All / Forward** | With automatic quoted original & proper thread headers |
| **Inline quick-reply** | Ctrl+Enter reply from the message view — no modal |
| **Scheduled send** | Defer delivery to any future date/time |
| **Filter rules** | Auto move/flag/read/delete based on From/To/Subject conditions |
| **Custom folders** | Create/delete IMAP folders from the UI |
| **Email signatures** | HTML editor, toggle on/off |
| **Search** | Server-side multi-field IMAP search with 550ms debounce |
| **Cloud storage** | Upload files, share with specific emails / domain / public link |
| **Calendar** | Day / week / month views; share calendar with teammates |
| **Contacts** | Auto-extracted from message addresses + manual add |
| **Support tickets** | Chat with admins from Settings → Support |
| **Dark / Light mode** | Per-user toggle; persists across sessions |
| **Browser notifications** | New-mail desktop push (opt-in, mutable) |
| **Background polling** | Silent 5-minute refresh |
| **Print** | Clean message printout in a new window |
| **Keyboard shortcuts** | `c` compose, `/` search, `Esc` close modals, `Ctrl+Enter` send |

### For domain admins
- Manage IMAP/SMTP settings for assigned domains
- Customize per-domain colors (light + dark) + logos + icons
- Set per-user storage quotas
- View user activity (mailbox, filters, calendar, tickets, storage)
- Reply to support tickets for users in assigned domains
- Scoped to assigned domains — cannot see or modify others

### For owners (superadmins)
- Create/delete domains
- Configure global branding (app name, logos, favicon, colors, ticker labels)
- Create/edit/delete admin accounts with domain assignments
- System-wide user monitoring
- System-wide storage usage overview
- System-wide ticket inbox
- Set domain-wide storage caps + per-file limits

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│           React SPA (Vite + TypeScript)         │
│   Zustand store · React Query · TipTap editor   │
└────────────────────┬────────────────────────────┘
                     │ HTTPS + session cookies
┌────────────────────▼────────────────────────────┐
│              Go backend (single binary)         │
│  gorilla/mux · gorilla/sessions · go-imap       │
│  ┌────────────┬────────────┬────────────┐       │
│  │ IMAP/SMTP  │ File-based │  Admin +   │       │
│  │ helpers    │ JSON store │  Public    │       │
│  │            │ (no DB)    │  routes    │       │
│  └────────────┴────────────┴────────────┘       │
└────────────────────┬────────────────────────────┘
                     │
        ┌────────────┴─────────────┐
        │                          │
   IMAP server              data/ directory
 (Namecheap, etc.)        (JSON + blobs + cloud files)
```

**No database.** All state lives in `data/` as JSON files keyed by MD5(email) for per-user scope. Cloud file contents are blob files + an index.json per user.

---

## Authentication model

- **Users** log in via `/api/auth/login` with their email + IMAP mailbox password.
- **Admin access** is proven by IMAP ownership. If your email is listed in `data/admin.json`, a successful IMAP login automatically grants an admin session. There is no separate admin password.
- **Owner** has full access; scoped **admins** only see their assigned domains.

See [INSTALL.md](INSTALL.md) for bootstrapping your first owner.

---

## Repository layout

```
b8n6-office-suite/
├── backend/              Go source (single binary output)
│   ├── main.go           HTTP server + routes
│   ├── handlers/         HTTP handler funcs (one file per feature)
│   ├── imap/             IMAP client wrapper
│   ├── smtp/             SMTP client wrapper
│   ├── storage/          File-based JSON persistence layer
│   ├── middleware/       Session + auth middleware
│   └── models/           Shared structs
├── frontend/             React + TypeScript SPA
│   ├── src/
│   │   ├── api/          Axios API client
│   │   ├── components/   UI components (Sidebar, MessageList, Cloud, Admin, …)
│   │   ├── pages/        LoginPage, MailApp, AdminPage
│   │   ├── hooks/        useBranding, useToast, usePolling, useNotifications
│   │   ├── store/        Zustand state
│   │   └── styles/       Single globals.css (theme variables + all UI styles)
│   └── vite.config.ts
├── data/                 Runtime state (gitignored; committed: config.example.json)
├── deploy-ubuntu.sh      One-shot install + systemd service setup
├── dev.sh                Start backend + frontend dev servers
├── build.sh              Production build
├── INSTALL.md            Step-by-step installation guide
├── CHANGELOG.md          Release notes
└── VERSION               Current version
```

---

## Quick start (development)

```bash
# Requirements: Go 1.22+, Node.js 20+
cd b8n6-office-suite
bash dev.sh
```

Opens frontend on **http://localhost:5173** proxied to the Go backend on **:8787**.

On first run the backend prints bootstrap instructions. Set your owner email:
```bash
export B8N6_INITIAL_OWNER_EMAIL=admin@yourdomain.com
```
then restart the backend. Log in via `/login` with that email + its mailbox password.

---

## Production deployment

See [INSTALL.md](INSTALL.md) for the full guide, or run the one-shot installer:

```bash
curl -fsSL https://raw.githubusercontent.com/B8N6/office-suite/main/deploy-ubuntu.sh | bash
```

This installs Go + Node.js, builds the binary, copies to `/opt/b8n6-office-suite`, and registers a systemd service.

---

## Data storage layout

```
data/
├── admin.json              admin users + roles
├── domains.json            IMAP/SMTP configs per domain
├── branding.json           global branding + light/dark palettes
├── config.json             server config (port, session secret)
├── sessions/               gorilla/sessions file store
├── users/                  per-user UUID records
├── activity/               last login timestamps per user
├── scheduled/              pending/sent scheduled emails per user
├── signatures/             HTML signatures per user
├── filters/                filter rules per user
├── calendars/              calendar events per user
├── calendar_shares/        calendar sharing grants
├── contacts/               per-user address book
├── tickets/                support tickets per user
├── cloud/                  per-user file index + blob contents
│   ├── <hash>/index.json
│   ├── <hash>/<file-id>.blob
│   └── public/             public share token pointers
└── uploads/                temp attachment upload dir (auto-cleaned)
```

---

## Security

Current hardening applied in v1.0:
- Session cookies: `HttpOnly` always, `Secure` via env var, `SameSite=Lax`
- CSRF-resistant (SameSite=Lax + credentialed fetches only from same origin)
- HTML email rendered inside sandboxed iframe + `sanitizeEmailHtml()` strips scripts/handlers
- Attachment uploads capped at 25MB; cloud files capped per-domain
- Path-traversal guards on SPA file server + attachment cleanup
- RFC-822 header injection prevention (CRLF stripped from all values)
- TLS verification togglable via `TLS_VERIFY=true` env var
- Admin ops gated by role (owner-only: branding, domain create/delete, admin user CRUD)
- Domain scope enforced on every admin read/write for non-owners
- Audit-logged security warnings at startup for insecure defaults

See [SECURITY.md](SECURITY.md) (TODO — not shipped in v1.0).

---

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | HTTP listen port |
| `SESSION_SECRET` | from config.json | Gorilla-sessions HMAC key (set a long random string in prod!) |
| `SECURE_COOKIES` | `false` | Set to `true` behind HTTPS to add Secure flag to cookies |
| `TLS_VERIFY` | `false` | Strict IMAP/SMTP certificate verification (recommended: `true` for production) |
| `B8N6_INITIAL_OWNER_EMAIL` | — | Bootstrap: email to seed as first owner on empty admin.json |

---

## Screenshots

> Screenshots are in [docs/screenshots/](docs/screenshots/) (add your own before pushing).

Suggested captures:
- `login.png` — login page with B8N6 logo + tagline
- `mail-inbox.png` — 3-pane layout with folder sidebar, message list, message detail
- `compose.png` — compose modal with TipTap toolbar + attachment area
- `calendar-month.png` — calendar month view with events
- `cloud-files.png` — cloud storage with quota bar + file table
- `share-modal.png` — share modal with 4 access options
- `admin-dashboard.png` — admin sidebar layout + dashboard stats
- `admin-branding.png` — branding tab with dual dark/light palettes
- `admin-tickets.png` — support ticket thread view
- `light-mode.png` — light theme variant

---

## Support

- **Docs**: [INSTALL.md](INSTALL.md) · [CHANGELOG.md](CHANGELOG.md)
- **Issues**: https://github.com/B8N6/office-suite/issues
- **Email**: support@b8n6.com
