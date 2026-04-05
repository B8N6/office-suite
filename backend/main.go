package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"

	"b8n6mail/handlers"
	"b8n6mail/middleware"
	"b8n6mail/models"
	"b8n6mail/storage"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/gorilla/sessions"
)

// appConfig holds runtime config loaded from data/config.json or env vars.
type appConfig struct {
	Port          string `json:"port"`
	SessionSecret string `json:"session_secret"`
}

func main() {
	// Resolve data directory: ../data relative to the binary location.
	exe, err := os.Executable()
	if err != nil {
		log.Fatal("cannot resolve executable path:", err)
	}
	exeDir := filepath.Dir(exe)

	// Resolve data directory: try several locations in priority order.
	cwd, _ := os.Getwd()
	candidates := []string{
		filepath.Join(exeDir, "data"),       // binary next to data/ (production)
		filepath.Join(cwd, "data"),          // running from project root
		filepath.Join(cwd, "..", "data"),    // running from backend/ subdir
		filepath.Join(exeDir, "..", "data"), // binary in bin/, data in parent
	}
	var dataDir string
	for _, c := range candidates {
		abs, _ := filepath.Abs(c)
		if info, err := os.Stat(abs); err == nil && info.IsDir() {
			dataDir = abs
			break
		}
	}
	if dataDir == "" {
		dataDir, _ = filepath.Abs(filepath.Join(cwd, "data"))
	}

	storage.DataDir = dataDir

	// Ensure required directories exist.
	for _, sub := range []string{
		"scheduled", "signatures", "filters", "calendars",
		"calendar_shares", "sessions", "contacts", "tickets", "activity",
		"users", "cloud", "cloud/public",
	} {
		if err := os.MkdirAll(filepath.Join(dataDir, sub), 0755); err != nil {
			log.Printf("warn: mkdir %s: %v", sub, err)
		}
	}

	// Load config
	cfg := loadConfig(dataDir)

	// Seed default b8n6.com domain + owner if empty (fresh install)
	ensureDefaultDomain()
	ensureAdminConfig()

	// Initialise session store
	sessionsDir := filepath.Join(dataDir, "sessions")
	store := sessions.NewFilesystemStore(sessionsDir, []byte(cfg.SessionSecret))
	store.MaxLength(4096)
	// Register types used in session values
	registerSessionTypes()
	middleware.Store = store
	// Toggle the Secure-cookie flag via env var. Default off so local HTTP
	// dev works; operators should set SECURE_COOKIES=true behind HTTPS.
	middleware.SecureCookies = os.Getenv("SECURE_COOKIES") == "true"

	// Security warnings for insecure defaults
	if cfg.SessionSecret == "b8n6mail-secret-change-me" || cfg.SessionSecret == "b8n6mail-v2-change-this-secret-in-production" {
		log.Println("⚠  SECURITY: Using the default session secret. Set SESSION_SECRET env var or update data/config.json for production.")
	}
	if !middleware.SecureCookies {
		log.Println("⚠  SECURITY: Session cookies are not marked Secure. Set SECURE_COOKIES=true when serving over HTTPS.")
	}

	// Build router
	r := mux.NewRouter()

	// CORS middleware for development
	r.Use(corsMiddleware)
	// Panic recovery middleware
	r.Use(panicMiddleware)

	// Public auth routes
	r.HandleFunc("/api/auth/login", handlers.Login).Methods("POST", "OPTIONS")
	r.HandleFunc("/api/auth/logout", handlers.Logout).Methods("POST", "OPTIONS")
	r.HandleFunc("/api/auth/me", handlers.Me).Methods("GET", "OPTIONS")

	// Admin public routes
	r.HandleFunc("/admin/api/auth/login", handlers.AdminLogin).Methods("POST", "OPTIONS")
	r.HandleFunc("/admin/api/auth/logout", handlers.AdminLogout).Methods("POST", "OPTIONS")
	r.HandleFunc("/admin/api/auth/me", handlers.AdminMe).Methods("GET", "OPTIONS")

	// Admin protected routes
	admin := r.PathPrefix("/admin/api").Subrouter()
	admin.Use(middleware.RequireAdmin)
	admin.HandleFunc("/domains", handlers.ListDomains).Methods("GET", "OPTIONS")
	admin.HandleFunc("/domains", handlers.CreateDomain).Methods("POST", "OPTIONS")
	admin.HandleFunc("/domains/{id}", handlers.UpdateDomain).Methods("PUT", "OPTIONS")
	admin.HandleFunc("/domains/{id}", handlers.DeleteDomain).Methods("DELETE", "OPTIONS")
	admin.HandleFunc("/account", handlers.AdminChangePassword).Methods("POST", "OPTIONS")
	admin.HandleFunc("/branding", handlers.UpdateBranding).Methods("POST", "OPTIONS")
	admin.HandleFunc("/users", handlers.ListAdminUsers).Methods("GET", "OPTIONS")
	admin.HandleFunc("/users", handlers.CreateAdminUser).Methods("POST", "OPTIONS")
	admin.HandleFunc("/users/{id}", handlers.UpdateAdminUser).Methods("PUT", "OPTIONS")
	admin.HandleFunc("/users/{id}", handlers.DeleteAdminUser).Methods("DELETE", "OPTIONS")
	admin.HandleFunc("/users/{id}/password", handlers.ResetAdminPassword).Methods("POST", "OPTIONS")
	admin.HandleFunc("/user-activity", handlers.ListUserActivity).Methods("GET", "OPTIONS")
	admin.HandleFunc("/tickets", handlers.AdminListTickets).Methods("GET", "OPTIONS")
	admin.HandleFunc("/tickets/{id}/reply", handlers.AdminReplyTicket).Methods("POST", "OPTIONS")
	admin.HandleFunc("/storage", handlers.AdminListStorage).Methods("GET", "OPTIONS")

	// Public API routes (no auth required)
	r.HandleFunc("/api/server-info", handlers.ServerInfo).Methods("GET", "OPTIONS")
	r.HandleFunc("/api/branding", handlers.GetBranding).Methods("GET", "OPTIONS")
	// Public cloud share link — no auth required, resolved by token
	r.HandleFunc("/p/{token}", handlers.PublicDownloadCloudFile).Methods("GET", "OPTIONS")

	// Authenticated API routes
	api := r.PathPrefix("/api").Subrouter()
	api.Use(middleware.RequireAuth)

	// Folders
	api.HandleFunc("/folders", handlers.ListFolders).Methods("GET", "OPTIONS")
	api.HandleFunc("/folders", handlers.FolderAction).Methods("POST", "OPTIONS")

	// Messages — search must come before /{uid} to avoid routing conflict
	api.HandleFunc("/messages/search", handlers.SearchMessages).Methods("GET", "OPTIONS")
	api.HandleFunc("/messages", handlers.ListMessages).Methods("GET", "OPTIONS")
	api.HandleFunc("/messages/{uid}/download", handlers.DownloadMessage).Methods("GET", "OPTIONS")
	api.HandleFunc("/messages/{uid}", handlers.GetMessage).Methods("GET", "OPTIONS")
	api.HandleFunc("/messages/action", handlers.MessageAction).Methods("POST", "OPTIONS")

	// Contacts
	api.HandleFunc("/contacts", handlers.ListContacts).Methods("GET", "OPTIONS")
	api.HandleFunc("/contacts", handlers.CreateContact).Methods("POST", "OPTIONS")
	api.HandleFunc("/contacts/{id}", handlers.DeleteContact).Methods("DELETE", "OPTIONS")

	// Support tickets (user-facing)
	api.HandleFunc("/tickets", handlers.ListUserTickets).Methods("GET", "OPTIONS")
	api.HandleFunc("/tickets", handlers.CreateUserTicket).Methods("POST", "OPTIONS")
	api.HandleFunc("/tickets/{id}/reply", handlers.ReplyUserTicket).Methods("POST", "OPTIONS")

	// Cloud storage (user-facing)
	api.HandleFunc("/cloud/quota", handlers.GetCloudQuota).Methods("GET", "OPTIONS")
	api.HandleFunc("/cloud/files", handlers.ListCloudFiles).Methods("GET", "OPTIONS")
	api.HandleFunc("/cloud/upload", handlers.UploadCloudFile).Methods("POST", "OPTIONS")
	api.HandleFunc("/cloud/files/{id}", handlers.DeleteCloudFile).Methods("DELETE", "OPTIONS")
	api.HandleFunc("/cloud/files/{id}/share", handlers.ToggleCloudPublic).Methods("POST", "OPTIONS")
	api.HandleFunc("/cloud/files/{id}/access", handlers.SetCloudFileAccess).Methods("POST", "OPTIONS")
	api.HandleFunc("/cloud/files/{id}/download", handlers.DownloadCloudFile).Methods("GET", "OPTIONS")
	api.HandleFunc("/cloud/shared-with-me", handlers.ListSharedWithMe).Methods("GET", "OPTIONS")
	api.HandleFunc("/cloud/shared/{owner}/{id}/download", handlers.DownloadSharedFile).Methods("GET", "OPTIONS")

	// Send
	api.HandleFunc("/send", handlers.SendMessage).Methods("POST", "OPTIONS")

	// Attachment
	api.HandleFunc("/attachment/{uid}/{part}", handlers.GetAttachment).Methods("GET", "OPTIONS")

	// Schedule
	api.HandleFunc("/schedule", handlers.ListScheduled).Methods("GET", "OPTIONS")
	api.HandleFunc("/schedule", handlers.CreateScheduled).Methods("POST", "OPTIONS")
	api.HandleFunc("/schedule/{id}", handlers.DeleteScheduled).Methods("DELETE", "OPTIONS")
	api.HandleFunc("/schedule/run", handlers.RunScheduled).Methods("POST", "OPTIONS")

	// Filters
	api.HandleFunc("/filters", handlers.ListFilters).Methods("GET", "OPTIONS")
	api.HandleFunc("/filters", handlers.CreateFilter).Methods("POST", "OPTIONS")
	api.HandleFunc("/filters/{id}", handlers.UpdateFilter).Methods("PUT", "OPTIONS")
	api.HandleFunc("/filters/{id}", handlers.DeleteFilter).Methods("DELETE", "OPTIONS")
	api.HandleFunc("/filters/apply", handlers.ApplyFilters).Methods("POST", "OPTIONS")

	// Signature
	api.HandleFunc("/signature", handlers.GetSignature).Methods("GET", "OPTIONS")
	api.HandleFunc("/signature", handlers.SaveSignature).Methods("POST", "OPTIONS")

	// Calendar
	api.HandleFunc("/calendar", handlers.ListCalendar).Methods("GET", "OPTIONS")
	api.HandleFunc("/calendar", handlers.CreateEvent).Methods("POST", "OPTIONS")
	api.HandleFunc("/calendar/{id}", handlers.UpdateEvent).Methods("PUT", "OPTIONS")
	api.HandleFunc("/calendar/{id}", handlers.DeleteEvent).Methods("DELETE", "OPTIONS")
	api.HandleFunc("/calendar/share", handlers.ShareCalendar).Methods("POST", "OPTIONS")
	api.HandleFunc("/calendar/share/{email}", handlers.UnshareCalendar).Methods("DELETE", "OPTIONS")
	api.HandleFunc("/calendar/shares", handlers.ListShares).Methods("GET", "OPTIONS")

	// Poll & Unified
	api.HandleFunc("/poll", handlers.Poll).Methods("GET", "OPTIONS")
	api.HandleFunc("/unified", handlers.UnifiedInbox).Methods("POST", "OPTIONS")
	api.HandleFunc("/unified/message", handlers.UnifiedMessage).Methods("POST", "OPTIONS")

	// Account
	api.HandleFunc("/account", handlers.GetAccount).Methods("GET", "OPTIONS")
	api.HandleFunc("/account", handlers.UpdateAccount).Methods("POST", "OPTIONS")

	// Serve React frontend static files (SPA)
	frontendDir := filepath.Join(exeDir, "..", "frontend", "dist")
	if _, err := os.Stat(frontendDir); os.IsNotExist(err) {
		cwd, _ := os.Getwd()
		frontendDir = filepath.Join(cwd, "..", "frontend", "dist")
	}
	frontendDir, _ = filepath.Abs(frontendDir)
	spaHandler := spaFileServer(frontendDir)
	r.PathPrefix("/").Handler(spaHandler)

	port := cfg.Port
	if p := os.Getenv("PORT"); p != "" {
		port = p
	}
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Printf("B8N6 Mail v2 backend listening on :%s (data: %s)", port, dataDir)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("server error:", err)
		}
	}()

	<-quit
	log.Println("shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal("forced shutdown:", err)
	}
	log.Println("server stopped")
}

