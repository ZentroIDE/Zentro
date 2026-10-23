// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"zentro/internal/core"
	"zentro/internal/driver"
	"zentro/internal/models"
)

// getDriver looks up a registered DatabaseDriver by name.
// Pattern: Dependency Inversion — app depends on core.Get (abstraction), not concrete drivers.
func getDriver(name string) (driver.DatabaseDriver, bool) {
	return core.Get(name)
}

// FetchTableColumns and its five siblings below take an explicit
// profile/db pair rather than reading the ambient s.getProfile()/s.getDB()
// closures, because their callers (app_connection_facade.go) resolve the
// connection via App.resolvePinnedConnection — a Table/Catalog tab's own
// Pinned Environment (ADR-0001) when pinned, the ambient connection
// otherwise.

func (s *ConnectionService) FetchTableColumns(profile *models.ConnectionProfile, db *sql.DB, schema, table string) ([]*models.ColumnDef, error) {
	if profile == nil || db == nil {
		return nil, fmt.Errorf("no active connection")
	}
	d, ok := getDriver(profile.Driver)
	if !ok {
		return nil, fmt.Errorf("driver not found")
	}

	prefs := s.getPrefs()
	ctx, cancel := context.WithTimeout(s.ctx, time.Duration(prefs.SchemaTimeout)*time.Second)
	defer cancel()

	s.logger.Info("fetching table columns", "schema", schema, "table", table)
	return d.FetchTableColumns(ctx, db, schema, table)
}

func (s *ConnectionService) AlterTableColumn(profile *models.ConnectionProfile, db *sql.DB, schema, table string, old, updated models.ColumnDef) error {
	if profile == nil || db == nil {
		return fmt.Errorf("no active connection")
	}
	d, ok := getDriver(profile.Driver)
	if !ok {
		return fmt.Errorf("driver not found")
	}

	prefs := s.getPrefs()
	ctx, cancel := context.WithTimeout(s.ctx, time.Duration(prefs.SchemaTimeout)*time.Second)
	defer cancel()

	s.logger.Info("altering column", "schema", schema, "table", table, "column", old.Name)
	return d.AlterTableColumn(ctx, db, schema, table, &old, &updated)
}

func (s *ConnectionService) ReorderTableColumns(profile *models.ConnectionProfile, db *sql.DB, schema, table string, newOrder []string) error {
	if profile == nil || db == nil {
		return fmt.Errorf("no active connection")
	}
	d, ok := getDriver(profile.Driver)
	if !ok {
		return fmt.Errorf("driver not found")
	}
	prefs := s.getPrefs()
	ctx, cancel := context.WithTimeout(s.ctx, time.Duration(prefs.SchemaTimeout)*time.Second)
	defer cancel()
	s.logger.Info("reordering columns", "schema", schema, "table", table, "newOrder", newOrder)
	return d.ReorderTableColumns(ctx, db, schema, table, newOrder)
}

func (s *ConnectionService) FetchTableRelationships(profile *models.ConnectionProfile, db *sql.DB, schema, table string) ([]models.TableRelationship, error) {
	if profile == nil || db == nil {
		return nil, fmt.Errorf("no active connection")
	}
	d, ok := getDriver(profile.Driver)
	if !ok {
		return nil, fmt.Errorf("driver not found")
	}
	prefs := s.getPrefs()
	ctx, cancel := context.WithTimeout(s.ctx, time.Duration(prefs.SchemaTimeout)*time.Second)
	defer cancel()

	s.logger.Info("fetching table relationships", "schema", schema, "table", table)
	return d.FetchTableRelationships(ctx, db, schema, table)
}

const (
	// referencingRowsLimit caps how many referencing rows one probe counts;
	// beyond it the answer is "at least this many".
	referencingRowsLimit = 1000
	// maxReferencingBatches bounds how many statements one probe may cost. A
	// delete with more keys than fit is reported unverified, so it is warned
	// about rather than passed on a partial look.
	maxReferencingBatches = 20
)

