package storage

import (
	"crypto/md5"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// DataDir is set at startup to the base data directory.
var DataDir string

// FilePath joins DataDir with the given path parts.
func FilePath(parts ...string) string {
	all := append([]string{DataDir}, parts...)
	return filepath.Join(all...)
}

// ReadJSON reads a JSON file into v. Returns nil if file not found.
func ReadJSON(path string, v any) error {
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	defer f.Close()
	return json.NewDecoder(f).Decode(v)
}

// WriteJSON marshals v and writes it atomically to path.
func WriteJSON(path string, v any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// UserFile returns the path to a per-user JSON file using MD5(email) as filename.
func UserFile(subdir, email string) string {
	hash := md5.Sum([]byte(email))
	name := fmt.Sprintf("%x.json", hash)
	return FilePath(subdir, name)
}
