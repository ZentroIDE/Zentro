// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useRef } from 'react';
import type { editor } from 'monaco-editor';
import type { Monaco } from '@monaco-editor/react';
import { setupSchemaWarningDecorations } from '../../lib/monaco/editorSchemaWarningDecorations';
import type { ColumnTableRef, SqlColumnWarning } from '../../lib/monaco/sqlColumnValidation';
import { useColumnWarnings } from './useColumnWarnings';

type UseColumnWarningsParams = Parameters<typeof useColumnWarnings>[0];

const COLUMN_CHECK_MARKER_SOURCE = 'column-check';

/**
 * Unknown-column checking for one editor: the warnings themselves, their
 * squiggles, and the per-editor command the "Refresh columns" quick fix runs.
 * `attach` is called once when Monaco mounts and returns its own cleanup.
 */
export function useColumnCheck(
    params: UseColumnWarningsParams & { tabId: string; inlineMessages: boolean },
) {
    const { tabId, inlineMessages, ...warningParams } = params;
    const { warnings, refreshColumns } = useColumnWarnings(warningParams);

    // Long-lived Monaco providers read these, so they must never go stale.
    const warningsRef = useRef(warnings);
    warningsRef.current = warnings;
    const inlineMessagesRef = useRef(inlineMessages);
    inlineMessagesRef.current = inlineMessages;
    const refreshColumnsRef = useRef(refreshColumns);
    refreshColumnsRef.current = refreshColumns;
    const decorationsRef = useRef<ReturnType<typeof setupSchemaWarningDecorations> | null>(null);
    const refreshCommandIdRef = useRef<string | undefined>(undefined);

    useEffect(() => {
        decorationsRef.current?.update(warnings, inlineMessages);
    }, [warnings, inlineMessages]);

    const getWarnings = useCallback((): SqlColumnWarning[] => warningsRef.current, []);
    const getRefreshCommandId = useCallback(() => refreshCommandIdRef.current, []);

    const attach = useCallback(
        (codeEditor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
            const decorations = setupSchemaWarningDecorations(
                codeEditor,
                monaco,
                `zentro-column-check-${tabId}`,
                { source: COLUMN_CHECK_MARKER_SOURCE },
            );
            decorationsRef.current = decorations;
            decorations.update(warningsRef.current, inlineMessagesRef.current);
            // addCommand() gives an id private to this editor, so two open tabs
            // never trigger each other's refresh.
            refreshCommandIdRef.current =
                codeEditor.addCommand(0, (_accessor: unknown, tables: ColumnTableRef[]) => {
                    void refreshColumnsRef.current(tables);
                }) ?? undefined;

            return () => {
                decorations.clear();
                if (decorationsRef.current === decorations) decorationsRef.current = null;
            };
        },
        [tabId],
    );

    return { getWarnings, getRefreshCommandId, attach };
}
