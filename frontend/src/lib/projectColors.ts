// SPDX-License-Identifier: GPL-3.0-only

import type { Project } from '../types/project';

export interface ProjectColorOption {
    key: string;
    label: string;
    value: string;
}

// Desaturated mid-lightness hues: readable when mixed at low percentage into
// both the dark default background and the light theme background.
export const PROJECT_COLOR_PALETTE: ProjectColorOption[] = [
    { key: 'slate', label: 'Slate', value: '#6b7280' },
    { key: 'rose', label: 'Rose', value: '#a86470' },
    { key: 'amber', label: 'Amber', value: '#a08050' },
    { key: 'olive', label: 'Olive', value: '#7d8c5c' },
    { key: 'teal', label: 'Teal', value: '#4f8f85' },
    { key: 'sky', label: 'Sky', value: '#5b8cae' },
    { key: 'indigo', label: 'Indigo', value: '#6a74b0' },
    { key: 'violet', label: 'Violet', value: '#8a6aa8' },
    { key: 'mauve', label: 'Mauve', value: '#9c6a8a' },
];

/** Palette key a brand-new project starts on. Existing projects with no
 * explicit color still fall back to the hash-derived color (see
 * resolveProjectColor) — this only seeds the wizard's create draft. */
export const DEFAULT_PROJECT_COLOR_KEY = 'teal';

// FNV-1a 32-bit — stable across sessions so a project keeps its auto color.
function fnv1a(seed: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
        hash ^= seed.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

export function hashProjectColorKey(seed: string): string {
    const index = fnv1a(seed) % PROJECT_COLOR_PALETTE.length;
    return PROJECT_COLOR_PALETTE[index].key;
}

export function hexToRgba(hex: string, alpha: number): string {
    const normalized = hex.replace('#', '');
    const r = parseInt(normalized.substring(0, 2), 16);
    const g = parseInt(normalized.substring(2, 4), 16);
    const b = parseInt(normalized.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function findPaletteOption(key: string | undefined): ProjectColorOption | undefined {
    if (!key) return undefined;
    return PROJECT_COLOR_PALETTE.find(option => option.key === key);
}

/**
 * Resolve the color identity of a project: an explicitly chosen palette key
 * wins; otherwise a stable hash of the project id assigns one (so projects
 * created before the color feature still get a consistent color with zero
 * migration). Unknown keys fall back to the hash. Null project -> null.
 */
export function resolveProjectColor(
    project: Pick<Project, 'id' | 'color'> | null | undefined,
): ProjectColorOption | null {
    if (!project || !project.id) return null;
    return (
        findPaletteOption(project.color) ??
        findPaletteOption(hashProjectColorKey(project.id)) ??
        null
    );
}