// loadConfig reads config from data/config.json, falling back to env vars and defaults.
func loadConfig(dataDir string) appConfig {
	cfg := appConfig{
		Port:          "8080",
		SessionSecret: "b8n6mail-secret-change-me",
	}
	cfgPath := filepath.Join(dataDir, "config.json")
	if f, err := os.Open(cfgPath); err == nil {
		defer f.Close()
		json.NewDecoder(f).Decode(&cfg)
	}
	if s := os.Getenv("SESSION_SECRET"); s != "" {
		cfg.SessionSecret = s
	}
	if p := os.Getenv("PORT"); p != "" {
		cfg.Port = p
	}
	return cfg
}

// ensureAdminConfig makes sure at least one owner exists. If the admin
// store is empty, it reads B8N6_INITIAL_OWNER_EMAIL (env var) and seeds
// that email as the first owner. This email must belong to a configured
// mail domain so the operator can log in via IMAP.
func ensureAdminConfig() {
	store, err := storage.ReadAdminStore()
	if err != nil {
		log.Printf("warn: read admin store: %v", err)
		return
	}
	if store != nil && len(store.Users) > 0 {
		return
	}
	seed := os.Getenv("B8N6_INITIAL_OWNER_EMAIL")
	if seed == "" {
		// Default owner: admin@b8n6.com (matches ensureDefaultDomain's b8n6.com)
		seed = "admin@b8n6.com"
		log.Printf("ℹ  No B8N6_INITIAL_OWNER_EMAIL set — defaulting to %s. Log in with that mailbox's IMAP password.", seed)
	}
	// Verify the seeded email's domain is configured, otherwise the owner
	// will never be able to log in via IMAP.
	if _, err := storage.FindDomain(seed); err != nil {
		log.Printf("⚠  WARN: B8N6_INITIAL_OWNER_EMAIL=%s — domain is not configured. Skipping bootstrap. Add the domain first.", seed)
		return
	}
	store.Users = append(store.Users, models.AdminUser{
		ID:              uuid.NewString(),
		Email:           strings.ToLower(seed),
		Username:        strings.Split(seed, "@")[0],
		Role:            "owner",
		AssignedDomains: []string{},
		CreatedAt:       time.Now().UTC().Format(time.RFC3339),
	})
	if err := storage.WriteAdminStore(store); err != nil {
		log.Printf("warn: seed owner: %v", err)
		return
	}
	log.Printf("✓  Seeded initial owner: %s (logs in via mailbox password)", seed)
}

