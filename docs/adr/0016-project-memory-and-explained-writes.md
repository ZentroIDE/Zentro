# ADR 0016 — Per-connection memory, and writes that explain themselves

- **Status**: accepted
- **Date**: 2026-10-13
- **Decision drivers**: every question made the model look up the same tables again, which costs tokens on each round; a write proposal showed SQL and a risk label but not what the agent expected to happen or what could go wrong
- **Extends**: ADR 0012 (the preview is the bytes sent), ADR 0014 (lookups instead of a whole-schema prompt), ADR 0015 (DTOs, and a new field is a new leak decision)

## Context

With tool lookups (ADR 0014) a request carries no schema, so a new question starts with `search_schema` and `describe_table` calls. Each call is another round that resends the whole prompt. A chat remembered only the last six turns, cut hard, and the tool results were thrown away, so the next question rediscovered the same tables.

On the write side, `propose_change` never executes SQL and a person approves it, but the reviewer saw the SQL and a verdict, not the agent's own account of the change.

## Decision

### Memory

Zentro keeps, per project and per connection, in a `memory/` folder beside the chat sessions:

- **Notes**: short facts (at most 300 characters, 40 per connection) that the agent saves with `remember` or the person types in Settings > Assistant. A note that matches a sensitive shape (`ai.ScanText`) is refused, so it holds meaning, not row values. Agent notes are marked in the list and can be deleted there.
- **Recently described tables**: only the names, up to eight, newest first. Columns are read from the live catalog each time, so a changed table is never described from an old copy.

Each question carries one **memory block**, placed after the fixed instructions and before the history: the table names, the columns of the recently described tables, and the notes. It is capped at about 6,000 characters (roughly 1,500 tokens) in three parts. Its text only changes when the schema, a described table, or a note changes, so a provider that caches the prompt prefix can reuse it.

The block is part of the request, so it is part of what the review shows and what a session grant is bound to. A new table or a new note therefore asks for review again. This is the price of sending the table list, and the right one under ADR 0012.

An approved change drops the cached catalog, so the table list is read again after a DDL.

Old turns of a chat are cut to 240 characters instead of dropped; the newest four stay whole, and twelve turns are replayed within the same character budget.

### Writes that explain themselves

`propose_change` requires an `explanation`: summary, affected objects, expected effect, risks (at least one), whether it is irreversible, and a rollback plan. Without it the proposal is not created. The explanation goes through the same sensitive-shape scan as a tool result.

Zentro also measures the change itself and stores the result beside the explanation, as `checks`: a missing WHERE, a destructive statement, the row count, foreign-key effects of a DELETE, and lock and rewrite risk of DDL. The review shows the two apart ("Written by the agent, not verified" and "Checked by Zentro"). A check that could not run is `unavailable` and is listed, never left out. Zentro's warnings are not softened by the agent's wording.

## Update 2026-10-14: what a request costs

A traced reply ("top 10 orders in France") cost 5 requests and about 53k input tokens. These changes keep the memory idea but stop it from breaking the provider's prompt cache:

- **The memory block is frozen per chat.** It is set on the first question and stored on the session (`AISession.Memory`). Tables described and notes saved later go in a short "Context added in this chat" section of the newest question only. The system message stays byte-identical for the whole chat. With a session grant, a new table no longer asks for review again: it rides on the question and shows in "Sent to".
- **History is append-only.** Every turn is replayed verbatim until about 24k characters. Then all but the last four turns fold into a summary built locally (questions, first sentence and SQL of each answer), stored as `AISession.Summary`. The summary changes only at the next fold. This replaces the sliding 12-turn window that rewrote old turns on every question.
- **Notes come from a tag, not a tool.** The chat writes `<remember>["fact"]</remember>` at the end of its answer, like `<suggestions>`, which saves a round. `remember`, `forget`, and `list_notes` stay for external agents over MCP.
- **The chat gets a small core of tools.** The core is search_schema, describe_table, list_relations, validate_sql, get_definition, estimate_impact, run_readonly_query, and propose_change, plus `more_tools` and `use_tool`, which load the rest by pack (app, performance, schema_change, proposals, audit). The default tool list dropped from about 14 KB to about 4 KB. MCP still lists every tool.
- **Smaller requests.**
  - `validate_sql` and `explain_plan` accept `:name` placeholders (`db.RewriteParams`), so the instruction to use them no longer costs a failed round.
  - Chat tool results carry a compact meta.
  - Bodies are sent as compact JSON and indented only for display.

## Consequences

- A question about a table already looked at starts with its columns and skips the lookup round.
- The send review now includes the table list and notes; a changed schema or note asks again.
- A model that skips the explanation gets an `INVALID_ARGUMENT` error and retries; an older client that never sends one cannot create proposals.
- Web search was discussed and is not part of this decision.

## Not done

- A cap on output tokens per request, and a rolling summary of old turns by the model. Both need measurement first: a cap can cut a SQL answer short.
