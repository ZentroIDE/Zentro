// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"encoding/json"
	"os"
	"strings"
)

// AppDebugLogEntry is one parsed slog JSON record from the app log file.
type AppDebugLogEntry struct {
	Time  string                 `json:"time"`
	Level string                 `json:"level"`
	Msg   string                 `json:"msg"`
	Extra map[string]interface{} `json:"extra,omitempty"`
}

// AppDebugLogOpts controls what GetAppDebugLog returns.
type AppDebugLogOpts struct {
	LinesFromEnd int    `json:"lines_from_end"` // default 500
	MinLevel     string `json:"min_level"`      // "" | "DEBUG" | "INFO" | "WARN" | "ERROR"
	Search       string `json:"search"`
}

// readDebugLog reads the last N lines of the log file at path, parses JSON, applies filter.
func readDebugLog(path string, opts AppDebugLogOpts) ([]AppDebugLogEntry, error) {
	const readChunk = 256 * 1024 // 256 KB

	n := opts.LinesFromEnd
	if n <= 0 {
		n = 500
	}

	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return []AppDebugLogEntry{}, nil
		}
		return nil, err
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil {
		return nil, err
	}
	size := info.Size()
	offset := size - readChunk
	if offset < 0 {
		offset = 0
	}
	if _, err := f.Seek(offset, 0); err != nil {
		return nil, err
	}

	buf := make([]byte, size-offset)
	if _, err := f.Read(buf); err != nil {
		return nil, err
	}

	levelOrder := map[string]int{
		"DEBUG": 0, "INFO": 1, "WARN": 2, "ERROR": 3,
	}
	minOrder := 0
	if ml := strings.ToUpper(opts.MinLevel); ml != "" {
		if o, ok := levelOrder[ml]; ok {
			minOrder = o
		}
	}
	search := strings.ToLower(opts.Search)

	lines := strings.Split(string(buf), "\n")
	var entries []AppDebugLogEntry
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var raw map[string]interface{}
		if err := json.Unmarshal([]byte(line), &raw); err != nil {
			continue
		}
		e := AppDebugLogEntry{
			Time:  stringField(raw["time"]),
			Level: strings.ToUpper(stringField(raw["level"])),
			Msg:   stringField(raw["msg"]),
		}
		for k, v := range raw {
			if k == "time" || k == "level" || k == "msg" {
				continue
			}
			if e.Extra == nil {
				e.Extra = make(map[string]interface{})
			}
			e.Extra[k] = v
		}

		if minOrder > 0 {
			if o, ok := levelOrder[e.Level]; !ok || o < minOrder {
				continue
			}
		}

		if search != "" &&
			!strings.Contains(strings.ToLower(e.Msg), search) &&
			!strings.Contains(strings.ToLower(e.Level), search) {
			continue
		}

		entries = append(entries, e)
	}

	if len(entries) > n {
		entries = entries[len(entries)-n:]
	}
	return entries, nil
}

func stringField(v interface{}) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}
