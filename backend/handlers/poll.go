package handlers

import (
	"net/http"
	"strconv"

	imapClient "b8n6mail/imap"
	"b8n6mail/middleware"
	"b8n6mail/models"
)

// Poll checks for new messages and returns unread count.
func Poll(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)

	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	sinceStr := r.URL.Query().Get("since")
	var sinceUID uint32
	if sinceStr != "" {
		v, _ := strconv.ParseUint(sinceStr, 10, 32)
		sinceUID = uint32(v)
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

	unread, messages, latestUID, err := c.PollInbox(sinceUID)
	if err != nil {
		jsonErr(w, http.StatusBadGateway, "poll failed: "+err.Error())
		return
	}

	// Apply filters to new messages
	if len(messages) > 0 {
		rules := loadFilters(sess.Email)
		var enabled []models.FilterRule
		for _, f := range rules {
			if f.Enabled {
				enabled = append(enabled, f)
			}
		}
		if len(enabled) > 0 {
			uids := make([]uint32, 0, len(messages))
			for _, m := range messages {
				uids = append(uids, m.UID)
			}
			_ = c.ApplyFilters(uids, enabled)
		}
	}

	if messages == nil {
		messages = []models.Message{}
	}

	jsonOK(w, map[string]any{
		"unread":    unread,
		"messages":  messages,
		"latestUid": latestUID,
	})
}
