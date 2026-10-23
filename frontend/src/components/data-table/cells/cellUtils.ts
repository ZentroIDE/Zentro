// SPDX-License-Identifier: GPL-3.0-only

import { DragEndEvent } from '@dnd-kit/core';

import { CellValue, RawRow } from '../types';

const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/;
const DATETIME_SUFFIX_RE = /^(.+?)(\s+(?:(?:GMT)?[+-]\d{2}:?\d{2}|Z)(?:\s+\S+)?)$/i;

// ─── Row abstraction ──────────────────────────────────────────────────────────
// All table internals read cell values here. Swapping RawRow from string[] to
// Record<string, unknown> only requires updating this function.
export function getCellValue(row: RawRow, colIndex: number): CellValue {
    return row[colIndex] ?? null;
}

// ─── Cell key helpers ─────────────────────────────────────────────────────────
// Delimiter is "::" to avoid collision with rowKey values that contain ":"
// (e.g. "pk:1_2_3::columnName"). Always use these helpers — never concat manually.
const CELL_KEY_SEPARATOR = '::';

export function makeCellKey(rowKey: string, columnKey: string): string {
    return `${rowKey}${CELL_KEY_SEPARATOR}${columnKey}`;
}

export function parseCellKey(cellKey: string): { rowKey: string; columnKey: string } {
    const idx = cellKey.lastIndexOf(CELL_KEY_SEPARATOR);
    return {
        rowKey: cellKey.slice(0, idx),
        columnKey: cellKey.slice(idx + CELL_KEY_SEPARATOR.length),
    };
}

// ─── Column ID helpers ────────────────────────────────────────────────────────
export function makeDataColumnId(columnName: string, index: number): string {
    const safeName = (columnName || `col_${index}`).trim() || `col_${index}`;
    return `${index}_${safeName}`;
}

// ─── DateTime helpers ─────────────────────────────────────────────────────────
export const isDatetimeLike = (val: string): boolean => DATETIME_RE.test(val.trim());

export const toDatetimeLocalValue = (val: string): string => {
    let s = val.trim().replace(' ', 'T');
    s = s
        .replace(/[+-]\d{2}:?\d{2}(\s+\S+)?$/, '')
        .replace(/Z$/, '')
        .trim();
    s = s.replace(/(\d{2}:\d{2}:\d{2}\.)(\d{3})\d*/, '$1$2');
    return s;
};

export const fromDatetimeLocalValue = (val: string): string => val.replace('T', ' ');

export function splitDatetimeEditableValue(val: string): {
    editableValue: string;
    suffix: string;
} {
    const trimmed = val.trim();
    if (!isDatetimeLike(trimmed)) {
        return { editableValue: val, suffix: '' };
    }

    const match = trimmed.match(DATETIME_SUFFIX_RE);
    if (!match) {
        return { editableValue: trimmed, suffix: '' };
    }

    return {
        editableValue: match[1],
        suffix: match[2].trim(),
    };
}

export function mergeDatetimeEditableValue(editableValue: string, suffix: string): string {
    const normalized = editableValue.trim();
    if (!normalized) return editableValue;
    return suffix ? `${normalized} ${suffix}` : normalized;
}

// ─── DnD helpers ─────────────────────────────────────────────────────────────
export function getDragIds(event: DragEndEvent): { activeId: string; overId: string } {
    return {
        activeId: String(event.active.id || ''),
        overId: String(event.over?.id || ''),
    };
}
