// SPDX-License-Identifier: GPL-3.0-only

import {
    Briefcase,
    Building2,
    Cpu,
    Factory,
    GraduationCap,
    Heart,
    Landmark,
    Layers3,
    Leaf,
    Scale,
    ShoppingCart,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Project } from '../../types/project';

const PROJECT_ICON_TAG_PREFIX = 'icon:';
const PROJECT_PINNED_TAG_VALUES = new Set(['pinned', 'pin:true']);

export type ProjectIconKey =
    | 'general'
    | 'business'
    | 'education'
    | 'healthcare'
    | 'finance'
    | 'law'
    | 'retail'
    | 'manufacturing'
    | 'environment'
    | 'technology'
    | 'public';

export interface ProjectIconOption {
    key: ProjectIconKey;
    label: string;
    icon: LucideIcon;
}

export const PROJECT_ICON_OPTIONS: ProjectIconOption[] = [
    { key: 'general', label: 'General', icon: Layers3 },
    { key: 'business', label: 'Business', icon: Briefcase },
    { key: 'education', label: 'Education', icon: GraduationCap },
    { key: 'healthcare', label: 'Healthcare', icon: Heart },
    { key: 'finance', label: 'Finance', icon: Landmark },
    { key: 'law', label: 'Law & Policy', icon: Scale },
    { key: 'retail', label: 'Retail', icon: ShoppingCart },
    { key: 'manufacturing', label: 'Manufacturing', icon: Factory },
    { key: 'environment', label: 'Environment', icon: Leaf },
    { key: 'technology', label: 'Technology', icon: Cpu },
    { key: 'public', label: 'Public Sector', icon: Building2 },
];

export const PROJECT_ICON_MAP: Record<ProjectIconKey, ProjectIconOption> =
    PROJECT_ICON_OPTIONS.reduce(
        (map, option) => {
            map[option.key] = option;
            return map;
        },
        {} as Record<ProjectIconKey, ProjectIconOption>,
    );

export function isProjectIconKey(value: string): value is ProjectIconKey {
    return Object.prototype.hasOwnProperty.call(PROJECT_ICON_MAP, value);
}

export function formatRelativeDate(value?: string): string {
    if (!value) return 'unknown';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'unknown';
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor(
        (startOfToday.getTime() - startOfTarget.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (diffDays <= 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays <= 7) return 'last week';
    const weeks = Math.ceil(diffDays / 7);
    return weeks <= 1 ? 'last week' : `${weeks} wks ago`;
}

// Projects opened at least once sort by that open activity; projects never
// opened (e.g. just created) fall back to updated_at so they don't all tie at
// the same "never" value.
function lastUsedSortKey(project: Project): string {
    return project.last_opened_at || project.updated_at || '';
}

export function sortProjects(projects: Project[]): Project[] {
    return [...projects].sort((a, b) => {
        const aPinned = isProjectPinned(a) ? 1 : 0;
        const bPinned = isProjectPinned(b) ? 1 : 0;
        if (bPinned !== aPinned) return bPinned - aPinned;
        return lastUsedSortKey(b).localeCompare(lastUsedSortKey(a));
    });
}

export function getProjectIconKey(project: Project | null | undefined): ProjectIconKey {
    const iconTag = project?.tags?.find(tag => tag.startsWith(PROJECT_ICON_TAG_PREFIX));
    const raw = iconTag?.slice(PROJECT_ICON_TAG_PREFIX.length).trim();
    return raw && isProjectIconKey(raw) ? raw : 'general';
}

export function buildTagsWithProjectIcon(
    tags: string[] | undefined,
    iconKey: ProjectIconKey,
): string[] {
    const cleanTags = (tags || []).filter(tag => tag && !tag.startsWith(PROJECT_ICON_TAG_PREFIX));
    return [...cleanTags, `${PROJECT_ICON_TAG_PREFIX}${iconKey}`];
}

export function isProjectPinned(project: Project | null | undefined): boolean {
    return (project?.tags || []).some(tag =>
        PROJECT_PINNED_TAG_VALUES.has(tag.trim().toLowerCase()),
    );
}

export function buildTagsWithProjectPinned(tags: string[] | undefined, pinned: boolean): string[] {
    const cleanTags = (tags || []).filter(tag => {
        const normalized = tag.trim().toLowerCase();
        return tag && !PROJECT_PINNED_TAG_VALUES.has(normalized);
    });
    if (!pinned) return cleanTags;
    return [...cleanTags, 'pinned'];
}
