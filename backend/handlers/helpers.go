package handlers

import (
	"encoding/json"
	"net/http"
)

// jsonOK writes a 200 JSON response.
func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(v)
}

// jsonErr writes an error JSON response.
func jsonErr(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// recover500 is a deferred panic handler for handlers.
func recover500(w http.ResponseWriter) {
	if r := recover(); r != nil {
		jsonErr(w, http.StatusInternalServerError, "internal server error")
	}
}
