# Plugin Runtime Seams

Zentro keeps plugin support intentionally small and explicit. The core app stays fully functional without plugins, while selected UI/runtime seams can be replaced or extended through `pluginRegistry`.

## Runtime seams

- Toolbar slots: `toolbar-left`, `toolbar-center`, `toolbar-right`
- Sidebar panels: registered through `pluginRegistry.registerSidebarPanel`
- Bottom panels (bottom tab strip below the query editor): registered through `pluginRegistry.registerBottomPanel`
- Result panel views:
  - `empty`
  - `error`
  - `dml`
  - `transaction-summary`
  - `table`
  - `explain`
- Data table cell renderers:
  - matched by normalized data type, for example `jsonb`, `varchar`, `timestamptz`
- Connection tree nodes:
  - `schema`
  - `category:<categoryKey>`
  - `object:<categoryKey>`

## Contract rules

- Every runtime render extension must declare `pluginId`
- Use stable, explicit keys. Do not depend on translated labels or visual text.
- Prefer replacing one seam at a time. Avoid plugins that coordinate multiple unrelated surfaces unless there is a real product workflow behind it.
- Keep plugin renderers defensive. Core components wrap them in `PluginErrorBoundary`, but plugin code should still avoid throwing during normal empty/loading states.

## Design intent

- Reliability first: plugin failures must not break the host surface.
- Maintainability second: extension keys are consumer-facing contracts, so changes should be additive when possible.
- No speculative plugin engine: registry-based seams are enough for current product needs.
