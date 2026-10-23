// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"zentro/internal/models"
	"zentro/internal/utils"
)

const (
	auditMaxSize  = 5 * 1024 * 1024 // 5 MB
	auditMaxFiles = 5
)

// legacyHistoryEntry mirrors the old HistoryEntry JSON shape for migration.
type legacyHistoryEntry struct {
	ID         string `json:"id"`
	Query      string `json:"query"`
	Profile    string `json:"profile"`
	Database   string `json:"database"`
	ProjectID  string `json:"project_id,omitempty"`
	EnvKey     string `json:"environment_key,omitempty"`
	DurationMs int64  `json:"duration_ms"`
	RowCount   int64  `json:"row_count"`
	Error      string `json:"error,omitempty"`
	ExecutedAt string `json:"executed_at"`
}

// SQLAuditEntry is one record in the audit log.
type SQLAuditEntry struct {
	ID                   string   `json:"id"`
	ExecutedAt           string   `json:"executed_at"`
	SourceTabID          string   `json:"source_tab_id,omitempty"`
	TabID                string   `json:"tab_id,omitempty"`
	StatementText        string   `json:"statement_text"`
	StatementIndex       int      `json:"statement_index"`
	StatementCount       int      `json:"statement_count"`
	Profile              string   `json:"profile"`
	Database             string   `json:"database"`
	Driver               string   `json:"driver,omitempty"`
	EnvKey               string   `json:"env_key,omitempty"`
	ProjectID            string   `json:"project_id,omitempty"`
	DurationMs           int64    `json:"duration_ms"`
	RowCount             int64    `json:"row_count"`
	IsSelect             bool     `json:"is_select"`
	Reason               string   `json:"reason,omitempty"`
	RiskLevel            string   `json:"risk_level,omitempty"`
	PreviewRowCount      int64    `json:"preview_row_count,omitempty"`
	UsedProtectionLayers []string `json:"used_protection_layers,omitempty"`
	SnapshotRef          string   `json:"snapshot_ref,omitempty"`
	Pinned               bool     `json:"pinned,omitempty"`
	Error                string   `json:"error,omitempty"`

	// The fields below are written by AppendMCPAudit (external agent calls),
	// never by AppendAudit (the UI's own query runs, unchanged by this
	// packet). All omitempty, so an old record missing them still decodes.
	//
	// Source names where the call came from: "mcp" for an external agent.
	// Empty means a UI query run, as before this packet.
	Source string `json:"source,omitempty"`
	// Actor is "mcp:<client>", the client's User-Agent, or "mcp:unknown"
	// when the request carried none.
	Actor string `json:"actor,omitempty"`
	// Action is the tool name for an MCP call.
	Action string `json:"action,omitempty"`
	// Verdict is classify_sql's risk verdict when the call carried one
	// (allowed, needs_confirmation, blocked); empty for a tool with no SQL
	// to judge.
	Verdict string `json:"verdict,omitempty"`
	// Outcome is "ok", "error", "denied", "rejected", or "expired".
	Outcome string `json:"outcome,omitempty"`
	// SQLNormalized and SQLHash replace StatementText for an MCP call: the
	// literal values in any sql argument are never stored, only the
	// normalized text (db.NormalizeLiterals) and its SHA-256 hash.
	SQLNormalized string `json:"sql_normalized,omitempty"`
	SQLHash       string `json:"sql_hash,omitempty"`
	// ProposalID and RestorePointID are filled once the change-proposal and
	// restore-point packets exist; no tool sets them yet.
	ProposalID     string `json:"proposal_id,omitempty"`
	RestorePointID string `json:"restore_point_id,omitempty"`
	// PrevHash and Hash chain MCP entries together so a rewritten or removed
	// record is detectable (VerifyChain in audit_chain.go). Hash covers
	// PrevHash plus this entry's own JSON with Hash itself blanked out.
	PrevHash string `json:"prev_hash,omitempty"`
	Hash     string `json:"hash,omitempty"`
}

// SQLAuditFilter controls what ListAudit returns.
type SQLAuditFilter struct {
	Search     string `json:"search"`
	Status     string `json:"status"` // "" | "success" | "error"
	Profile    string `json:"profile"`
	Limit      int    `json:"limit"`
	PinnedOnly bool   `json:"pinned_only,omitempty"`
}

