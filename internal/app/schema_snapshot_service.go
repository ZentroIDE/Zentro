// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"zentro/internal/constant"
	"zentro/internal/core"
	dbpkg "zentro/internal/db"
)

type schemaSnapshotManifest struct {
	Schema      string   `json:"schema"`
	Driver      string   `json:"driver"`
	CapturedAt  string   `json:"captured_at"`
	Environment string   `json:"environment"`
	Tables      []string `json:"tables,omitempty"`
	Routines    []string `json:"routines,omitempty"`
}

func (a *App) beforeQueryStatement(statement queryStatement) (QueryAuditMeta, error) {
	if a.project == nil || a.profile == nil || a.db == nil || a.svc.SCAuto == nil {
		return QueryAuditMeta{}, nil
	}
	if !environmentIsProduction(string(a.currentProjectEnvironmentKey())) {
		return QueryAuditMeta{}, nil
	}

	risk := dbpkg.AnalyzeStatementRisk(statement.Text)
	if !isDDLOperation(risk.Operation) {
		return QueryAuditMeta{}, nil
	}

	existing := a.svc.Query.getPendingAuditMeta(statement.SourceTabID)
	if strings.TrimSpace(existing.SnapshotRef) != "" {
		return QueryAuditMeta{}, nil
	}

	snapshotRef, err := a.captureSchemaSnapshot(fmt.Sprintf("zentro.sc.auto: snapshot schema %s before %s", a.currentProjectSchema(), strings.ToLower(string(risk.Operation))))
	if err != nil {
		return QueryAuditMeta{}, err
	}
	if strings.TrimSpace(snapshotRef) == "" {
		return QueryAuditMeta{}, nil
	}

	return QueryAuditMeta{
		SnapshotRef:          snapshotRef,
		UsedProtectionLayers: []string{"schema_snapshot"},
	}, nil
}

func (a *App) captureSchemaSnapshot(message string) (string, error) {
	driver := strings.ToLower(strings.TrimSpace(a.profile.Driver))
	if driver != constant.DriverPostgres {
		return "", nil
	}

	schema := strings.TrimSpace(a.currentProjectSchema())
	if schema == "" {
		schema = "public"
	}

	files, err := buildPostgresSchemaSnapshotFiles(a.db, schema, string(a.currentProjectEnvironmentKey()))
	if err != nil {
		return "", err
	}
	if len(files) == 0 {
		return "", nil
	}

	result, err := a.svc.SCAuto.TrackSchemaSnapshot(a.project, schema, files, message)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(result.Hash), nil
}

func buildPostgresSchemaSnapshotFiles(db sqlExecutor, schema string, environment string) (map[string]string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	tables, err := listPostgresSchemaTables(ctx, db, schema)
	if err != nil {
		return nil, err
	}
	routines, err := listPostgresRoutineSnapshots(ctx, db, schema)
	if err != nil {
		return nil, err
	}
	drv, ok := core.Get(constant.DriverPostgres)
	if !ok {
		return nil, fmt.Errorf("driver %q not found", constant.DriverPostgres)
	}

	files := make(map[string]string)
	manifest := schemaSnapshotManifest{
		Schema:      schema,
		Driver:      constant.DriverPostgres,
		CapturedAt:  time.Now().UTC().Format(time.RFC3339),
		Environment: environment,
		Tables:      append([]string(nil), tables...),
		Routines:    make([]string, 0, len(routines)),
	}
	for _, tableName := range tables {
		ddl, err := drv.FetchTableDDLForSnapshot(ctx, db.(*sql.DB), schema, tableName)
		if err != nil {
			return nil, err
		}
		files[filepath.ToSlash(filepath.Join("tables", sanitizePathSegment(tableName)+".sql"))] = strings.TrimSpace(ddl) + "\n"
	}
	for _, routine := range routines {
		manifest.Routines = append(manifest.Routines, fmt.Sprintf("%s.%s", routine.Schema, routine.Name))
		files[filepath.ToSlash(filepath.Join("routines", sanitizePathSegment(routine.Name)+".sql"))] = strings.TrimSpace(routine.Definition) + "\n"
	}
	manifestJSON, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return nil, err
	}
	files["manifest.json"] = string(append(manifestJSON, '\n'))
	return files, nil
}

func listPostgresSchemaTables(ctx context.Context, exec sqlExecutor, schema string) ([]string, error) {
	rows, err := exec.QueryContext(ctx, `
		SELECT table_name
		FROM information_schema.tables
		WHERE table_schema = $1
			AND table_type = 'BASE TABLE'
		ORDER BY table_name
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tables := make([]string, 0)
	for rows.Next() {
		var tableName string
		if err := rows.Scan(&tableName); err != nil {
			return nil, err
		}
		tables = append(tables, tableName)
	}
	return tables, rows.Err()
}

func listPostgresRoutineSnapshots(ctx context.Context, exec sqlExecutor, schema string) ([]StoredProcedureSnapshot, error) {
	rows, err := exec.QueryContext(ctx, `
		SELECT
			n.nspname AS schema_name,
			p.proname AS routine_name,
			CASE p.prokind
				WHEN 'p' THEN 'procedure'
				ELSE 'function'
			END AS routine_kind,
			pg_get_functiondef(p.oid) AS routine_def
		FROM pg_proc p
		JOIN pg_namespace n ON n.oid = p.pronamespace
		WHERE p.prokind IN ('f', 'p')
			AND n.nspname = $1
		ORDER BY n.nspname, p.proname
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]StoredProcedureSnapshot, 0)
	for rows.Next() {
		var snap StoredProcedureSnapshot
		if err := rows.Scan(&snap.Schema, &snap.Name, &snap.Kind, &snap.Definition); err != nil {
			return nil, err
		}
		out = append(out, snap)
	}
	return out, rows.Err()
}

func isDDLOperation(operation dbpkg.WriteOperation) bool {
	switch operation {
	case dbpkg.WriteOperationAlter, dbpkg.WriteOperationCreate, dbpkg.WriteOperationDrop, dbpkg.WriteOperationTruncate:
		return true
	default:
		return false
	}
}
