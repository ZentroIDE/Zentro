// SPDX-License-Identifier: GPL-3.0-only

/**
 * Single source of truth for data-grid geometry.
 *
 * `RT_ROW_HEIGHT` MUST equal the rendered height of a `tbody` row, which is
 * locked to `--rt-row-height` in `styles/components.css`. Any drift between the
 * virtualizer's estimate and the real DOM height makes the spacer rows disagree
 * with the rendered rows: the content box grows or shrinks under the scrollbar
 * on every frame, which is exactly what a user perceives as stuttering scroll.
 * Change one and you must change the other.
 */
export const RT_ROW_HEIGHT = 20;

/** Fallback width for a data column the table has not sized yet. Matches the
 *  `size` on the generated column defs in `useDataTableColumns`. */
export const RT_DEFAULT_COLUMN_WIDTH = 140;
