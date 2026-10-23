// SPDX-License-Identifier: GPL-3.0-only

import type { SchemaNode } from '../../stores/schemaStore';
import { getSchemasForActiveDatabase } from '../../lib/monaco/sqlCompletionIdentifiers';
import {
    resolveTableNavigationAtPosition,
    type SqlModelLike,
    type SqlPositionLike,
    type TableNavigationMatch,
} from '../../lib/monaco/sqlTableNavigation';

export interface TableNavigationProfileLike {
    name?: string;
    db_name?: string;
}

export interface RunCtrlClickTableNavigationArgs {
    model: SqlModelLike;
    position: SqlPositionLike;
    profile: TableNavigationProfileLike | null | undefined;
    trees: Record<string, SchemaNode[]>;
    onOpenTable: (target: TableNavigationMatch) => void;
    onShowHint: (message: string, position: SqlPositionLike) => void;
    onShowPicker: (
        matches: TableNavigationMatch[],
        position: SqlPositionLike,
        onPick: (target: TableNavigationMatch) => void,
    ) => void;
}

const TABLE_NOT_FOUND_IN_CONTEXT = 'Table not found in the current context';

export type CtrlClickNavigationResult = 'navigated' | 'picker' | 'hint';

export function runCtrlClickTableNavigation(
    args: RunCtrlClickTableNavigationArgs,
): CtrlClickNavigationResult {
    const { model, position, profile, trees, onOpenTable, onShowHint, onShowPicker } = args;
    const profileName = profile?.name || '';
    const dbName = profile?.db_name || '';

    if (!profileName || !dbName) {
        onShowHint(TABLE_NOT_FOUND_IN_CONTEXT, position);
        return 'hint';
    }

    const schemas = getSchemasForActiveDatabase(trees, profileName, dbName);
    const navigation = resolveTableNavigationAtPosition(model, position, schemas);

    if (navigation.kind === 'single_match') {
        onOpenTable(navigation.match);
        return 'navigated';
    }

    if (navigation.kind === 'multiple_matches') {
        onShowPicker(navigation.matches, position, onOpenTable);
        return 'picker';
    }

    const label = navigation.lookup
        ? `Table not found: ${navigation.lookup}`
        : TABLE_NOT_FOUND_IN_CONTEXT;
    onShowHint(label, position);
    return 'hint';
}
