// SPDX-License-Identifier: GPL-3.0-only

package constant

const (
	EventConnectionChanged   = "connection:changed"
	EventConnectionUpdated   = "connection:updated"
	EventQueryStarted        = "query:started"
	EventQueryChunk          = "query:chunk"
	EventQueryDone           = "query:done"
	EventTransactionStatus   = "transaction:status"
	EventSchemaDatabases     = "schema:databases"
	EventSchemaError         = "schema:error"
	EventSchemaLoaded        = "schema:loaded"
	EventAppBeforeClose      = "app:before-close"
	EventLicenseStateChanged = "license:state-changed"
	// EventQueryTransactionSummary carries aggregate row counts for a
	// multi-statement run, computed on the backend so the frontend doesn't
	// need a per-statement event for every statement to total them (which
	// would defeat the progress-emit throttle in query_service.go).
	EventQueryTransactionSummary = "query:transaction-summary"
)

const (
	// EventStatsSample carries one live status-bar reading (database latency,
	// database traffic, CPU/memory) — see stats_service.go. Only emitted while
	// the frontend has asked for sampling via StartStatsSampler.
	EventStatsSample = "stats:sample"
)

const (
	// EventTerminalData carries a chunk of output (base64) from one terminal
	// session — see terminal_service.go.
	EventTerminalData = "terminal:data"
	// EventTerminalExit reports that a terminal session's shell ended.
	EventTerminalExit = "terminal:exit"
)

const (
	// EventJobUpdated carries a full snapshot of one tracked long-running
	// operation (query, export, import, ...) — see job_service.go. Emitted
	// on creation, on throttled progress updates, and once more (never
	// throttled) when the job reaches a terminal status.
	EventJobUpdated = "job:updated"
	// EventJobRemoved tells the frontend to drop a job it previously saw via
	// EventJobUpdated, e.g. after ClearFinishedJobs or once the in-memory
	// job history ring buffer evicts it.
	EventJobRemoved = "job:removed"
)

const (
	EventConnectionChangedV2 = "connection:changed.v2"
	EventQueryStartedV2      = "query:started.v2"
	EventQueryChunkV2        = "query:chunk.v2"
	EventQueryDoneV2         = "query:done.v2"
	EventQueryCount          = "query:count"
	EventQueryRange          = "query:range"
	// EventQueryMessage carries a server-side informational message (T-SQL
	// PRINT / low-severity RAISERROR) captured while a statement executed.
	// MSSQL-only for now — see driver.MessageCapturer.
	EventQueryMessage        = "query:message"
	EventTransactionStatusV2 = "transaction:status.v2"
	EventSchemaDatabasesV2   = "schema:databases.v2"
	EventSchemaErrorV2       = "schema:error.v2"
	EventSchemaLoadedV2      = "schema:loaded.v2"
	EventAuditUpdated        = "audit:updated"
)

const (
	// EventAIChatDelta carries one streamed fragment of an assistant reply.
	// The payload names the request so the frontend can route it.
	EventAIChatDelta = "ai:chat-delta"
	// EventAIChatTool says the model looked something up while a reply is on
	// its way, so the chat can show it.
	EventAIChatTool = "ai:chat-tool"
	// EventAIProposalChanged says a write proposal was created, cancelled,
	// approved, rejected, or finished executing.
	EventAIProposalChanged = "ai:proposal-changed"
	// EventAIChatRound carries one request a reply sent to the model, byte for
	// byte, so the user can see every round and not only the first (ADR 0017).
	EventAIChatRound = "ai:chat-round"
	// EventAIChatApproval asks the user whether rows may go to the model. The
	// reply waits until ResolveAIChatApproval answers or the wait times out.
	EventAIChatApproval = "ai:chat-approval"
)
