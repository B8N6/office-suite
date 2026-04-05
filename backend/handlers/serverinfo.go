package handlers

import (
	"net"
	"net/http"
	"strings"
	"time"

	imapClient "b8n6mail/imap"
	"b8n6mail/middleware"
)

// ServerInfo returns runtime server diagnostics for the ticker bars.
func ServerInfo(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)

	sess := middleware.GetSession(r)

	// Client IP
	clientIP := r.Header.Get("X-Forwarded-For")
	if clientIP == "" {
		clientIP = r.Header.Get("X-Real-IP")
	}
	if clientIP == "" {
		host, _, _ := net.SplitHostPort(r.RemoteAddr)
		clientIP = host
	}
	clientIP = strings.TrimSpace(strings.Split(clientIP, ",")[0])

	// Server IP (first non-loopback)
	serverIP := "127.0.0.1"
	if addrs, err := net.InterfaceAddrs(); err == nil {
		for _, a := range addrs {
			if ipnet, ok := a.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
				if ipnet.IP.To4() != nil {
					serverIP = ipnet.IP.String()
					break
				}
			}
		}
	}

	info := map[string]any{
		"serverTime":     time.Now().UTC().Format("2006-01-02 15:04:05 UTC"),
		"serverTimeUnix": time.Now().Unix(),
		"timezone":       "UTC",
		"clientIp":       clientIP,
		"serverIp":       serverIP,
		"location":       "Local",
		"uptime":         "online",
		"version":        "B8N6 Office Suite v1.0.0",
	}

	// Mailbox health (if authenticated)
	if sess != nil {
		info["mailboxHealth"] = "ok"
		info["user"] = sess.Email

		// Quick IMAP ping — connect with short timeout
		healthChan := make(chan string, 1)
		go func() {
			c := imapClient.New(sess.Email, sess.Password, sess)
			if err := c.Connect("INBOX"); err != nil {
				healthChan <- "degraded"
				return
			}
			c.Close()
			healthChan <- "ok"
		}()
		select {
		case h := <-healthChan:
			info["mailboxHealth"] = h
		case <-time.After(3 * time.Second):
			info["mailboxHealth"] = "slow"
		}

		info["imapHost"] = sess.ImapHost
		info["smtpHost"] = sess.SmtpHost
	} else {
		info["mailboxHealth"] = "not-authenticated"
	}

	jsonOK(w, info)
}
