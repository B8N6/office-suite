package handlers

import (
	"bytes"
	"crypto/tls"
	"fmt"
	"io"
	"os"
	"mime"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"b8n6mail/middleware"

	"github.com/emersion/go-imap"
	"github.com/emersion/go-imap/client"
	gomail "github.com/emersion/go-message/mail"
	"github.com/gorilla/mux"
)

// GetAttachment fetches and streams an attachment from a message.
func GetAttachment(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)

	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	vars := mux.Vars(r)
	uidStr := vars["uid"]
	partStr := vars["part"]

	uid64, err := strconv.ParseUint(uidStr, 10, 32)
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid uid")
		return
	}
	uid := uint32(uid64)

	partNum, err := strconv.Atoi(partStr)
	if err != nil || partNum < 1 {
		jsonErr(w, http.StatusBadRequest, "invalid part number")
		return
	}

	folder := r.URL.Query().Get("folder")
	if folder == "" {
		folder = "INBOX"
	}

	// Connect manually so we can use low-level fetch
	addr := fmt.Sprintf("%s:%d", sess.ImapHost, sess.ImapPort)
	var conn *client.Client
	if sess.ImapSSL {
		tlsCfg := &tls.Config{InsecureSkipVerify: os.Getenv("TLS_VERIFY") != "true", ServerName: sess.ImapHost}
		conn, err = client.DialTLS(addr, tlsCfg)
	} else {
		conn, err = client.Dial(addr)
		if err == nil {
			tlsCfg := &tls.Config{InsecureSkipVerify: os.Getenv("TLS_VERIFY") != "true", ServerName: sess.ImapHost}
			_ = conn.StartTLS(tlsCfg)
		}
	}
	if err != nil {
		jsonErr(w, http.StatusBadGateway, "imap connect: "+err.Error())
		return
	}
	defer conn.Logout()

	if err := conn.Login(sess.Email, sess.Password); err != nil {
		jsonErr(w, http.StatusUnauthorized, "imap login: "+err.Error())
		return
	}

	if _, err := conn.Select(folder, false); err != nil {
		jsonErr(w, http.StatusBadGateway, "select folder: "+err.Error())
		return
	}

	seqset := new(imap.SeqSet)
	seqset.AddNum(uid)

	items := []imap.FetchItem{imap.FetchRFC822}
	ch := make(chan *imap.Message, 1)
	done := make(chan error, 1)
	go func() {
		done <- conn.UidFetch(seqset, items, ch)
	}()

	var raw *imap.Message
	for msg := range ch {
		raw = msg
	}
	if err := <-done; err != nil {
		jsonErr(w, http.StatusBadGateway, "fetch failed: "+err.Error())
		return
	}
	if raw == nil {
		jsonErr(w, http.StatusNotFound, "message not found")
		return
	}

	var rfc822Buf []byte
	for _, v := range raw.Body {
		rfc822Buf, _ = io.ReadAll(io.LimitReader(v, 100*1024*1024))
		break
	}
	if len(rfc822Buf) == 0 {
		jsonErr(w, http.StatusNotFound, "empty message body")
		return
	}

	mr, err := gomail.CreateReader(bytes.NewReader(rfc822Buf))
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "parse message: "+err.Error())
		return
	}

	idx := 0
	for {
		p, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			break
		}
		idx++
		if idx == partNum {
			ct, _, _ := mime.ParseMediaType(p.Header.Get("Content-Type"))
			cd := p.Header.Get("Content-Disposition")
			filename := extractAttachFilename(cd, p.Header.Get("Content-Type"))

			body, _ := io.ReadAll(io.LimitReader(p.Body, 50*1024*1024))

			if ct == "" {
				ct = "application/octet-stream"
			}
			w.Header().Set("Content-Type", ct)
			if filename != "" {
				// Sanitize filename: strip CR/LF (header-injection) and
				// quotes, and keep only the basename.
				safe := sanitizeHeaderFilename(filename)
				w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, safe))
			} else {
				w.Header().Set("Content-Disposition", "attachment")
			}
			w.Header().Set("Content-Length", strconv.Itoa(len(body)))
			w.WriteHeader(http.StatusOK)
			w.Write(body)
			return
		}
	}

	jsonErr(w, http.StatusNotFound, "attachment part not found")
}

func extractAttachFilename(cd, ct string) string {
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
	return ""
}

// sanitizeHeaderFilename strips characters that would break an HTTP header
// or enable header injection, and keeps only the basename.
func sanitizeHeaderFilename(s string) string {
	s = filepath.Base(s)
	// Remove CR, LF, quote, and backslash which break Content-Disposition
	r := strings.NewReplacer(
		"\r", "", "\n", "",
		`"`, "", `\`, "",
	)
	s = r.Replace(s)
	if len(s) > 200 {
		s = s[:200]
	}
	return s
}
