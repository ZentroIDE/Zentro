// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strings"
	"time"

	"zentro/internal/constant"
	"zentro/internal/core"
	"zentro/internal/driver"
	"zentro/internal/models"
	"zentro/internal/utils"
)

// resolveConnectionProfileByID resolves a full connection profile from the
// global pool, rehydrating a saved password from the OS keyring. ID is the
// stable identity (never the freely renamable Name) and is tried first;
// falling back to a Name match accommodates callers that still pass one
// (e.g. FetchDatabaseSchema's ad hoc "whatever profile is currently active"
// lookups, sourced from a live ConnectionProfile rather than a stored
// ConnectionRef) without a rename breaking them outright.
//
// Shared by schema-diff, FetchDatabaseSchema, BuildQualifiedTableSelect,
// ConnectProjectEnvironment, and every pinned-connection call.
func (a *App) resolveConnectionProfileByID(id string) (*models.ConnectionProfile, error) {
	profiles, err := utils.LoadConnections()
	if err != nil {
		return nil, err
	}
	for _, p := range profiles {
		if p.ID == id {
			return a.hydrateProfilePassword(p)
		}
	}
	for _, p := range profiles {
		if p.Name == id {
			return a.hydrateProfilePassword(p)
		}
	}
	return nil, fmt.Errorf("connection profile %q not found", id)
}

// hydrateProfilePassword fills p.Password from the keyring when it wasn't
// already hydrated by LoadConnections (belt-and-braces re-fetch keyed by
// the profile's own stable ID).
func (a *App) hydrateProfilePassword(p *models.ConnectionProfile) (*models.ConnectionProfile, error) {
	if p.SavePassword && strings.TrimSpace(p.Password) == "" {
		if password, perr := a.populateProtectedProfilePassword(p.ID, "", p.Password); perr == nil && password != "" {
			p.Password = password
		}
	}
	return p, nil
}

func fetchSchemaSnapshot(conn *models.ConnectionProfile, profileName, dbName, schemaName string) (models.SchemaSnapshot, error) {
	if strings.TrimSpace(dbName) != "" {
		conn.DBName = strings.TrimSpace(dbName)
	}

	driverName := strings.ToLower(strings.TrimSpace(conn.Driver))
	schemaName = strings.TrimSpace(schemaName)
	if schemaName == "" {
		if driverName == constant.DriverPostgres {
			schemaName = "public"
		} else if driverName == constant.DriverSQLServer {
			schemaName = "dbo"
		} else if driverName == constant.DriverSQLite {
			schemaName = "main"
		}
	}

	snapshot := models.SchemaSnapshot{
		Driver:       driverName,
		ProfileName:  profileName,
		DatabaseName: conn.DBName,
		SchemaName:   schemaName,
		Label:        fmt.Sprintf("%s / %s", profileName, schemaName),
		CapturedAt:   time.Now().UTC().Format(time.RFC3339),
		Supported: driverName == constant.DriverPostgres ||
			driverName == constant.DriverMySQL ||
			driverName == constant.DriverSQLServer ||
			driverName == constant.DriverSQLite,
	}
	if !snapshot.Supported {
		snapshot.UnsupportedMsg = fmt.Sprintf("Schema diff migration is not supported for driver: %s.", conn.Driver)
		return snapshot, nil
	}

	drv, ok := core.Get(conn.Driver)
	if !ok {
		return models.SchemaSnapshot{}, fmt.Errorf("driver %q not found", conn.Driver)
	}

	db, err := drv.Open(conn)
	if err != nil {
		return models.SchemaSnapshot{}, fmt.Errorf("open connection: %w", err)
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	tables, err := drv.FetchSchemaTableNames(ctx, db, schemaName)
	if err != nil {
		return models.SchemaSnapshot{}, err
	}

	items, err := fetchSchemaTableSnapshots(ctx, drv, db, schemaName, tables)
	if err != nil {
		return models.SchemaSnapshot{}, err
	}

	snapshot.Tables = items
	if indexes, err := drv.FetchSchemaIndexes(ctx, db, schemaName); err == nil {
		snapshot.Indexes = indexes
	} else {
		fmt.Printf("Error fetching indexes: %v\n", err)
	}
	if constraints, err := drv.FetchSchemaConstraints(ctx, db, schemaName); err == nil {
		snapshot.Constraints = constraints
	} else {
		fmt.Printf("Error fetching constraints: %v\n", err)
	}
	if views, err := drv.FetchSchemaViews(ctx, db, schemaName); err == nil {
		snapshot.Views = views
	} else {
		fmt.Printf("Error fetching views: %v\n", err)
	}
	if routines, err := drv.FetchSchemaRoutines(ctx, db, schemaName); err == nil {
		snapshot.Routines = routines
	} else {
		fmt.Printf("Error fetching routines: %v\n", err)
	}

	snapshot.NormalizedDDL = buildNormalizedSchemaDDL(schemaName, &snapshot)
	return snapshot, nil
}

func fetchSchemaTableSnapshots(
	ctx context.Context,
	drv driver.DatabaseDriver,
	db *sql.DB,
	schemaName string,
	tables []string,
) ([]models.SchemaTableSnapshot, error) {
	type fetchResult struct {
		index int
		item  models.SchemaTableSnapshot
		err   error
	}

	resChan := make(chan fetchResult, len(tables))
	sem := make(chan struct{}, 8)

	for index, tableName := range tables {
		go func(idx int, name string) {
			sem <- struct{}{}
			defer func() { <-sem }()

			ddl, err := drv.FetchTableDDL(ctx, db, schemaName, name)
			if err != nil {
				resChan <- fetchResult{err: fmt.Errorf("fetch table %q DDL: %w", name, err)}
				return
			}

			columns, err := fetchTableColumnsForSchemaDiff(ctx, drv, db, schemaName, name)
			if err != nil {
				resChan <- fetchResult{err: fmt.Errorf("fetch table %q columns: %w", name, err)}
				return
			}

			resChan <- fetchResult{
				index: idx,
				item: models.SchemaTableSnapshot{
					Name:    name,
					DDL:     strings.TrimSpace(ddl),
					Columns: columns,
				},
			}
		}(index, tableName)
	}

	items := make([]models.SchemaTableSnapshot, len(tables))
	var firstErr error
	for range tables {
		res := <-resChan
		if res.err != nil {
			if firstErr == nil {
				firstErr = res.err
			}
			continue
		}
		if firstErr == nil {
			items[res.index] = res.item
		}
	}

	if firstErr != nil {
		return nil, firstErr
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].Name < items[j].Name
	})
	return items, nil
}

