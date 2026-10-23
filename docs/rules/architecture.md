---
trigger: always_on
---

# Architecture Rules

These rules define the architectural standards for the Zentro project.
All generated or modified code MUST follow these guidelines.

---

# 1. Architectural Principles

The project must follow these core principles:

- Maintain **modular architecture**
- Prefer **composition over inheritance**
- Keep components **loosely coupled**
- Ensure **high cohesion**
- Write **testable and maintainable code**

Every module must have a **clear responsibility**.

---

# 2. SOLID Principles (Mandatory)

All implementations must follow SOLID.

## Single Responsibility Principle (SRP)

Each component should have only one responsibility.

Examples:

GOOD
- QueryExecutor handles query execution
- HistoryRepository handles history persistence

BAD
- QueryManager that executes queries, saves history, and logs errors

---

## Open/Closed Principle (OCP)

Components should be open for extension but closed for modification.

Prefer:

- interfaces
- composition
- strategy pattern

Avoid modifying existing stable components when adding new behavior.

---

## Liskov Substitution Principle (LSP)

Derived types must be replaceable for their base abstractions.

Interfaces must represent **true capabilities**.

Avoid "fake interfaces" created only to satisfy architecture.

---

## Interface Segregation Principle (ISP)

Prefer **small focused interfaces** instead of large ones.

GOOD

QueryRunner
HistoryStore

BAD

DatabaseManager
(with 10+ unrelated methods)

---

## Dependency Inversion Principle (DIP)

High level modules must not depend on low level modules.

Depend on **interfaces**, not implementations.

Example:

QueryService
depends on
QueryRepository interface

---

# 3. Project Layering

The codebase should follow layered separation.

Typical structure:

internal/
    domain/
    service/
    repository/
    infrastructure/
    ui/

Layer responsibilities:

Domain
- core entities
- pure business logic

Service
- orchestration
- use cases

Repository
- data persistence abstraction

Infrastructure
- database
- filesystem
- external integrations

UI
- Fyne UI components
- user interaction logic

UI must never contain business logic.

---

# 4. Design Patterns

When appropriate, prefer established patterns.

Common patterns used in this project:

Repository
- database abstraction

Factory
- object creation logic

Strategy
- interchangeable algorithms

Adapter
- adapting external APIs

Dependency Injection
- decoupling modules

Patterns must be used **only when they improve clarity**.

Avoid unnecessary complexity.

---

# 5. Code Structure Rules

Functions should be:

- small
- focused
- readable

Recommended limits:

Function length
< 40 lines

File size
< 400 lines

Avoid:

- deep nesting
- large switch statements
- complex condition chains

---

# 6. Error Handling

Errors must be:

- explicit
- propagated upward
- meaningful

Avoid silent failures.

Use structured error messages.

---

# 7. Logging

Logging must be:

- structured
- contextual
- non-intrusive

Logging should not pollute domain logic.

Prefer centralized logging utilities.

---

# 8. Anti-Patterns (Must Avoid)

The following are prohibited:

God objects
Large utility classes
Tightly coupled modules
Business logic inside UI
Duplicated logic across modules

If duplication appears, extract reusable abstractions.

---

# 9. Refactoring Policy

When adding features:

- prefer extending existing abstractions
- avoid breaking existing APIs
- refactor when complexity grows

If code becomes difficult to understand,
refactor before adding more logic.

---

# 10. Architectural Integrity

Before finalizing any change, verify:

- SOLID principles are respected
- layering is preserved
- no tight coupling introduced
- responsibilities remain clear

Architecture quality is more important than quick implementation.

---

# 11. Build-Time Guardrails (Mandatory)

Every build MUST run both backend and frontend guardrails. Builds that
skip these checks are not acceptable, even for "quick" debug artifacts.

The current pipeline wires this in two places:

**Backend** — [build_zentro.ps1](../../build_zentro.ps1) runs
`node scripts/check-be-guardrails.mjs` after `npm run format:backend`
and **before** invoking `wails build`. A non-zero exit aborts the build
with the same exit code.

**Frontend** — [frontend/package.json](../../frontend/package.json)'s
`build` script chains:

1. `npm run format`
2. `npm run check:guardrails`           — no-dynamic-map / event-constant / fenced-runtime rules
3. `npm run check:boundaries`           — no cross-feature relative imports
4. `npm run check:design-system-contract` — design-system primitive API spec
5. `tsc`
6. `vite build`

Wails invokes the frontend `build` script as part of `wails build`, so
the full backend + frontend gate runs whenever anyone calls
`npm run build`, `npm run build:dev`, or `wails build` directly.

Rules:

- **Adding a new guardrail script** → wire it into the chain. Either
  add it to the FE `build` script or to `build_zentro.ps1` depending on
  what it checks.
- **A guardrail is failing** → fix the underlying code, do not weaken
  the rule, comment out the check, or use `--no-verify` / similar bypasses.
- **A guardrail is wrong** → discuss it on a PR / ADR and adjust the
  rule deliberately. Never silently relax.
- The same chain runs as part of `npm run verify:push` (the pre-push
  hook) — keep both in sync when you add a step.