# ADR 0017 — The AI sees the schema, not the data

- **Status**: accepted
- **Date**: 2026-10-14
- **Decision drivers**: Zentro will grow beyond developers and DBAs into analysts and BI dashboards, so the rule for what leaves the machine has to hold from the first day; the `read_data` tools were added after ADR 0014 without a decision record, and their column masking could be bypassed
- **Supersedes**: the row-reading parts of `docs/specs/mcp-tools-spec.md` (the `read_data` group and `get_data_classification` as a masking source); the production rule of ADR 0012 (no cloud host in production)
- **Keeps**: ADR 0012's promise that the bytes that leave the machine are the bytes in the preview, now applied to every request

## Context

ADR 0012 promised that customer rows never leave the machine through a path Zentro opens. ADR 0014 said: "No tool reads rows, runs SQL, or reaches another environment." The MCP tools spec then added a `read_data` group (`run_readonly_query`, `estimate_impact`, `preview_cascade`, `dry_run`). It masked sensitive columns by guessing from column names, and let the user correct the guesses in Settings > Assistant > Sensitive columns. No ADR recorded that change.

Review found three problems:

- **Masking matched the column name of the result, not its source.** `SELECT email AS contact`, `lower(email)`, or `row_to_json(users)` returned real values.
- **Only the first request of a reply was previewed.** Each tool round, including one carrying rows, was posted without review. That broke ADR 0012.
- **The design asked users to configure a guess.** A column the guess missed could not be marked, and "not sensitive" quietly sent real values.

Competitors split three ways. TablePlus sends structure only. DBeaver, DataGrip, and Beekeeper send rows when a user opts in. SSMS Copilot reads whatever the login can. None of them hides data by classifying columns.

## Principles

These hold for every plan and every later feature, including dashboards and analyst tools.

1. **The data-protection floor is the same on every plan, and it is free.** Privacy is never an upsell. A paid plan may add protection of users from their own mistakes (type-to-confirm, cooldown, restore points). It may also add new, controlled capabilities. It never sells the protection of the people whose data is in the database.
2. **Higher plans want fewer capabilities, not more.** Team and Enterprise sell the ability to lock things down and prove it: policy lock, audit, endpoint allowlists, residency, airgap. They do not sell "the AI can read more data".
3. **Zentro blocks accidental leaks, not deliberate ones.** A user who copies a result grid into a chat, or writes SQL meant to probe values, can always get data out. Zentro does not pretend otherwise. It makes sure nothing leaves by accident and that every byte that leaves was shown first.
4. **Guarantees come from design, not from configuration.** A rule the user must maintain for it to be safe is not a guarantee.

## Decision

### What leaves the machine

| | Data mode off | Data mode on |
| --- | --- | --- |
| Schema: names, types, keys, comments | yes | yes |
| View, routine, and script text | when "include object text" is on | same |
| Memory block: table list, recently described tables, notes (ADR 0016) | yes | yes |
| Row values | **never** | at most **10 rows** per tool call, see below |
| Counts: affected rows, table stats | yes | yes |

Counts stay. A count from an arbitrary WHERE can be used to probe a value, but only on purpose. That falls under principle 3.

### Data mode (opt-in)

**Update 2026-10-18.** Data mode is free on every plan (ADR 0019 makes the whole assistant free). It was a Pro feature, `ai.data-mode`; that feature is gone. The switch, the 10-row cap and the approval rules below are unchanged, so a paid plan neither adds nor removes any data protection. Team and Enterprise still sell locking it down.

- Off by default. It is turned on per project in Settings > Assistant.
- A tool returns at most 10 rows. `run_readonly_query`, `estimate_impact` key samples, and any later sampling tool share this cap.
- **Local model** (loopback host): rows go to the model without a prompt each time, because they do not leave the machine.
- **Cloud model**: each tool round that carries rows stops and shows the exact rows and the provider host. It is sent only when the user approves that round. The approval covers that round only.
- **Production**: allowed. A round that carries production rows always asks, on a local model too, and the dialog names the environment.
- External MCP clients (Cursor, Claude Code) get no row-returning tool. Zentro cannot see where such an agent sends what it reads.

### No more per-column configuration

- The Sensitive columns list, user classification rules, and `get_data_classification` as a masking source are removed.
- Columns whose name reads as a credential (password, secret, token, API key, hash) are always returned as `***`. This has no switch and no UI. It is defense in depth against an accident, not a privacy promise.
- The sensitive-shape scan stays on every tool result and every request: email, phone, card, JWT, credential, connection string.

### Every byte is previewed

- The first request of a reply is reviewed as today.
- Later tool rounds that carry only metadata are sent under the session grant. Each body is kept byte for byte, and the user can open it from the reply ("Sent to <host>").
- A round that carries rows is never sent under a grant. It waits for the approval described in Data mode.

### Production and cloud models

ADR 0012 refused every non-loopback host while the open environment was production. This decision lifts that rule. Blocking production only moves the user to staging, where the same schema lives. Schema and counts follow the same rules in every environment. Production rows always ask.

The airgap license tier still forces a loopback host everywhere.

## Consequences

- **Positive**
  - One sentence a user can trust: "the AI sees your schema, never your data, unless you turn on Data mode and approve each sample". It holds without configuration.
  - The alias bypass disappears, because rows reach the model only through a review that shows exactly what is sent.
  - The rules extend to future dashboard and analyst features without a new privacy model.
- **Negative**
  - The free assistant cannot check a hypothesis against real data.
  - Users on a cloud model approve each data round.
  - Existing projects lose their classification rules.
- **Migration**
  - On upgrade, `AllowReadData` turns off and the stored classification rules are dropped. A one-time notice in the assistant says what changed and where Data mode is.

## What the user accepts

Write this on the security page, plainly:

- Schema leaves the machine: table, column, and comment names, which can themselves be sensitive. Use a local model or keep the assistant off for that project.
- Anything typed into the chat is sent. The shape scan holds obvious secrets but cannot catch everything.
- The chosen provider's terms apply: retention, training, region. Zentro shows the host and sits nowhere in the path.
- An external agent connected over MCP sends what it reads to its own provider.
- Counts and statistics can reveal facts about the data to someone probing on purpose.

## Implementation notes

Added while implementing this record, 2026-10-14:

- **The chat enforced no permission switch.** It ran any tool in the plan, so a model could read rows with the read-data switch off. The chat now goes through the same gate as an external agent (`toolBlocked`). A tool whose group is off is no longer offered to the model at all.
- **`dry_run` returned the database's own error text,** which can quote a row (a duplicate key names its value). It now returns only the SQLSTATE and the constraint name.
- **Data mode is its own group and switch** (`data_rows`, `dataMode`). It is separate from `read_data`, which now only counts. Counts stay available on every plan; row values need the project to turn Data mode on, on any plan.
- **Each round of a reply has its own time limit,** instead of the reply as a whole. This means waiting for the user to share rows does not use up the model's time.
- **A cell is hidden when its text looks sensitive,** whatever its column is called. Only that cell becomes `***`; the rest of the result still goes, so a table with emails can still be sampled.

## How to revisit

- Raise the 10-row cap only with a measured need, and keep it per tool call.
- Team and Enterprise policy lock and audit build on this record. They narrow it and never widen it.
