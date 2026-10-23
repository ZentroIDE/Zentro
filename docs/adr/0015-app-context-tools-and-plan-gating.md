# ADR 0015 — App context tools, and which plan gets which tool

- **Status**: accepted
- **Date**: 2026-10-07
- **Decision drivers**: an agent that can read the schema still knows nothing about where the user is working (project, environment, safety rules); some of what it could learn is the user's own history, which a tool may only describe, never expose in full
- **Extends**: ADR 0014, which named three schema tools and said to add a tool only when a question cannot be answered with them

## Context

After ADR 0014 an agent can ask what a table looks like but not which environment is open, what that environment allows, which connections exist, or what the user ran an hour ago. It guessed, or the user pasted it in.

The app holds that information, mixed with things that must never leave it: connection passwords, the host and user of a server, local folder paths, the text of open editor tabs, the SQL of past runs. `SanitizeProfile` and `SanitizeProject` copy their input unchanged, `LoadConnections` returns passwords, and `Project.LayoutState` is editor content. Serializing a model type would leak.

Only two plans work end to end today, Free and Pro. The license client drops `team` and `enterprise` from a server reply.

## Decision

A second group of tools describes the app. Each answers from a typed DTO written for it (`ai_context.go`), never from a `models` value as it is. A field is copied on purpose, and `ai_tools_context_test.go` checks that fixture secrets never appear in any result.

| Tool | Plan | Returns |
| --- | --- | --- |
| `get_app_context` | all | version, plan, open project, environment, connection name and driver, database, schema, safety rules |
| `list_projects` | all | id, name, tags, last opened, environment count |
| `list_environments` | all | per environment: bound connection name, database, schema, safety rules |
| `list_connections` | all | id, name, driver, SSL mode, bound environments |
| `list_scripts` | all | script names and times, no text |
| `classify_sql` | all | write-safety verdict on SQL the model wrote; does not run it |
| `list_relations` | all | foreign keys into and out of a table (a schema tool) |
| `list_audit` | all | recent runs: time, environment, duration, rows, risk, failed; no SQL, no error text, no reason |
| `get_git_status` | all | tracking on, pending changes, recent commit messages and kinds; no hash, path, author, or diff |
| `get_query_stats` | all | query shapes with values already replaced, counts and times |

**Never returned by any tool**: a password, token, API key, or license key; a local path; editor text; statement text, error text, or the reason a user typed; a commit hash or author. Host, port, and user name of a connection are returned only when the project's *include connection details* switch is on. It is off by default.

**Plans.** A tool carries an optional license feature. `toolsFor` keeps only the tools the plan includes, and the chat, `tools/list`, `tools/call`, and `runTool` all go through it, so a tool outside the plan is neither shown nor runnable. Without a license check a gated tool is not offered.

**Update 2026-10-18.** Every tool is free on every plan, the activity tools and `get_query_stats` included (ADR 0019: the assistant and the MCP server are free). The three used to need `ai.tools.activity` and `query.stats`. No shipped tool carries a feature now; the mechanism stays for a future Team or Enterprise tool. The statistics *panel* is still the Pro feature `query.stats`; the tool reads the same collected data without that check.

**Production.** A tool has a scope. A *schema* tool reads the open connection and stops when the connection is switched off or the environment is production, as before. A *context* tool holds no schema, so it only needs the assistant on for the project and no airgap license. It keeps working in production, which lets an agent explain why a statement is held.

A tool result is still capped at 8000 characters and scanned for sensitive shapes. The scan caught two things during this work, and both are now handled by what a tool returns, not by loosening the scan: a date without a time reads as a phone number, so times are passed on only in RFC 3339 form; a commit hash made only of digits does too, so hashes are left out.

## Consequences

- **Positive**: an agent can answer "what am I connected to and what may I do here" without guessing.
- **Positive**: one place (`toolsFor`) decides what a plan gets. A new tool that needs a plan is one entry with a feature.
- **Negative**: every new field is a new decision about what may leave the app. The DTO tests are the guard; a field added without a test is the likely way this regresses.
- **Negative**: `get_query_stats` returns query shapes. Values are replaced, but table and column names remain. It is off for a project where the assistant is off.
- **Neutral**: `ProjectEnvironment.IsProtected` and `IsReadOnly` are labels the app does not enforce. The tools name them as labels and put the enforced rules in `policy`.

## How to revisit

Team and Enterprise tools (`team.shared_connections`, `team.rbac`, compliance audit) wait until the server returns those tiers; the license client drops them today. Schema snapshots have no listing API, so they appear only through `get_git_status`. Editor state (open tabs) lives in the frontend only and is out of scope until the frontend pushes it. Revisit the production rule for teams under an admin policy (issue #103).
