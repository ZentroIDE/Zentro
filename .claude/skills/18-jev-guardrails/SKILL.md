---
name: zentro-jev-guardrails
description: >
  Rules for using TypeSafe's Jev (System One model) in the Zentro ecosystem: where a
  typed judgment fits, what data must never be sent, and how the API key is handled.
---

# Skill 18: Jev Guardrails

## Purpose

Jev returns typed answers and probabilities, never text. It supplies "programmable
common sense" where code needs semantic understanding. It is not a coding model and
does not replace Claude Code or Codex. This is the policy; the `typesafe-ai` skill is
the how-to and the live docs at https://docs.typesafe.ai/llms.txt are the source of
truth for API and SDK details.

## When to use it

- Use the `typesafe-ai` skill for any task that adds or reviews a fuzzy decision:
  routing, classification, scoring, verification, or replacing a fragile regex/parser.
- Keep exact logic, lookups, control flow, and side effects in code.
- Ask one narrow question per judgment and batch independent questions in one call.
- Route low-confidence answers to a person or a reasoning model. Never let a
  probability alone authorize a destructive or irreversible action.
- Prefer dev/CI tooling first (commit or PR triage, release-note checks, issue
  triage). Product features that send user data need an explicit decision first.

## Data that must never be sent

Zentro is a SQL client, so state can easily contain secrets or customer data. Never
put any of these in `state`:

- connection strings, host credentials, passwords, SSH keys, license keys, API keys
- query text or result rows from a user's databases
- deploy keys, `.env` contents, or anything from the `scripts-*.sh` server scripts

Send the smallest redacted excerpt that answers the question.

## API key

- Env var: `TYPESAFE_API_KEY`. Never commit it, log it, or write it into a file.
- Web apps (`zentro-landing`, `zentro-docs`, `zentro-admin`): call Jev only from
  server code. Never expose the key to the browser bundle.
- The desktop app (`zentro`) must not embed a key. A feature that needs Jev goes
  through `zentro-api`, never straight from the client.
- Pin `model` explicitly in production code. `jev-latest` is fine for experiments.

## Validate before trusting

Typed output guarantees the schema, not truth. Measure accuracy on real examples
from this repo before wiring a decision into a workflow, and keep the threshold and
fallback path in code.