// SQLAuditLogService appends query executions to an append-only JSONL file
// with size-based rotation.
type SQLAuditLogService struct {
	mu          sync.Mutex
	logger      *slog.Logger
	getProfile  func() *models.ConnectionProfile
	getProject  func() *models.Project
	getEnvKey   func() string
	getDriver   func() string
	getIdentity func() UserIdentityProvider // nil in Free/Pro single-user mode
	file        *os.File
	observers   []func(QueryExecutionAuditEvent)

	// lastMCPHash is the Hash of the most recently written MCP-chained
	// entry, carried across a file rotation since it lives in memory, not in
	// the file. mcpChainLoaded marks that loadLastMCPHashLocked has already
	// tried to recover it from disk once this process (lazily, on first use,
	// so a fresh start after a restart still continues the chain).
	lastMCPHash    string
	mcpChainLoaded bool
}

// AddExecutionObserver registers fn to be called after each audit entry is written.
// Safe to call before or after Startup. Multiple observers are supported.
func (s *SQLAuditLogService) AddExecutionObserver(fn func(QueryExecutionAuditEvent)) {
	s.mu.Lock()
	s.observers = append(s.observers, fn)
	s.mu.Unlock()
}

func NewSQLAuditLogService(
	getProfile func() *models.ConnectionProfile,
	getProject func() *models.Project,
	getEnvKey func() string,
	getDriver func() string,
	logger *slog.Logger,
) *SQLAuditLogService {
	return &SQLAuditLogService{
		getProfile: getProfile,
		getProject: getProject,
		getEnvKey:  getEnvKey,
		getDriver:  getDriver,
		logger:     logger,
	}
}

// AppendAudit records one query execution. Designed to be used as a
// QueryService execution hook (runs on a query goroutine, so mu is required).
func (s *SQLAuditLogService) AppendAudit(ev QueryExecutionAuditEvent) {
	if utils.IsInternalSQL(ev.StatementText) {
		return
	}

	profile := ""
	db := ""
	if p := s.getProfile(); p != nil {
		profile = p.Name
		db = p.DBName
	}
	driver := ""
	if s.getDriver != nil {
		driver = s.getDriver()
	}
	envKey := ""
	if s.getEnvKey != nil {
		envKey = s.getEnvKey()
	}
	projectID := ""
	if s.getProject != nil {
		if p := s.getProject(); p != nil {
			projectID = p.ID
		}
	}

	entry := SQLAuditEntry{
		ID:                   fmt.Sprintf("%d", time.Now().UnixNano()),
		ExecutedAt:           time.Now().UTC().Format(time.RFC3339Nano),
		SourceTabID:          ev.SourceTabID,
		TabID:                ev.TabID,
		StatementText:        ev.StatementText,
		StatementIndex:       ev.StatementIndex,
		StatementCount:       ev.StatementCount,
		Profile:              profile,
		Database:             db,
		Driver:               driver,
		EnvKey:               envKey,
		ProjectID:            projectID,
		DurationMs:           ev.DurationMs,
		RowCount:             ev.RowCount,
		IsSelect:             ev.IsSelect,
		Reason:               ev.Reason,
		RiskLevel:            ev.RiskLevel,
		PreviewRowCount:      ev.PreviewRowCount,
		UsedProtectionLayers: append([]string(nil), ev.UsedProtectionLayers...),
		SnapshotRef:          ev.SnapshotRef,
		Error:                ev.Error,
	}

	s.mu.Lock()
	if err := s.appendEntryLocked(entry); err != nil {
		if s.logger != nil {
			s.logger.Warn("audit: append failed", "err", err)
		}
	}
	obs := make([]func(QueryExecutionAuditEvent), len(s.observers))
	copy(obs, s.observers)
	s.mu.Unlock()

	for _, fn := range obs {
		fn(ev)
	}
}

// AppendMCPAudit records one external agent call. Unlike AppendAudit, the
// caller (ai_mcp.go) fills in everything about the call except the id,
// timestamp, and chain fields, which this sets. It is used for every MCP
// call, including a refused one, so Outcome may be "denied" or "error" with
// no tool ever having run.
func (s *SQLAuditLogService) AppendMCPAudit(entry SQLAuditEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.mcpChainLoaded {
		s.loadLastMCPHashLocked()
	}

	entry.ID = fmt.Sprintf("%d", time.Now().UnixNano())
	entry.ExecutedAt = time.Now().UTC().Format(time.RFC3339Nano)
	entry.Source = "mcp"
	entry.PrevHash = s.lastMCPHash

	hash, err := computeChainHash(entry.PrevHash, entry)
	if err != nil {
		return err
	}
	entry.Hash = hash

	if err := s.appendEntryLocked(entry); err != nil {
		return err
	}
	s.lastMCPHash = hash
	return nil
}

