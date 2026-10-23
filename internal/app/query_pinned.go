// SPDX-License-Identifier: GPL-3.0-only

package app

// Pinned query execution — the read/write path for Table and Catalog tabs,
// which target a fixed Pinned Environment (ADR-0001,
// docs/adr/0001-pinned-environment-context-for-data-tabs.md) instead of the
// ambient Active Environment that drives Query tabs (query_batch.go,
// query_execution.go). Deliberately NOT routed through the ambient
// closures (getDB/getExecutor/getDriver/getCurrentEnvironmentKey) or the
// multi-statement batch pipeline — Table/Catalog tab queries are always a
// single, fully schema-qualified statement (see BuildQualifiedTableSelect),
// so they need neither prepareExecutor's session-schema wrapping nor batch
// progress throttling.
//
// These methods intentionally mirror rather than share implementation with
// their ambient counterparts (FetchMoreRows, FetchRowRange): the two pull
// driver/executor from different sources, and any accidental cross-wire
// here would silently route a Table tab's data at the wrong environment —
// exactly the bug this file exists to prevent.

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"zentro/internal/constant"
	dbpkg "zentro/internal/db"
)

// pinnedExecutor resolves the *sql.DB pooled for a Table/Catalog tab's
// Pinned Environment, plus its driver name, or an error when the tab hasn't
// pinned a connection (e.g. Pin failed, or the pool evicted it and the tab
// hasn't re-pinned).
func (s *QueryService) pinnedExecutor(profileName, dbName string) (*sql.DB, string, error) {
	if s.pool == nil {
		return nil, "", fmt.Errorf("connection pool not available")
	}
	db, ok := s.pool.Lookup(profileName, dbName)
	if !ok {
		return nil, "", fmt.Errorf("no pinned connection for %q — reopen the tab to reconnect", profileName)
	}
	driver, _ := s.pool.Driver(profileName, dbName)
	return db, driver, nil
}

// ExecutePinnedQuery runs a single SELECT statement against a Table/Catalog
// tab's own Pinned Environment. Never used for multi-statement scripts —
// those stay on the ambient ExecuteQuery path.
func (s *QueryService) ExecutePinnedQuery(tabID, query, profileName, dbName string) {
	s.clearCancelled(tabID)

	db, driver, err := s.pinnedExecutor(profileName, dbName)
	if err != nil {
		s.emitDoneWithMore(queryStatement{SourceTabID: tabID, TabID: tabID, Text: query, Index: 0, Count: 1}, 0, 0, true, false, err)
		return
	}

	s.activeQueriesMu.Lock()
	s.activeQueries[tabID] = query
	s.activeQueriesMu.Unlock()

	ctx, session, cancel, jobHandle := s.beginQuerySession(tabID, queryJobTitle(query), profileName, dbName)
	go func() {
		var resultErr error
		defer func() { s.endQuerySession(tabID, session, cancel, jobHandle, resultErr) }()

		statement := queryStatement{SourceTabID: tabID, TabID: tabID, Text: query, Index: 0, Count: 1}
		EmitVersionedEvent(s.emitter, s.ctx, constant.EventQueryStarted, constant.EventQueryStartedV2, QueryStartedEvent{
			TabID:          tabID,
			SourceTabID:    tabID,
			Query:          query,
			StatementText:  query,
			StatementIndex: 0,
			StatementCount: 1,
		})
		resultErr = s.streamSelect(ctx, driver, db, db, statement, 0, time.Now())
		if resultErr == nil {
			// The statement completed successfully right as cancellation
			// landed — same race streamSelect's own callers guard against
			// in runBatchStatement (query_batch.go).
			resultErr = ctx.Err()
		}
	}()
}

