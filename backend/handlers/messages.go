package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	imapClient "b8n6mail/imap"
	"b8n6mail/middleware"

	"github.com/gorilla/mux"
)

// ListMessages returns a paginated list of messages in a folder.
func ListMessages(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)

	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	folder := r.URL.Query().Get("folder")
	if folder == "" {
		folder = "INBOX"
	}

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	perPage := 25

	c := imapClient.New(sess.Email, sess.Password, sess)
	if err := c.Connect(folder); err != nil {
		jsonErr(w, http.StatusBadGateway, "imap connect failed: "+err.Error())
		return
	}
	defer c.Close()

	messages, total, err := c.GetMessages(page, perPage)
	if err != nil {
		jsonErr(w, http.StatusBadGateway, "fetch messages failed: "+err.Error())
		return
	}

	pages := (total + perPage - 1) / perPage
	if pages < 1 {
		pages = 1
	}

	jsonOK(w, map[string]any{
		"messages":   messages,
		"total":      total,
		"page":       page,
		"totalPages": pages,
	})
}

// GetMessage returns the full detail of a single message.
func GetMessage(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)

	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	vars := mux.Vars(r)
	uidStr := vars["uid"]
	uid64, err := strconv.ParseUint(uidStr, 10, 32)
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid uid")
		return
	}
	uid := uint32(uid64)

	folder := r.URL.Query().Get("folder")
	if folder == "" {
		folder = "INBOX"
	}

	c := imapClient.New(sess.Email, sess.Password, sess)
	if err := c.Connect(folder); err != nil {
		jsonErr(w, http.StatusBadGateway, "imap connect failed: "+err.Error())
		return
	}
	defer c.Close()

	// Mark as read
	_ = c.MarkRead(uid, true)

	msg, err := c.GetMessage(uid)
	if err != nil {
		jsonErr(w, http.StatusBadGateway, "fetch message failed: "+err.Error())
		return
	}

	jsonOK(w, map[string]any{"message": msg})
}

// DownloadMessage streams the raw RFC822 source as an .eml file.
func DownloadMessage(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)
	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	vars := mux.Vars(r)
	uid64, err := strconv.ParseUint(vars["uid"], 10, 32)
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid uid")
		return
	}
	uid := uint32(uid64)
	folder := r.URL.Query().Get("folder")
	if folder == "" {
		folder = "INBOX"
	}

	c := imapClient.New(sess.Email, sess.Password, sess)
	if err := c.Connect(folder); err != nil {
		jsonErr(w, http.StatusBadGateway, "imap connect failed: "+err.Error())
		return
	}
	defer c.Close()

	raw, err := c.GetRawMessage(uid)
	if err != nil {
		jsonErr(w, http.StatusBadGateway, "fetch failed: "+err.Error())
		return
	}

	w.Header().Set("Content-Type", "message/rfc822")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="message-%d.eml"`, uid))
	w.Header().Set("Content-Length", strconv.Itoa(len(raw)))
	_, _ = w.Write(raw)
}

// MessageAction performs an operation on a message.
func MessageAction(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)

	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	var req struct {
		Action string `json:"action"`
		UID    uint32 `json:"uid"`
		Folder string `json:"folder"`
		Target string `json:"target"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid request")
		return
	}
	if req.Folder == "" {
		req.Folder = "INBOX"
	}

	c := imapClient.New(sess.Email, sess.Password, sess)
	if err := c.Connect(req.Folder); err != nil {
		jsonErr(w, http.StatusBadGateway, "imap connect failed: "+err.Error())
		return
	}
	defer c.Close()

	var actionErr error
	switch req.Action {
	case "read":
		actionErr = c.MarkRead(req.UID, true)
	case "unread":
		actionErr = c.MarkRead(req.UID, false)
	case "flag":
		actionErr = c.ToggleFlag(req.UID)
	case "trash":
		actionErr = c.TrashMessage(req.UID)
	case "spam":
		actionErr = c.SpamMessage(req.UID)
	case "delete":
		actionErr = c.DeleteMessage(req.UID)
	case "move":
		if req.Target == "" {
			jsonErr(w, http.StatusBadRequest, "target folder required for move")
			return
		}
		actionErr = c.MoveMessage(req.UID, req.Target)
	case "empty":
		actionErr = c.EmptyFolder()
	default:
		jsonErr(w, http.StatusBadRequest, "unknown action: "+req.Action)
		return
	}

	if actionErr != nil {
		jsonErr(w, http.StatusBadGateway, "action failed: "+actionErr.Error())
		return
	}

	jsonOK(w, map[string]bool{"ok": true})
}

// SearchMessages performs a full-text search across a folder.
func SearchMessages(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)

	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	q := r.URL.Query().Get("q")
	if q == "" {
		jsonErr(w, http.StatusBadRequest, "q parameter required")
		return
	}
	folder := r.URL.Query().Get("folder")
	if folder == "" {
		folder = "INBOX"
	}

	c := imapClient.New(sess.Email, sess.Password, sess)
	if err := c.Connect(folder); err != nil {
		jsonErr(w, http.StatusBadGateway, "imap connect failed: "+err.Error())
		return
	}
	defer c.Close()

	messages, err := c.Search(q)
	if err != nil {
		jsonErr(w, http.StatusBadGateway, "search failed: "+err.Error())
		return
	}

	jsonOK(w, map[string]any{
		"messages":   messages,
		"total":      len(messages),
		"page":       1,
		"totalPages": 1,
	})
}
