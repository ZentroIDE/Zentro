// SPDX-License-Identifier: GPL-3.0-only

package app

// aiPermissionGroup is one switch in Settings that turns a category of agent
// tools on or off. Every tool belongs to exactly one group (aiTool.group in
// ai_tools.go). A group that is off means every tool in it is refused with
// PERMISSION_DENIED at call time; tools/list still lists the tool, as the
// spec asks, so the agent learns why only when it tries.
type aiPermissionGroup string

const (
	// aiGroupMetadata is schema-only reads that never touch a row: search_schema,
	// describe_table, list_relations, classify_sql. On whenever the assistant
	// itself is on; it has no switch of its own.
	aiGroupMetadata aiPermissionGroup = "metadata"
	// aiGroupObjectText gates get_definition: the text of a view, routine, or
	// saved script. Its switch is ProjectAISettings.IncludeBodies, named
	// "include view, routine and script text" in Settings.
	aiGroupObjectText aiPermissionGroup = "object_text"
	// aiGroupConnectionDetails names the switch list_connections checks inline
	// for one part of its own result (host, port, user name). No tool's group
	// is this value; it is kept so the enum matches the spec's table.
	aiGroupConnectionDetails aiPermissionGroup = "connection_details"
	// aiGroupReadData is for a tool that runs against real data without
	// committing a write: run_readonly_query, estimate_impact,
	// preview_cascade, dry_run.
	aiGroupReadData aiPermissionGroup = "read_data"
	// aiGroupDataRows is for a tool whose result holds row values:
	// run_readonly_query. Its switch is ProjectAISettings.DataMode, free on
	// every plan (ADR 0017, ADR 0019). At most 10 rows per call, never sent to an external
	// agent, and a round that carries rows to a cloud model or out of
	// production asks the user first.
	aiGroupDataRows aiPermissionGroup = "data_rows"
	// aiGroupChanges is for a tool that proposes a write or manages restore
	// points: propose_change, get_change_status, cancel_change, list_changes,
	// and the restore-point tools.
	aiGroupChanges aiPermissionGroup = "changes"
	// aiGroupAudit is the run history behind Settings' "Run history" switch:
	// get_audit_log and list_audit (its older, narrower form: when and how long,
	// never the SQL). Both stay off until the project allows them (D3).
	aiGroupAudit aiPermissionGroup = "audit"
	// aiGroupContext describes the app, not the database: get_app_context,
	// list_projects, list_environments, list_connections, list_scripts,
	// get_git_status, get_query_stats. Always on once the
	// assistant is, and never blocked by the production rule (ADR 0015).
	aiGroupContext aiPermissionGroup = "context"
)

// groupEnabled reports whether a project's settings turn this group on.
// metadata and context follow the assistant's own Enabled switch alone;
// object_text, connection_details, read_data, changes, and audit each have
// their own switch, off by default.
func groupEnabled(group aiPermissionGroup, settings ProjectAISettings) bool {
	switch group {
	case aiGroupMetadata, aiGroupContext:
		return true
	case aiGroupObjectText:
		return settings.IncludeBodies
	case aiGroupConnectionDetails:
		return settings.IncludeConnectionDetails
	case aiGroupReadData:
		return settings.AllowReadData
	case aiGroupDataRows:
		return settings.DataMode
	case aiGroupChanges:
		return settings.AllowChanges
	case aiGroupAudit:
		return settings.AllowAudit
	default:
		return false
	}
}

// groupDisabledHint is the same for every group: where to turn it on.
const groupDisabledHint = "Turn it on in Settings > Assistant."

// groupDisabledReason names which switch is off, for the refusal message.
func groupDisabledReason(group aiPermissionGroup) string {
	switch group {
	case aiGroupObjectText:
		return "object text is off for this project"
	case aiGroupConnectionDetails:
		return "connection details are off for this project"
	case aiGroupReadData:
		return "reading data is off for this project"
	case aiGroupDataRows:
		return "Data mode is off for this project"
	case aiGroupChanges:
		return "proposing changes is off for this project"
	case aiGroupAudit:
		return "the audit log is off for this project"
	default:
		return "this is off for this project"
	}
}
