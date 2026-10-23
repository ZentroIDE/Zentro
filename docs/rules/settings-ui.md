# Settings UI rules

How a section of System Settings (`frontend/src/components/layout/settings/`) looks. The structure (header, `SettingField`, `SettingToggle`, registration in `SettingsView.tsx`) is in the `settings-section` skill. This file is the visual rules every section follows.

## Rows, not cards

1. **No border, card, or box around a row or a group of rows.** A section is one flat column of rows. `rounded-md border` on a wrapper inside a section is the mistake this rule exists for.
2. **Groups are named, not framed.** Start a group with `SettingGroupTitle` (small uppercase title, optional one-line description). Do not separate groups with `border-t` lines either.
3. **Every row is one of three shapes**, from `SettingItem.tsx`:
   - `SettingToggle`: a boolean. Title and description on the left, `Switch` on the right.
   - `SettingField`: an input, select, or text area. Label above, control, helper text below.
   - `SettingAction`: a row whose controls are buttons. Same shape as `SettingToggle`, buttons on the right.
   A section that truly fits none of these (a status card such as License) may build its own markup, still without a border.

## Controls

4. **On and off is a switch.** Starting a service, enabling a feature, or any two-state choice is a `SettingToggle`, never a pair of Start and Stop buttons.
5. **Choosing one of a few options is a row of buttons.** The selected one is `variant='default'` (primary) with `aria-pressed`, the others `variant='outline'`. Do not give each option its own card with a "Use" button.
6. **The action a row exists for is the primary button** (`variant='default'`, the default): Add, Test, Save, Connect. At most one per row. Other actions are `outline`; quiet ones (Hide, Show) are `ghost`.
   **A dangerous action is `variant='ghost'` with `tone='destructive'`**: anything that deletes, removes, clears a saved secret, or breaks something already working (Clear, Remove, Rotate token). Never make it primary, and never leave it as plain `ghost`.
7. **App buttons only**, from `components/ui`. No round buttons, no native `<button>`.
8. **A field and its action share one line.** A key input with Test and Clear is `Input` + buttons in one flex row inside a `SettingField`, not a field followed by a separate row of buttons.

## Text and state

9. **State goes in the row's own description or helper text**, for example "Key ••••f094 saved · 12 models". Do not add a separate badge or colored label.
10. **Status and errors** are one `text-label` line after the rows they belong to: muted for status, `text-destructive` for errors.
11. **Details people rarely need** (raw config, tokens, commands to paste) are folded behind a `ghost` button such as "Manual setup", closed by default.
12. **Descriptions say what happens**, in one sentence, in the user's terms. No implementation names.

## Checklist before merging a settings change

- No `border`, `rounded-md border`, or `border-t` inside the section's content.
- Each new row uses `SettingToggle`, `SettingField`, or `SettingAction`.
- Each two-state control is a switch.
- The main action of each row is primary; each dangerous one is `ghost` with `tone='destructive'`.
- `npm run check:frontend:guardrails`, `npm run check:frontend:design-system`, and the tests in `src/components/layout/settings` pass.