// loadLastMCPHashLocked recovers the last chained Hash from disk, for the
// first MCP audit write after a restart. It only looks at the tail window
// readJSONLFile already uses, the same bound ListAudit accepts; a chain
// entry older than that starts a fresh chain rather than failing outright.
// Must be called with mu held.
func (s *SQLAuditLogService) loadLastMCPHashLocked() {
	s.mcpChainLoaded = true
	p, err := s.auditFilePath()
	if err != nil {
		return
	}
	entries, err := s.readJSONLFile(p)
	if err != nil || len(entries) == 0 {
		// The primary file is empty right after a rotation; the newest
		// rotated file still holds the end of the chain.
		entries, err = s.readJSONLFile(p + ".1")
		if err != nil {
			return
		}
	}
	for i := len(entries) - 1; i >= 0; i-- {
		if entries[i].Hash != "" {
			s.lastMCPHash = entries[i].Hash
			return
		}
	}
}

func (s *SQLAuditLogService) appendEntryLocked(entry SQLAuditEntry) error {
	f, err := s.openFileLocked()
	if err != nil {
		return err
	}

	info, err := f.Stat()
	if err == nil && info.Size() >= auditMaxSize {
		if err := s.rotateLocked(); err != nil {
			return err
		}
		f, err = s.openFileLocked()
		if err != nil {
			return err
		}
	}

	data, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	_, err = f.Write(append(data, '\n'))
	return err
}

func (s *SQLAuditLogService) openFileLocked() (*os.File, error) {
	if s.file != nil {
		return s.file, nil
	}

	p, err := s.auditFilePath()
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return nil, err
	}

	// Lazy migration from legacy history.json on first open.
	if _, err := os.Stat(p); os.IsNotExist(err) {
		s.migrateLegacyHistory(p)
	}

	f, err := os.OpenFile(p, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return nil, err
	}
	s.file = f
	return f, nil
}

func (s *SQLAuditLogService) rotateLocked() error {
	if s.file != nil {
		_ = s.file.Close()
		s.file = nil
	}
	p, err := s.auditFilePath()
	if err != nil {
		return err
	}
	for i := auditMaxFiles - 1; i >= 1; i-- {
		old := fmt.Sprintf("%s.%d", p, i)
		src := fmt.Sprintf("%s.%d", p, i-1)
		if i == 1 {
			src = p
		}
		_ = os.Rename(src, old)
	}
	return nil
}

// ListAudit reads audit entries (tail-first, 256 KB window per file) and applies filter.
func (s *SQLAuditLogService) ListAudit(filter SQLAuditFilter) ([]SQLAuditEntry, error) {
	limit := filter.Limit
	if limit <= 0 {
		limit = 500
	}

	s.mu.Lock()
	p, err := s.auditFilePath()
	// Ensure lazy migration runs if needed.
	if err == nil {
		if _, statErr := os.Stat(p); os.IsNotExist(statErr) {
			s.migrateLegacyHistory(p)
		}
	}
	s.mu.Unlock()

	if err != nil {
		return nil, err
	}

	raw := s.readAllEntriesChronological(p)

	search := strings.ToLower(filter.Search)
	var filtered []SQLAuditEntry
	for _, e := range raw {
		if filter.PinnedOnly && !e.Pinned {
			continue
		}
		if filter.Status == "success" && e.Error != "" {
			continue
		}
		if filter.Status == "error" && e.Error == "" {
			continue
		}
		if filter.Profile != "" && e.Profile != filter.Profile {
			continue
		}
		if search != "" &&
			!strings.Contains(strings.ToLower(e.StatementText), search) &&
			!strings.Contains(strings.ToLower(e.Error), search) &&
			!strings.Contains(strings.ToLower(e.Profile), search) {
			continue
		}
		filtered = append(filtered, e)
	}

	// Return newest-first: take tail, then reverse.
	if len(filtered) > limit {
		filtered = filtered[len(filtered)-limit:]
	}
	for i, j := 0, len(filtered)-1; i < j; i, j = i+1, j-1 {
		filtered[i], filtered[j] = filtered[j], filtered[i]
	}
	return filtered, nil
}

// readAllEntriesChronological reads the rotated files oldest-first, then the
// primary file (newest), so the result is in the order the entries were
// written — the shape both ListAudit and VerifyChain need. Each file is read
// within readJSONLFile's own tail window; a file that errors (commonly: a
// rotated file that does not exist yet) just contributes nothing.
func (s *SQLAuditLogService) readAllEntriesChronological(primaryPath string) []SQLAuditEntry {
	var raw []SQLAuditEntry
	for i := auditMaxFiles - 1; i >= 1; i-- {
		if entries, err := s.readJSONLFile(fmt.Sprintf("%s.%d", primaryPath, i)); err == nil {
			raw = append(raw, entries...)
		}
	}
	if entries, err := s.readJSONLFile(primaryPath); err == nil {
		raw = append(raw, entries...)
	}
	return raw
}

