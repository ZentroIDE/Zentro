# ADR 0014 — Schema tools for the chat and an MCP server for external agents

- **Status**: accepted
- **Date**: 2026-10-06
- **Decision drivers**: every chat request carried the whole schema block, which cost tokens and sent more structure than a question needed; users also want external agents (Claude Code, Codex CLI) to read the schema
- **Supersedes in part**: ADR 0012, where it says the external MCP server is not started

## Context

ADR 0012 sent a metadata block with every request: up to 80 tables with their columns, indexes, constraints, views, and routines. A question about one table paid for all of them, every turn. ADR 0012 also kept the external MCP server off, together with ACP, because an agent with its own shell is not confined by Zentro.

## Decision

The model gets no schema up front. It looks up what one question needs with three read-only tools:

- `search_schema(query, kind?)`: names of tables, views, routines, and columns that contain the query.
- `describe_table(table)`: one table's columns, types, primary key, indexes, and constraints.
- `get_definition(name)`: the text of a view, routine, or saved script, only when the project's include-text switch is on, through the same scrubber as before.

A table the user `@mentions` goes into the question already described, so it does not cost a round.

The tools read the catalog of the active connection and environment. A name in the arguments must exist there. No tool reads rows, runs SQL, or reaches another environment. Each result is capped and scanned for sensitive shapes; a match is withheld, not sent. A reply may take at most 8 rounds of at most 8 calls.

The chat runs the loop itself (`converse` in `ai_review.go`). Both adapters speak tools: `tools` and `tool_calls` for chat completions, `function_call` and `function_call_output` for the responses API. The chat shows each lookup while the reply is on its way and keeps the list with the saved reply.

The same tools are offered to external agents by an MCP server (Streamable HTTP, JSON replies, protocol 2025-06-18 and older):

- Off until the user starts it in Settings > Assistant.
- Listens on 127.0.0.1 only. Requests with a non-loopback Host or Origin are refused, so a web page cannot reach it.
- Needs a bearer token kept in the OS keyring.
- Every call is checked at the moment it runs against the chat's policy: assistant on for the project and the connection, no production environment, no airgap license. The agent may send what it reads to any model, so it is treated as a cloud destination.
- Calls are counted and logged by tool name, without arguments or results.
- Settings can write Zentro into an agent on request: the Claude Desktop config files it finds (the regular and the Microsoft Store builds), merged and backed up first, through the `mcp-remote` bridge because Claude Desktop only starts local servers as commands; and Claude Code through `claude mcp add --scope user`. The token can be rotated, and the server can start with Zentro so a configured agent keeps working. claude.ai custom connectors cannot be used: Anthropic's servers call them and cannot reach this computer.

The data notice now says the model can look up structure as it needs it. The per-chat approval no longer depends on a schema snapshot, since none is sent; changing the host, the model, or the include-text switch still asks again.

The whole-schema prompt (`FormatMetadata`) stays in the code behind `aiUseToolLookups`, for models that cannot call tools. It is not wired to a setting and is not being extended.

ACP stays off, for the reason in ADR 0012.

## Alternatives considered

- **Send a list of table names up front.** Cheap, but it still grows with the schema and the model can search instead.
- **One tool per table or per object kind.** More tools make the model's choice harder and the prompt longer.
- **A stdio MCP server.** An agent would have to start Zentro's binary, which cannot share the window's open connection.

## Consequences

- **Positive** — a request carries the instructions, the tool list, and only the structure the question touched.
- **Positive** — external agents get the same read-only view, under the same rules, without a second implementation.
- **Negative** — answers take extra round trips. A model that is poor at tool calls answers worse until the whole-schema path is wired to a setting.
- **Negative** — what an external agent reads leaves Zentro's view: Zentro cannot see which model it goes to. The server is off by default and says so.
- **Neutral** — the local catalog now reads up to 500 tables, since it is searched on this computer and not sent whole.

## How to revisit

Wire `aiUseToolLookups` to a per-provider setting when a model that cannot call tools is needed. Add a tool only when a question cannot be answered with the three above; ADR 0015 added the app context tools and the plan rules. Revisit the production rule if teams need agents on production under an admin policy (issue #103).