// corsMiddleware allows requests from the Vite dev server.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		allowed := map[string]bool{
			"http://localhost:5173": true,
			"http://localhost:3000": true,
			"http://127.0.0.1:5173": true,
		}
		if allowed[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Requested-With")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// panicMiddleware recovers from panics and returns a 500 error.
func panicMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rcv := recover(); rcv != nil {
				buf := make([]byte, 4096)
				n := runtime.Stack(buf, false)
				log.Printf("panic: %v\n%s", rcv, buf[:n])
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				fmt.Fprintf(w, `{"error":"internal server error"}`)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// spaFileServer serves static files and falls back to index.html for SPA routing.
// spaFileServer serves files from dir, falling back to index.html for
// client-side routing. Guards against path traversal by verifying that the
// resolved absolute path still lives inside dir.
func spaFileServer(dir string) http.Handler {
	absDir, _ := filepath.Abs(dir)
	fs := http.FileServer(http.Dir(absDir))
	indexPath := filepath.Join(absDir, "index.html")

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Resolve the requested path and verify it stays inside absDir.
		cleaned := filepath.Clean(filepath.Join(absDir, r.URL.Path))
		if !strings.HasPrefix(cleaned, absDir+string(filepath.Separator)) && cleaned != absDir {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}

		info, err := os.Stat(cleaned)
		if os.IsNotExist(err) || (info != nil && info.IsDir() && r.URL.Path != "/") {
			// Serve index.html for SPA client-side routing
			http.ServeFile(w, r, indexPath)
			return
		}
		fs.ServeHTTP(w, r)
	})
}

