# `features/editor`

This folder owns the **editor domain public API and orchestration layer**.

## What belongs here

- Feature-level hooks that coordinate editor domain flows.
- Query execution and cancel flow wiring.
- Tab/group management orchestration.
- Monaco editor domain integration such as SQL autocompletion setup.
- Public facade re-exports for editor entrypoints consumed outside the domain.

## Boundary with `components/editor`

- `components/editor` is the rendering and implementation layer.
- `features/editor` is the public API facade plus domain hooks and orchestration.
- External modules should prefer imports from `features/editor`.
- Internal implementation details in `components/editor` should not be imported
  directly when a `features/editor` export already exists.

## Public facade files

- `MonacoEditor.tsx`
- `QueryGroup.tsx`
- `QueryTabs.tsx`

These files intentionally re-export implementation from `components/editor/*`.
This is a deliberate facade pattern, not duplicate code.

## Public barrel

- `features/editor/index.ts` is the preferred import entrypoint for consumers
  outside this folder.
- Add new public hooks or facade components to the barrel when they are meant
  to be reused outside the editor domain.
