// SPDX-License-Identifier: GPL-3.0-only

import type { RefObject } from 'react';
import type { editor } from 'monaco-editor';
import { DOM_EVENT } from '../../lib/constants';
import { useTabScopedCommand } from '../../lib/commandBus';
import { resolveWildcardEnv, type SqlCodeActionDeps } from '../../lib/monaco/editorCodeActions';
import type { RunTargetResult } from '../../lib/monaco/monacoRunTarget';
import { expandAllWildcards } from '../../lib/monaco/sqlWildcardExpansion';
import { useToast } from '../../components/layout/Toast';

const UNRESOLVED_MESSAGE =
    "Couldn't expand * to columns (a table's columns are unavailable). Nothing was run.";

interface UseExpandWildcardAndRunParams {
    tabId: string;
    editorRef: RefObject<editor.IStandaloneCodeEditor | null>;
    isActiveRef: RefObject<boolean | undefined>;
    readOnlyRef: RefObject<boolean | undefined>;
    codeActionDeps: SqlCodeActionDeps;
    resolveTarget: () => RunTargetResult | null;
    runTarget: (target: RunTargetResult) => void;
}

/**
 * "Expand * and Run": writes the explicit column list into the editor, then
 * runs the statement, so the query the user keeps is the one that produced the
 * result. Refuses to run (rather than run the `*` version) when the columns
 * cannot be resolved, so the outcome is never silently different.
 */
export function useExpandWildcardAndRun({
    tabId,
    editorRef,
    isActiveRef,
    readOnlyRef,
    codeActionDeps,
    resolveTarget,
    runTarget,
}: UseExpandWildcardAndRunParams): void {
    const { toast } = useToast();

    useTabScopedCommand(DOM_EVENT.EXPAND_WILDCARD_AND_RUN_ACTION, tabId, () => {
        void (async () => {
            const codeEditor = editorRef.current;
            const model = codeEditor?.getModel();
            const target = resolveTarget();
            if (!isActiveRef.current || !codeEditor || !model || !target?.query.trim()) return;

            const versionBefore = model.getVersionId();
            const expansion = await expandAllWildcards(
                target.query,
                resolveWildcardEnv(codeActionDeps),
            );
            // The user kept typing while columns loaded: the range is stale.
            if (model.getVersionId() !== versionBefore) return;

            if (expansion.status === 'unresolved') {
                toast.error(UNRESOLVED_MESSAGE);
                return;
            }
            if (expansion.status === 'none' || readOnlyRef.current) {
                runTarget(target);
            } else {
                runTarget(applyExpansion(model, target, expansion.query));
            }
            codeEditor.focus();
        })();
    });
}

function applyExpansion(
    model: editor.ITextModel,
    target: RunTargetResult,
    expandedQuery: string,
): RunTargetResult {
    const startOffset = model.getOffsetAt({
        lineNumber: target.range.startLineNumber,
        column: target.range.startColumn,
    });
    model.pushEditOperations([], [{ range: target.range, text: expandedQuery }], () => null);
    const start = model.getPositionAt(startOffset);
    const end = model.getPositionAt(startOffset + expandedQuery.length);
    return {
        query: expandedQuery,
        range: {
            startLineNumber: start.lineNumber,
            startColumn: start.column,
            endLineNumber: end.lineNumber,
            endColumn: end.column,
        },
    };
}
