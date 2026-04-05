package handlers

import (
	"encoding/json"
	"net/http"
	"sort"

	imapClient "b8n6mail/imap"
	"b8n6mail/middleware"
)

// ListFolders returns all IMAP folders for the authenticated user.
func ListFolders(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)

	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	c := imapClient.New(sess.Email, sess.Password, sess)
	if err := c.Connect(""); err != nil {
		jsonErr(w, http.StatusBadGateway, "imap connect failed: "+err.Error())
		return
	}
	defer c.Close()

	folders, err := c.GetFolders()
	if err != nil {
		jsonErr(w, http.StatusBadGateway, "failed to list folders: "+err.Error())
		return
	}

	// Sort by Sort field then Name
	sort.Slice(folders, func(i, j int) bool {
		if folders[i].Sort != folders[j].Sort {
			return folders[i].Sort < folders[j].Sort
		}
		return folders[i].Name < folders[j].Name
	})

	jsonOK(w, map[string]any{"folders": folders})
}

// FolderAction handles create/delete folder operations.
func FolderAction(w http.ResponseWriter, r *http.Request) {
	defer recover500(w)

	sess := middleware.GetSession(r)
	if sess == nil {
		jsonErr(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	var req struct {
		Op   string `json:"op"`
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		jsonErr(w, http.StatusBadRequest, "folder name required")
		return
	}

	c := imapClient.New(sess.Email, sess.Password, sess)
	if err := c.Connect(""); err != nil {
		jsonErr(w, http.StatusBadGateway, "imap connect failed: "+err.Error())
		return
	}
	defer c.Close()

	switch req.Op {
	case "create":
		if err := c.CreateFolder(req.Name); err != nil {
			jsonErr(w, http.StatusBadGateway, "create folder failed: "+err.Error())
			return
		}
	case "delete":
		if err := c.DeleteFolder(req.Name); err != nil {
			jsonErr(w, http.StatusBadGateway, "delete folder failed: "+err.Error())
			return
		}
	default:
		jsonErr(w, http.StatusBadRequest, "op must be create or delete")
		return
	}

	jsonOK(w, map[string]bool{"ok": true})
}
