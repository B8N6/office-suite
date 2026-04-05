package storage

// ReadUserJSON reads a per-user JSON file from subdir/md5(email).json.
func ReadUserJSON(subdir, email string, v any) error {
	return ReadJSON(UserFile(subdir, email), v)
}

// WriteUserJSON writes a per-user JSON file to subdir/md5(email).json.
func WriteUserJSON(subdir, email string, v any) error {
	return WriteJSON(UserFile(subdir, email), v)
}
