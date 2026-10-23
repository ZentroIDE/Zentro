# ADR 0013 — Model provider adapters

- **Status**: accepted
- **Date**: 2026-10-06
- **Decision drivers**: each new provider quirk (DeepSeek reasoning text, a host that answers with JSON instead of a stream, tool-call markup in a reply) was patched into shared code, so adding a third provider meant editing five places

## Context

The assistant talks to Codex (OpenAI responses API) and DeepSeek (chat completions). A provider was only data: a base URL and a default model. What differed between APIs was a string, `wire`, read from the end of the URL and tested with `if wire == "responses"` in the body builder and the stream parser. The reply and usage parsers guessed the JSON shape. There were three separate functions that posted a request. The provider list was also copied into the frontend.

While reading this we found that the body was built without `stream: true`, so no host was ever asked to stream.

## Decision

`ai.Adapter` holds everything that differs between APIs: the request path, the body, how one JSON reply is read, and how one stream event is read. There are two adapters, `openai-chat` and `openai-responses`.

- A preset names its adapter. An address the user typed picks one from its path: `/responses` is the responses API, anything else is chat completions.
- `ai.Send` is the only transport. It owns HTTP, redirects, size limits, the empty-reply diagnosis, and reading a whole JSON reply from a host that does not stream. It never looks at a provider name.
- A quirk of one provider's API goes inside the adapter that provider uses, with a comment saying whose it is. It does not go in `Send`, in `AIService`, or in the frontend.
- The body always carries `stream: true`. The preview and the send build the same body, so the SendToken still matches the bytes that leave the machine.
- The backend owns the provider list. The frontend reads it from `AISettingsView.Providers`.
- No preset carries a model name. Names are renamed and retired, so only the list a host returns says what exists. A preset has a `ModelHint`, the start of a name to prefer. After a key test the backend filters the list through the adapter (`UsableModels` drops embedding, speech and image models) and picks: the model in use if it is still listed, else the first that starts with the hint, else the first. An empty list gives no model, and a send with no model says to open chat setup and press Test.

`AIService` keeps the policy: host allowlist, production and airgap rules, sensitive-text hold, session grants. It does not depend on which adapter runs.

## Alternatives considered

- **A flag per quirk on one body builder and one parser.** This is what we had. Each flag is another branch every new provider has to read.
- **One adapter per provider.** DeepSeek, Ollama and vLLM share the chat-completions shape. A copy per provider would drift.

## Consequences

- **Positive** — a provider that speaks an existing API is one preset line. A new API is one adapter file and its tests.
- **Positive** — adapter tests use a sample reply from each provider, so a change to a body or a parser is checked against all of them.
- **Negative** — a host that rejects `stream: true` fails instead of falling back. None of the hosts we name do.
- **Neutral** — follow-up question markup from a model (`SplitSuggestions`) is still one shared step on the reply text, because it depends on the model's habits and not on the API.

## How to revisit

Add an adapter when a provider's API is not chat completions or responses. If hosts that reject `stream: true` appear, add a capability flag to the adapter and send a non-streamed body for them.