func fetchTableColumnsForSchemaDiff(
	ctx context.Context,
	drv driver.DatabaseDriver,
	db *sql.DB,
	schemaName string,
	tableName string,
) ([]models.ColumnDef, error) {
	rawColumns, err := drv.FetchTableColumns(ctx, db, schemaName, tableName)
	if err != nil {
		return nil, err
	}

	columns := make([]models.ColumnDef, 0, len(rawColumns))
	for _, column := range rawColumns {
		if column == nil {
			continue
		}
		columns = append(columns, *column)
	}
	return columns, nil
}

func buildNormalizedSchemaDDL(schemaName string, snapshot *models.SchemaSnapshot) string {
	var parts []string

	indexesByTable := make(map[string][]models.SchemaIndexSnapshot)
	for _, idx := range snapshot.Indexes {
		indexesByTable[idx.TableName] = append(indexesByTable[idx.TableName], idx)
	}

	constraintsByTable := make(map[string][]models.SchemaConstraintSnapshot)
	for _, c := range snapshot.Constraints {
		constraintsByTable[c.TableName] = append(constraintsByTable[c.TableName], c)
	}

	for _, table := range snapshot.Tables {
		ddl := strings.TrimSpace(strings.ReplaceAll(table.DDL, "\r\n", "\n"))
		if ddl == "" {
			continue
		}

		tableBlock := []string{
			fmt.Sprintf("-- Table: %s.%s\n%s;", schemaName, table.Name, strings.TrimSuffix(ddl, ";")),
		}

		for _, c := range constraintsByTable[table.Name] {
			cddl := strings.TrimSpace(strings.ReplaceAll(c.DDL, "\r\n", "\n"))
			tableBlock = append(tableBlock, fmt.Sprintf("-- Constraint: %s\n%s;", c.Name, strings.TrimSuffix(cddl, ";")))
		}

		for _, idx := range indexesByTable[table.Name] {
			iddl := strings.TrimSpace(strings.ReplaceAll(idx.DDL, "\r\n", "\n"))
			tableBlock = append(tableBlock, fmt.Sprintf("-- Index: %s\n%s;", idx.Name, strings.TrimSuffix(iddl, ";")))
		}

		parts = append(parts, strings.Join(tableBlock, "\n\n"))
	}

	for _, view := range snapshot.Views {
		ddl := strings.TrimSpace(strings.ReplaceAll(view.DDL, "\r\n", "\n"))
		parts = append(parts, fmt.Sprintf("-- View: %s.%s\n%s;", schemaName, view.Name, strings.TrimSuffix(ddl, ";")))
	}

	for _, routine := range snapshot.Routines {
		ddl := strings.TrimSpace(strings.ReplaceAll(routine.DDL, "\r\n", "\n"))
		parts = append(parts, fmt.Sprintf("-- Routine: %s.%s\n%s;", schemaName, routine.Name, strings.TrimSuffix(ddl, ";")))
	}

	return strings.Join(parts, "\n\n")
}
