# Keyboard-Only Navigation Checklist

Manual regression checklist for keyboard-only operability. Not wired into CI — a
living doc for ad hoc passes after touching shortcuts, focus zones, tabs, the
data grid, or the ERD. See [ARCHITECTURE.md](../ARCHITECTURE.md) and
[docs/EXTENDING.md § 3](EXTENDING.md) for the `when`-expression engine and
event-constant conventions this depends on.

Run each section with the mouse disconnected (or just don't touch it). Default
bindings are listed; if the user has remapped a command in **Keyboard
Shortcuts** (`Ctrl+K Ctrl+B`), use their binding instead.

## Focus zones

1. `Ctrl+Shift+E` from outside the SQL editor → the left sidebar opens on the
   Explorer panel and focus lands in the filter input.
2. `Ctrl+K Ctrl+T` → focus lands on the editor toolbar's Run button. If the
   active tab is not a query tab, a query tab in that group is activated first.
3. `Ctrl+Shift+G` → the result panel opens on the result view and focus lands
   in the grid.
4. `Alt+Shift+T` → focus lands on the active tab in the tab strip.
5. `Ctrl+Shift+M` with an ERD tab open → focus lands on the ERD canvas.
6. While focus is inside the Explorer (`explorerFocus` context), confirm a
   zone-scoped shortcut behaves differently than the same key elsewhere (spot
   check against `ShortcutsView`'s When column for any explorer-scoped rule).
7. From the result grid, press `Escape` with a selection active → selection
   clears and focus jumps back to the editor toolbar zone (the round trip).

## Global nav & shortcuts

1. `Ctrl+Shift+P` → command palette opens; arrow keys move
   selection, Enter runs the highlighted command, Escape closes.
2. In the command palette, type part of an already-open tab's name → an "Open
   Tabs" group appears above the command list; Enter switches to that tab.
3. `Ctrl+K Ctrl+B` → Keyboard Shortcuts view opens; verify Command/Keybinding/
   When/Source columns render and search filters by binding too.
4. `Ctrl+=` / `Ctrl+-` / `Ctrl+0` → zoom in/out/reset.
5. `Ctrl+B` / `Ctrl+Alt+B` / `Ctrl+J` → left sidebar / right sidebar / result
   panel toggle.
6. `F4` on a focused explorer row, tab, or result cell → that item's context
   menu opens at the item (same actions as right-click).

## Dialogs / Menus (spot-check only — Radix-backed)

1. Open any confirmation dialog (e.g. drop table) → focus traps inside it,
   `Escape` closes and returns focus to the trigger.
2. Open any dropdown menu (e.g. a tab's context menu via right-click
   equivalent, or a `Select` in Settings) → arrow keys move the highlight,
   typeahead jumps to a matching item, Enter selects, Escape closes.

## Data grid

1. Click (or Tab) into a cell, then arrow keys move the active cell.
2. `Enter` or `F2` on a single selected cell → enters edit mode (same as a
   double-click). `Escape` while editing cancels without affecting the grid
   selection (unchanged — not part of this feature).
3. `Escape` on a selection with nothing being edited → clears the selection
   and returns focus to the editor toolbar zone.
4. `Ctrl+C` / `Ctrl+V` → copy/paste the selection as a TSV matrix.
5. `Delete` → deletes selected rows (when editable).
6. `Ctrl+F` → focuses the result search box; `F3` / `Shift+F3` → next/prev
   search hit.
7. `Ctrl+G` → focuses the row-jump box.
8. `Ctrl+PageUp` / `Ctrl+PageDown` → switches to the previous/next tab,
   without leaving the grid.

## Tabs

1. `Tab` into the strip lands on the active tab only (other tabs and their
   close buttons are not separate tab stops). `Enter` on that tab activates
   it. `Space` is reserved for picking the tab up to reorder it (see below).
2. With a tab focused, `Space` then arrow keys then `Space` again → reorders
   the tab via dnd-kit's keyboard sensor; `Escape` mid-drag cancels.
3. `Ctrl+Tab` → the most recently used tab (hold `Ctrl` and keep pressing `Tab` / `Shift+Tab` to walk back through recent tabs; releasing `Ctrl` commits). `Ctrl+PageDown` / `Ctrl+PageUp` → next/previous tab in the active group, left to right.
4. `Ctrl+1`..`Ctrl+9` → jump to tab 1..9 in the active group.
5. Double-click (or `F3`, per `editor.nextBookmark`'s fallback) to rename a
   query tab; `Enter` commits, `Escape` cancels.
6. Command palette tab-jump (see Global nav #2 above).

## ERD

1. `Ctrl+Shift+M` with an ERD tab open → canvas gets focus (visible focus
   ring on the canvas wrapper).
2. Arrow keys → pan the canvas.
3. `+` / `=` and `-` / `_` → zoom in/out. `0` → fit view.
4. Tab to a node (React Flow's own built-in node focus/tabIndex) → arrow keys
   nudge the node. The canvas pans only while the canvas wrapper itself has
   focus.

## Explorer tree (Z4 — roving tabindex)

1. `Tab` from the filter input into the tree → the first filter hit, or the
   most recently focused row, gets a visible focus ring.
2. Tables / Views (and the other category rows) are one tab stop. Arrow
   Up/Down moves between them. Arrow Down on the last category enters the
   tree. Arrow Up on the first tree row returns to the category. Enter or
   Space on a category selects it.
3. Arrow Up/Down in the tree → moves focus one row at a time, scrolling
   off-screen rows into view.
4. Arrow Right on a collapsed schema header → expands it. Arrow Left on an
   expanded one → collapses it.
5. Enter or Space on a schema header → toggles expand/collapse. Enter or
   Space on an object row → selects/opens it (same as a click).
6. Filtering (which force-expands every matching schema) doesn't break
   arrow-key navigation — the roving index clamps to the new row count.

## Settings

1. Open Settings (`Ctrl+,`) → Tab through each subview under
   `components/layout/settings/*.tsx`; confirm every control is reachable
   and operable via keyboard (spot-check pass — not individually audited
   per subview).