// CountReferencingRows tells, for each probe, how many rows of the child table
// really reference the given parent keys. It answers "would this delete hit
// the foreign key" from the data instead of the schema: a key nothing points
// at is safe to delete even though a constraint exists.
//
// It never fails as a whole because one probe did. A probe it could not answer
// comes back unverified, and the caller must treat that as "may be referenced".
func (s *ConnectionService) CountReferencingRows(profile *models.ConnectionProfile, db *sql.DB, probes []models.ReferencingRowsProbe) ([]models.ReferencingRowsResult, error) {
	if profile == nil || db == nil {
		return nil, fmt.Errorf("no active connection")
	}
	d, ok := getDriver(profile.Driver)
	if !ok {
		return nil, fmt.Errorf("driver not found")
	}
	prefs := s.getPrefs()
	ctx, cancel := context.WithTimeout(s.ctx, time.Duration(prefs.SchemaTimeout)*time.Second)
	defer cancel()

	results := make([]models.ReferencingRowsResult, 0, len(probes))
	for _, probe := range probes {
		results = append(results, s.countReferencingRowsFor(ctx, d, db, probe))
	}
	return results, nil
}

func (s *ConnectionService) countReferencingRowsFor(ctx context.Context, d driver.DatabaseDriver, db *sql.DB, probe models.ReferencingRowsProbe) models.ReferencingRowsResult {
	result := models.ReferencingRowsResult{Key: probe.Key}
	unverified := func(reason string) models.ReferencingRowsResult {
		result.Verified = false
		result.Error = reason
		return result
	}

	if len(probe.Columns) == 0 {
		return unverified("no columns to match")
	}
	if len(probe.Keys) == 0 {
		// Nothing was deleted that could be referenced.
		result.Verified = true
		return result
	}

	perBatch := driver.MaxBindParams / len(probe.Columns)
	if perBatch < 1 {
		return unverified("too many columns to probe")
	}
	if (len(probe.Keys)+perBatch-1)/perBatch > maxReferencingBatches {
		return unverified("too many keys to check")
	}

	var total int64
	for start := 0; start < len(probe.Keys); start += perBatch {
		end := start + perBatch
		if end > len(probe.Keys) {
			end = len(probe.Keys)
		}
		count, hasMore, err := d.CountReferencingRows(ctx, db, probe.Schema, probe.Table, probe.Columns, probe.Keys[start:end], referencingRowsLimit-int(total))
		if err != nil {
			s.logger.Warn("referencing rows probe failed", "table", probe.Table, "err", err)
			return unverified(err.Error())
		}
		total += count
		if hasMore || total >= referencingRowsLimit {
			result.Verified = true
			result.Count = referencingRowsLimit
			result.HasMore = true
			return result
		}
	}

	result.Verified = true
	result.Count = total
	return result
}

func (s *ConnectionService) AddTableColumn(profile *models.ConnectionProfile, db *sql.DB, schema, table string, col models.ColumnDef) error {
	if profile == nil || db == nil {
		return fmt.Errorf("no active connection")
	}
	d, ok := getDriver(profile.Driver)
	if !ok {
		return fmt.Errorf("driver not found")
	}

	prefs := s.getPrefs()
	ctx, cancel := context.WithTimeout(s.ctx, time.Duration(prefs.SchemaTimeout)*time.Second)
	defer cancel()

	s.logger.Info("adding column", "schema", schema, "table", table, "column", col.Name)
	return d.AddTableColumn(ctx, db, schema, table, &col)
}

func (s *ConnectionService) DropTableColumn(profile *models.ConnectionProfile, db *sql.DB, schema, table, column string) error {
	if profile == nil || db == nil {
		return fmt.Errorf("no active connection")
	}
	d, ok := getDriver(profile.Driver)
	if !ok {
		return fmt.Errorf("driver not found")
	}

	prefs := s.getPrefs()
	ctx, cancel := context.WithTimeout(s.ctx, time.Duration(prefs.SchemaTimeout)*time.Second)
	defer cancel()

	s.logger.Info("dropping column", "schema", schema, "table", table, "column", column)
	return d.DropTableColumn(ctx, db, schema, table, column)
}