func (s *SQLAuditLogService) readJSONLFile(path string) ([]SQLAuditEntry, error) {
	const chunkSize = 256 * 1024

	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil {
		return nil, err
	}
	size := info.Size()
	offset := size - chunkSize
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

	lines := strings.Split(string(buf), "\n")
	var entries []SQLAuditEntry
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var e SQLAuditEntry
		if err := json.Unmarshal([]byte(line), &e); err == nil {
			entries = append(entries, e)
		}
	}
	return entries, nil
}

// ClearAudit truncates the audit log and removes rotated files.
func (s *SQLAuditLogService) ClearAudit() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.file != nil {
		_ = s.file.Close()
		s.file = nil
	}
	p, err := s.auditFilePath()
	if err != nil {
		return err
	}
	if err := os.Truncate(p, 0); err != nil && !os.IsNotExist(err) {
		return err
	}
	for i := 1; i <= auditMaxFiles; i++ {
		_ = os.Remove(fmt.Sprintf("%s.%d", p, i))
	}
	return nil
}

// SetPinned updates the pinned flag for one entry by rewriting the file.
// Pin operations are rare so full rewrite is acceptable.
func (s *SQLAuditLogService) SetPinned(id string, pinned bool) error {
	p, err := s.auditFilePath()
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.file != nil {
		_ = s.file.Close()
		s.file = nil
	}

	data, err := os.ReadFile(p)
	if err != nil {
		return err
	}
	lines := strings.Split(string(data), "\n")
	var out []byte
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var e SQLAuditEntry
		if err := json.Unmarshal([]byte(line), &e); err == nil {
			if e.ID == id {
				e.Pinned = pinned
			}
			b, _ := json.Marshal(e)
			out = append(out, b...)
			out = append(out, '\n')
		}
	}
	return os.WriteFile(p, out, 0644)
}

// Reset closes the open file handle so the next access re-resolves the path.
// Call this when the active project changes.
func (s *SQLAuditLogService) Reset() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.file != nil {
		_ = s.file.Close()
		s.file = nil
	}
}

// AuditFilePath returns the resolved audit log path (for display).
func (s *SQLAuditLogService) AuditFilePath() (string, error) {
	return s.auditFilePath()
}

func (s *SQLAuditLogService) auditFilePath() (string, error) {
	if s.getProject != nil {
		if project := s.getProject(); project != nil && project.StoragePath != "" {
			dir := filepath.Join(project.StoragePath, ".zentro-tracking", "runtime")
			if err := os.MkdirAll(dir, 0o755); err != nil {
				return "", err
			}
			return filepath.Join(dir, "sql_audit.log"), nil
		}
	}
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "zentro", "sql_audit.log"), nil
}

// migrateLegacyHistory converts history.json → sql_audit.log on first access.
// Writes directly to the file to avoid calling back through appendEntryLocked
// (which would re-enter openFileLocked causing infinite recursion).
// Must be called with mu held.
func (s *SQLAuditLogService) migrateLegacyHistory(auditPath string) {
	legacyPath := strings.Replace(auditPath, "sql_audit.log", "history.json", 1)
	data, err := os.ReadFile(legacyPath)
	if err != nil {
		return
	}
	var legacy []legacyHistoryEntry
	if err := json.Unmarshal(data, &legacy); err != nil || len(legacy) == 0 {
		return
	}

	f, err := os.OpenFile(auditPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return
	}
	// Legacy is newest-first; write oldest-first into audit log.
	for i := len(legacy) - 1; i >= 0; i-- {
		h := legacy[i]
		entry := SQLAuditEntry{
			ID:             h.ID,
			ExecutedAt:     h.ExecutedAt,
			StatementText:  h.Query,
			StatementCount: 1,
			StatementIndex: 0,
			Profile:        h.Profile,
			Database:       h.Database,
			ProjectID:      h.ProjectID,
			EnvKey:         h.EnvKey,
			DurationMs:     h.DurationMs,
			RowCount:       h.RowCount,
			IsSelect:       looksLikeSelect(h.Query),
			Error:          h.Error,
		}
		if b, err := json.Marshal(entry); err == nil {
			_, _ = f.Write(append(b, '\n'))
		}
	}
	_ = f.Close()
	_ = os.Rename(legacyPath, legacyPath+".bak")
	if s.logger != nil {
		s.logger.Info("migrated legacy history to audit log", "count", len(legacy))
	}
}

func looksLikeSelect(q string) bool {
	return strings.HasPrefix(strings.ToUpper(strings.TrimSpace(q)), "SELECT")
}
