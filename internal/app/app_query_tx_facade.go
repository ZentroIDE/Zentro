// SPDX-License-Identifier: GPL-3.0-only

package app

func (a *App) ExecuteQuery(tabID, query string) { a.svc.Query.ExecuteQuery(tabID, query) }

func (a *App) ExplainQuery(tabID, query string, analyze bool) error {
	return a.svc.Query.ExplainQuery(tabID, query, analyze)
}

func (a *App) FetchMoreRows(tabID string, offset int) { a.svc.Query.FetchMoreRows(tabID, offset) }
func (a *App) FetchRowRange(tabID string, offset int, count int) {
	a.svc.Query.FetchRowRange(tabID, offset, count)
}

func (a *App) CancelQuery(tabID string) { a.svc.Query.CancelQuery(tabID) }

// CopyActiveQuery makes a result kept under a new tab id keep paging/exporting.
func (a *App) CopyActiveQuery(fromTabID, toTabID string) bool {
	return a.svc.Query.CopyActiveQuery(fromTabID, toTabID)
}

func (a *App) ExecuteUpdateSync(tabID string, query string) (int64, error) {
	if err := a.ensureWritable("execute update"); err != nil {
		return 0, err
	}
	return a.svc.Query.ExecuteUpdateSync(tabID, query)
}

// ExecutePinnedQuery, FetchPinnedMoreRows, FetchPinnedRowRange, and
// ExecutePinnedUpdateSync target a Table/Catalog tab's own Pinned
// Environment (ADR-0001) via profileName/dbName instead of the ambient
// Active Environment — see query_pinned.go.
func (a *App) ExecutePinnedQuery(tabID, query, profileName, dbName string) {
	a.svc.Query.ExecutePinnedQuery(tabID, query, profileName, dbName)
}

func (a *App) FetchPinnedMoreRows(tabID string, offset int, profileName, dbName string) {
	a.svc.Query.FetchPinnedMoreRows(tabID, offset, profileName, dbName)
}

func (a *App) FetchPinnedRowRange(tabID string, offset int, count int, profileName, dbName string) {
	a.svc.Query.FetchPinnedRowRange(tabID, offset, count, profileName, dbName)
}

func (a *App) ExecutePinnedUpdateSync(tabID, query, profileName, dbName, environmentKey string) (int64, error) {
	if err := a.ensureWritable("execute pinned update"); err != nil {
		return 0, err
	}
	return a.svc.Query.ExecutePinnedUpdateSync(tabID, query, profileName, dbName, environmentKey)
}

func (a *App) BeginTransaction() error {
	if err := a.ensureWritable("begin transaction"); err != nil {
		return err
	}
	return a.svc.Tx.BeginTransaction()
}

func (a *App) CommitTransaction() error {
	if err := a.ensureWritable("commit transaction"); err != nil {
		return err
	}
	return a.svc.Tx.CommitTransaction()
}

func (a *App) RollbackTransaction() error            { return a.svc.Tx.RollbackTransaction() }
func (a *App) GetTransactionStatus() (string, error) { return a.svc.Tx.GetTransactionStatus() }
