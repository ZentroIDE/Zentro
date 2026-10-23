// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
)

func (a *App) GetSQLAuditLog(filter SQLAuditFilter) ([]SQLAuditEntry, error) {
	return a.svc.Audit.ListAudit(filter)
}

func (a *App) ClearSQLAuditLog() error {
	return a.svc.Audit.ClearAudit()
}

func (a *App) PinAuditEntry(id string, pinned bool) error {
	return a.svc.Audit.SetPinned(id, pinned)
}

func (a *App) GetAuditLogPath() (string, error) {
	return a.svc.Audit.AuditFilePath()
}

// ExportSQLAuditLog opens a save dialog and exports audit entries in the given format.
// format: "json" | "csv" | "sql"
func (a *App) ExportSQLAuditLog(format string) (string, error) {
	entries, err := a.svc.Audit.ListAudit(SQLAuditFilter{Limit: 10000})
	if err != nil {
		return "", err
	}

	switch strings.ToLower(format) {
	case "csv":
		return a.exportAuditCSV(entries)
	case "sql":
		return a.exportAuditSQL(entries)
	default:
		return a.exportAuditJSON(entries)
	}
}

func (a *App) exportAuditJSON(entries []SQLAuditEntry) (string, error) {
	filePath, err := a.saveDialogByExt("Export Audit Log", "sql_audit.json", "JSON Files (*.json)", "*.json")
	if err != nil {
		return "", fmt.Errorf("export audit: dialog: %w", err)
	}
	if filePath == "" {
		return "", nil
	}
	data, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return "", fmt.Errorf("export audit: marshal: %w", err)
	}
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return "", fmt.Errorf("export audit: write: %w", err)
	}
	return filePath, nil
}

func (a *App) exportAuditCSV(entries []SQLAuditEntry) (string, error) {
	filePath, err := a.saveDialogByExt("Export Audit Log", "sql_audit.csv", "CSV Files (*.csv)", "*.csv")
	if err != nil {
		return "", fmt.Errorf("export audit csv: dialog: %w", err)
	}
	if filePath == "" {
		return "", nil
	}

	f, err := os.Create(filePath)
	if err != nil {
		return "", fmt.Errorf("export audit csv: create: %w", err)
	}
	defer f.Close()

	// UTF-8 BOM for Excel compatibility
	_, _ = f.WriteString("\xEF\xBB\xBF")
	w := csv.NewWriter(f)
	_ = w.Write([]string{"executed_at", "profile", "database", "driver", "duration_ms", "row_count", "is_select", "statement_text", "error"})
	for _, e := range entries {
		isSelect := "false"
		if e.IsSelect {
			isSelect = "true"
		}
		_ = w.Write([]string{
			e.ExecutedAt, e.Profile, e.Database, e.Driver,
			fmt.Sprintf("%d", e.DurationMs),
			fmt.Sprintf("%d", e.RowCount),
			isSelect, e.StatementText, e.Error,
		})
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return "", fmt.Errorf("export audit csv: write: %w", err)
	}
	return filePath, nil
}

func (a *App) exportAuditSQL(entries []SQLAuditEntry) (string, error) {
	filePath, err := a.saveDialogByExt("Export Audit Log", "sql_audit.sql", "SQL Files (*.sql)", "*.sql")
	if err != nil {
		return "", fmt.Errorf("export audit sql: dialog: %w", err)
	}
	if filePath == "" {
		return "", nil
	}

	var sb strings.Builder
	sb.WriteString("-- Exported SQL Audit Log\n\n")
	for _, e := range entries {
		if e.StatementText != "" {
			sb.WriteString(strings.TrimRight(e.StatementText, "; \t\n"))
			sb.WriteString(";\n")
		}
	}
	if err := os.WriteFile(filePath, []byte(sb.String()), 0644); err != nil {
		return "", fmt.Errorf("export audit sql: write: %w", err)
	}
	return filePath, nil
}

func (a *App) GetAppDebugLog(opts AppDebugLogOpts) ([]AppDebugLogEntry, error) {
	return readDebugLog(a.svc.AppLog.CurrentPath(), opts)
}

func (a *App) GetAppDebugLogPath() string {
	return a.svc.AppLog.CurrentPath()
}

// LogClientEvent writes an FE-originated event into the same app log file as
// backend events, tagged "fe" so a click-to-data-loaded timeline can be read
// as one ordered stream by timestamp instead of correlating two separate
// logs by wall-clock guesswork. Fire-and-forget diagnostic aid — never
// blocks or errors the caller.
func (a *App) LogClientEvent(message string, fields map[string]string) {
	if a.logger == nil {
		return
	}
	keys := make([]string, 0, len(fields))
	for k := range fields {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	args := make([]any, 0, len(keys)*2)
	for _, k := range keys {
		args = append(args, k, fields[k])
	}
	a.logger.Info("[fe] "+message, args...)
}