// registerSessionTypes registers concrete types with gob for gorilla/sessions.
func registerSessionTypes() {
	// gorilla/sessions uses encoding/gob; primitive types (string, int, bool)
	// are registered automatically. No additional registration needed for our
	// usage since we store only basic types.
}

// ensureDefaultDomain seeds the b8n6.com domain on fresh installs so the
// default admin@b8n6.com owner can log in via IMAP. Namecheap's registrar
// hosting is used as the mail-server target (can be edited via admin UI).
func ensureDefaultDomain() {
	domains, err := storage.ReadDomains()
	if err == nil && len(domains) > 0 {
		return // already has at least one domain
	}
	def := models.Domain{
		ID:       uuid.NewString(),
		Domain:   "b8n6.com",
		ImapHost: "host42-4.registrar-servers.com",
		ImapPort: 993,
		ImapSSL:  true,
		SmtpHost: "host42-4.registrar-servers.com",
		SmtpPort: 465,
		SmtpSSL:  true,
		Active:   true,
		Notes:    "Default domain (Namecheap reseller hosting)",
		Created:  time.Now().UTC().Format(time.RFC3339),
		Updated:  time.Now().UTC().Format(time.RFC3339),
	}
	if err := storage.WriteDomains([]models.Domain{def}); err != nil {
		log.Printf("warn: seed default domain: %v", err)
		return
	}
	log.Printf("✓  Seeded default domain: %s (IMAP %s:%d, SMTP %s:%d)",
		def.Domain, def.ImapHost, def.ImapPort, def.SmtpHost, def.SmtpPort)
}