// FetchPinnedMoreRows continues a paginated SELECT previously started by
// ExecutePinnedQuery, against the same Pinned Environment. Mirrors
// FetchMoreRows (query_execution.go).
func (s *QueryService) FetchPinnedMoreRows(tabID string, offset int, profileName, dbName string) {
	s.activeQueriesMu.Lock()
	query, ok := s.activeQueries[tabID]
	s.activeQueriesMu.Unlock()

	if !ok || query == "" {
		s.emitDone(queryStatement{SourceTabID: sourceTabID(tabID), TabID: tabID, Text: query, Index: 0, Count: 1}, 0, 0, true, fmt.Errorf("no active query found for pagination"))
		return
	}
	if dbpkg.HasPaginationClause(query) {
		s.emitDoneWithMore(queryStatement{SourceTabID: sourceTabID(tabID), TabID: tabID, Text: query, Index: 0, Count: 1}, 0, 0, true, false, nil)
		return
	}

	db, driver, err := s.pinnedExecutor(profileName, dbName)
	if err != nil {
		s.emitDoneWithMore(queryStatement{SourceTabID: sourceTabID(tabID), TabID: tabID, Text: query, Index: 0, Count: 1}, 0, 0, true, false, err)
		return
	}

	prefs := s.getPrefs()
	limit := preferredResultFetchBatchSize
	checkLimit := limit + 1
	paginatedQuery := dbpkg.InjectPageClause(driver, query, checkLimit, offset)

	if paginatedQuery == query && offset > 0 {
		s.emitDoneWithMore(queryStatement{SourceTabID: sourceTabID(tabID), TabID: tabID, Text: query, Index: 0, Count: 1}, 0, 0, true, false, nil)
		return
	}
	sourceID := sourceTabID(tabID)

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Duration(prefs.QueryTimeout)*time.Second)
		defer cancel()

		start := time.Now()
		rows, err := db.QueryContext(ctx, paginatedQuery)
		if err != nil {
			s.emitDoneWithMore(queryStatement{SourceTabID: sourceID, TabID: tabID, Text: query, Index: 0, Count: 1}, 0, time.Since(start), true, false, fmt.Errorf("fetch more: query failed: %w", err))
			return
		}
		defer rows.Close()

		cols, err := rows.Columns()
		if err != nil {
			s.emitDoneWithMore(queryStatement{SourceTabID: sourceID, TabID: tabID, Text: query, Index: 0, Count: 1}, 0, time.Since(start), true, false, fmt.Errorf("fetch more: columns error: %w", err))
			return
		}
		dbTypes := databaseTypeNames(rows)

		var chunk [][]string
		seq := 0
		rowCount := 0
		hasMore := false

		for rows.Next() {
			if ctx.Err() != nil || s.isCancelled(sourceID) {
				break
			}
			row := scanRowAsStrings(rows, len(cols), dbTypes)
			rowCount++
			if rowCount > limit {
				hasMore = true
				break
			}
			chunk = append(chunk, row)

			if len(chunk) >= 500 {
				EmitVersionedEvent(s.emitter, s.ctx, constant.EventQueryChunk, constant.EventQueryChunkV2, buildChunk(queryStatement{SourceTabID: sourceID, TabID: tabID, Text: query, Index: 0, Count: 1}, cols, chunk, seq, "", nil))
				chunk = nil
				seq++
			}
		}

		if len(chunk) > 0 {
			EmitVersionedEvent(s.emitter, s.ctx, constant.EventQueryChunk, constant.EventQueryChunkV2, buildChunk(queryStatement{SourceTabID: sourceID, TabID: tabID, Text: query, Index: 0, Count: 1}, cols, chunk, seq, "", nil))
		}

		duration := time.Since(start)
		if hasMore {
			rowCount = limit
		}

		if s.isCancelled(sourceID) || ctx.Err() == context.Canceled {
			s.emitDoneWithMore(queryStatement{SourceTabID: sourceID, TabID: tabID, Text: query, Index: 0, Count: 1}, int64(rowCount), duration, true, hasMore, fmt.Errorf("query cancelled"))
			return
		}
		s.emitDoneWithMore(queryStatement{SourceTabID: sourceID, TabID: tabID, Text: query, Index: 0, Count: 1}, int64(rowCount), duration, true, hasMore, nil)
	}()
}

// FetchPinnedRowRange mirrors FetchRowRange but against a Pinned
// Environment connection.
func (s *QueryService) FetchPinnedRowRange(tabID string, offset int, count int, profileName, dbName string) {
	s.activeQueriesMu.Lock()
	query, ok := s.activeQueries[tabID]
	s.activeQueriesMu.Unlock()

	emitEmpty := func(errMsg string) {
		s.emitter.Emit(s.ctx, constant.EventQueryRange, QueryRangeEvent{
			TabID:  tabID,
			Offset: offset,
			Rows:   [][]string{},
			Error:  errMsg,
		})
	}

	if !ok || query == "" || dbpkg.HasPaginationClause(query) {
		emitEmpty("")
		return
	}

	db, driver, err := s.pinnedExecutor(profileName, dbName)
	if err != nil {
		emitEmpty(err.Error())
		return
	}

	prefs := s.getPrefs()
	paginatedQuery := dbpkg.InjectPageClause(driver, query, count, offset)

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Duration(prefs.QueryTimeout)*time.Second)
		defer cancel()

		rows, err := db.QueryContext(ctx, paginatedQuery)
		if err != nil {
			emitEmpty(err.Error())
			return
		}
		defer rows.Close()

		cols, err := rows.Columns()
		if err != nil {
			emitEmpty(err.Error())
			return
		}
		dbTypes := databaseTypeNames(rows)

		var rowData [][]string
		for rows.Next() {
			rowData = append(rowData, scanRowAsStrings(rows, len(cols), dbTypes))
		}
		if rowData == nil {
			rowData = [][]string{}
		}

		s.emitter.Emit(s.ctx, constant.EventQueryRange, QueryRangeEvent{
			TabID:  tabID,
			Offset: offset,
			Rows:   rowData,
		})
	}()
}

// ExecutePinnedUpdateSync runs a single write statement against a
// Table/Catalog tab's Pinned Environment — used by cell-edit saves.
// environmentKey gates write-safety against the tab's own Pinned
// Environment, never the ambient Active Environment, so a tab pinned to
// Production is always evaluated as Production regardless of what the
// Toolbar's environment switcher currently shows for Query tabs.
func (s *QueryService) ExecutePinnedUpdateSync(sourceTabID, query, profileName, dbName, environmentKey string) (int64, error) {
	if s.getPrefs().ViewMode {
		return 0, fmt.Errorf("view mode is enabled: write statements are blocked")
	}
	if err := s.validateStrictWriteSafety(sourceTabID, []string{query}, environmentKey); err != nil {
		return 0, err
	}
	if strings.TrimSpace(sourceTabID) != "" {
		defer s.ClearPendingAuditMeta(sourceTabID)
	}

	db, _, err := s.pinnedExecutor(profileName, dbName)
	if err != nil {
		return 0, err
	}

	start := time.Now()
	res, execErr := db.ExecContext(s.ctx, query)
	duration := time.Since(start)

	var rowsAffected int64
	if execErr == nil {
		rowsAffected, _ = res.RowsAffected()
	}
	s.trackQueryExecution(
		queryStatement{SourceTabID: sourceTabID, TabID: sourceTabID, Text: query, Index: 0, Count: 1},
		rowsAffected, duration, false, execErr,
	)

	if execErr != nil {
		return 0, execErr
	}
	return rowsAffected, nil
}
