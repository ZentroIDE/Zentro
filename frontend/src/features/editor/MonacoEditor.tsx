// SPDX-License-Identifier: GPL-3.0-only

import React, { useRef, useEffect, useCallback } from 'react';
import { utils } from '../../../wailsjs/go/models';
import Editor, { type Monaco, OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import { useSchemaStore } from '../../stores/schemaStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { MONO_FONT_PRESETS, useSettingsStore } from '../../stores/settingsStore';
import { useBookmarkStore } from '../../stores/bookmarkStore';
import { useEditorStore } from '../../stores/editorStore';
import { useProjectStore } from '../../stores/projectStore';
import { useEnvironmentStore } from '../../stores/environmentStore';
import { registerContextAwareSQLCompletion } from '../../lib/monaco/sqlCompletion';
import { registerSqlFolding } from '../../lib/monaco/sqlFolding';
import { registerSqlCompletionSchemaContextCommand } from '../../lib/monaco/sqlSuggestionSchemaContext';
import { registerEditorContextActions } from '../../lib/monaco/editorContextActions';
import { registerSqlCodeActions, type SqlCodeActionDeps } from '../../lib/monaco/editorCodeActions';
import { registerAppCommandsInMonaco } from '../../lib/monaco/editorCommandBridge';
import {
    initStatementCodeLens,
    registerStatementLensHandler,
    unregisterStatementLensHandler,
    getBlockText,
} from '../../lib/monaco/editorStatementLens';
import { syncEditorFontMetrics } from '../../lib/monaco/editorFontMetrics';
import { setupStatementHighlight } from '../../lib/monaco/editorStatementHighlight';
import { setupRiskHighlight } from '../../lib/monaco/editorRiskHighlight';
import { getSchemasForActiveDatabase } from '../../lib/monaco/sqlCompletionIdentifiers';
import {
    collectSqlSchemaWarnings,
    type SqlSchemaWarning,
} from '../../lib/monaco/sqlSchemaWarnings';
import type { TableNavigationMatch } from '../../lib/monaco/sqlTableNavigation';
import {
    resolveRunnableQueryTarget as resolveRunnableQueryTargetPure,
    type RunTargetResult,
} from '../../lib/monaco/monacoRunTarget';
import { setupBookmarkDecorations } from '../../lib/monaco/editorBookmarkDecorations';
import { setupPreviewDecorations } from '../../lib/monaco/editorPreviewDecorations';
import { setupExecutedLineDecorations } from '../../lib/monaco/editorExecutedLineDecorations';
import { setupSchemaWarningDecorations } from '../../lib/monaco/editorSchemaWarningDecorations';
import { setupSchemaTokenDecorations } from '../../lib/monaco/editorSchemaTokenDecorations';
import { collectSqlSchemaTokens } from '../../lib/monaco/sqlSchemaTokens';
import { setupTokenWeightDecorations } from '../../lib/monaco/editorTokenWeightDecorations';
import { installSqlTokenizer } from '../../lib/monaco/sqlLanguage';
import { semiboldGrammarCategories } from '../../lib/sqlEditorStyle';
import { collectSqlSyntaxWarnings } from '../../lib/monaco/sqlSyntaxDiagnostics';
import { setupCtrlHoverDecorations } from '../../lib/monaco/editorCtrlHoverDecorations';
import { runCtrlClickTableNavigation } from './monacoTableNavigation';
import { EditorToolbar } from './EditorToolbar';
import { useColumnCheck } from './useColumnCheck';
import { useExpandWildcardAndRun } from './useExpandWildcardAndRun';
import { useEditorSelectionInfo } from './useEditorSelectionInfo';
import { useEditorRepaint } from './useEditorRepaint';
import { EditorStatusStrip } from './EditorStatusStrip';
import { InlineTableNavigationWidget } from './InlineTableNavigationWidget';
import { DOM_EVENT, TAB_TYPE } from '../../lib/constants';
import { createTableTab } from '../../lib/tabFactory';
import { emitCommand, onCommand, useTabScopedCommand } from '../../lib/commandBus';
import { takePendingRun } from '../../lib/pendingRun';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../shared/kernel';
import { useMonacoTheme, useResolvedTheme } from '../../lib/theme';
import { cn } from '../../lib/cn';
import { resolvePreferredSchemaName } from '../../components/layout/schemaContext';
import type { EnvironmentKey } from '../../types/project';

// Keystrokes stay purely local to Monaco's own buffer as they happen; this is
// only how fast we mirror that text out to the shared editor store afterwards.
// updateTabQuery() replaces the whole groups/tabs tree, so every write fans out
// re-renders (Toolbar, TabBar, sidebar, autosave, ...) across the app — firing
// that on every keystroke, on top of the legacy textarea input path forced by
// editContext:false below, is what made typing itself feel delayed. VS Code
// never routes a keystroke through app-wide reactive state at all; this is the
// closest cheap equivalent: batch keystrokes and sync once typing pauses.
const EDITOR_CHANGE_SYNC_DEBOUNCE_MS = 150;

interface MonacoEditorProps {
    tabId: string;
    value: string;
    onChange: (val: string) => void;
    onRun: (query: string) => void;
    onExplain?: (query: string, analyze: boolean) => void;
    isActive?: boolean;
    onFocus?: () => void;
    readOnly?: boolean;
    previewedSql?: string | null;
}

export const MonacoEditorWrapper: React.FC<MonacoEditorProps> = ({
    tabId,
    value,
    onChange,
    onRun,
    onExplain,
    isActive,
    onFocus,
    readOnly,
    previewedSql,
}) => {
    const ULTRA_COMPACT_GUTTER = {
        lineNumbersMinChars: 1,
        lineDecorationsWidth: 0,
    } as const;

    const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<Monaco | null>(null);
    const sqlCompletionRegistrationRef = useRef<{ dispose: () => void } | null>(null);
    const onRunRef = useRef(onRun);
    onRunRef.current = onRun; // keep ref fresh without re-registering keybinding
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const onExplainRef = useRef(onExplain);
    onExplainRef.current = onExplain;
    const onFocusRef = useRef(onFocus);
    onFocusRef.current = onFocus;
    const isActiveRef = useRef(isActive);
    isActiveRef.current = isActive;
    const readOnlyRef = useRef(readOnly);
    readOnlyRef.current = readOnly;
    const schemaWarningOwnerRef = useRef(`zentro-schema-context-${tabId}`);
    const schemaWarningsRef = useRef<SqlSchemaWarning[]>([]);
    const bookmarkDecorationsRef = useRef<ReturnType<typeof setupBookmarkDecorations> | null>(null);
    const previewDecorationsRef = useRef<ReturnType<typeof setupPreviewDecorations> | null>(null);
    const executedLineDecorationsRef = useRef<ReturnType<
        typeof setupExecutedLineDecorations
    > | null>(null);
    const schemaWarningDecorationsRef = useRef<ReturnType<
        typeof setupSchemaWarningDecorations
    > | null>(null);
    const ctrlHoverDecorationsRef = useRef<ReturnType<typeof setupCtrlHoverDecorations> | null>(
        null,
    );
    const syntaxWarningOwnerRef = useRef(`zentro-sql-syntax-${tabId}`);
    const syntaxDecorationsRef = useRef<ReturnType<typeof setupSchemaWarningDecorations> | null>(
        null,
    );
    const tokenWeightDecorationsRef = useRef<ReturnType<typeof setupTokenWeightDecorations> | null>(
        null,
    );
    const schemaTokenDecorationsRef = useRef<ReturnType<typeof setupSchemaTokenDecorations> | null>(
        null,
    );

    // Focus editor when it becomes active
    useEffect(() => {
        if (isActive && editorRef.current) {
            editorRef.current.focus();
        }
    }, [isActive]);

    const resolveRunnableQueryTarget = useCallback(() => {
        if (!editorRef.current) return null;
        const editor = editorRef.current;
        return resolveRunnableQueryTargetPure(
            editor.getModel(),
            editor.getSelection(),
            editor.getPosition(),
        );
    }, []);

    const extractRunnableQuery = useCallback(
        () => resolveRunnableQueryTarget()?.query || '',
        [resolveRunnableQueryTarget],
    );

    // Monaco owns the buffer; `value` is only our mirror of it, and because
    // the sync above is debounced that mirror is routinely a keystroke or two
    // behind. Handing it to <Editor value={...}> let @monaco-editor/react
    // replace the entire model with the stale text (executeEdits over the
    // full model range, with the resulting change event suppressed) whenever
    // a keystroke landed between the debounce firing and React committing —
    // which reordered characters, stranded the caret mid-word, and left our
    // mirror silently disagreeing with the buffer until the app was reloaded.
    // So the editor mounts uncontrolled (defaultValue) and only genuinely
    // external writes are pushed into the model, by the effect further down.
    const valueRef = useRef(value);
    valueRef.current = value;
    const lastEmittedValueRef = useRef(value);
    const applyingExternalValueRef = useRef(false);

    const emitChange = useCallback((next: string) => {
        lastEmittedValueRef.current = next;
        onChangeRef.current(next);
    }, []);

    const pendingChangeRef = useRef<string | null>(null);
    const changeDebounceTimerRef = useRef<number | null>(null);

    const cancelPendingChange = useCallback(() => {
        if (changeDebounceTimerRef.current !== null) {
            window.clearTimeout(changeDebounceTimerRef.current);
            changeDebounceTimerRef.current = null;
        }
        pendingChangeRef.current = null;
    }, []);

    const flushPendingChange = useCallback(() => {
        if (changeDebounceTimerRef.current !== null) {
            window.clearTimeout(changeDebounceTimerRef.current);
            changeDebounceTimerRef.current = null;
        }
        if (pendingChangeRef.current !== null) {
            const pending = pendingChangeRef.current;
            pendingChangeRef.current = null;
            emitChange(pending);
        }
    }, [emitChange]);

    const scheduleChange = useCallback(
        (v: string) => {
            pendingChangeRef.current = v;
            if (changeDebounceTimerRef.current !== null) {
                window.clearTimeout(changeDebounceTimerRef.current);
            }
            changeDebounceTimerRef.current = window.setTimeout(() => {
                changeDebounceTimerRef.current = null;
                const pending = pendingChangeRef.current;
                pendingChangeRef.current = null;
                if (pending !== null) emitChange(pending);
            }, EDITOR_CHANGE_SYNC_DEBOUNCE_MS);
        },
        [emitChange],
    );

    // Writes that did not come from this editor — query formatting, a
    // template or snippet insertion, a restored snapshot, another feature
    // rewriting the tab's query — still have to reach the model. Anything we
    // emitted ourselves is skipped: the buffer already has it, and it is
    // exactly that re-application which corrupted in-flight typing.
    const applyExternalValue = useCallback((next: string) => {
        const editor = editorRef.current;
        const model = editor?.getModel();
        if (!editor || !model) return;
        if (next === model.getValue()) return;
        // A full-model overwrite is an edit Monaco's own snippet controller
        // doesn't know about, so it tears down any live tab-stop session —
        // e.g. right after accepting a builtin template snippet, collapsing
        // the placeholder selection before the user can type over it.
        const snippetController = editor.getContribution('snippetController2') as {
            isInSnippet?: () => boolean;
        } | null;
        if (snippetController?.isInSnippet?.()) return;
        const selection = editor.getSelection();
        applyingExternalValueRef.current = true;
        try {
            model.pushEditOperations(
                [],
                [{ range: model.getFullModelRange(), text: next }],
                () => null,
            );
        } finally {
            applyingExternalValueRef.current = false;
        }
        if (selection) {
            editor.setSelection(model.validateRange(selection));
        }
    }, []);

    useEffect(() => {
        if (value === lastEmittedValueRef.current) return;
        if (!editorRef.current?.getModel()) return;
        cancelPendingChange();
        lastEmittedValueRef.current = value;
        applyExternalValue(value);
    }, [applyExternalValue, cancelPendingChange, value]);

    const runQueryRef = useRef<() => void>();
    const runTarget = useCallback((target: RunTargetResult) => {
        executedLineDecorationsRef.current?.set(target.range);
        onRunRef.current(target.query);
    }, []);
    const runQuery = useCallback(() => {
        const target = resolveRunnableQueryTarget();
        if (!target?.query.trim()) return;
        runTarget(target);
    }, [resolveRunnableQueryTarget, runTarget]);
    runQueryRef.current = runQuery;

    // Listen to global run action from Toolbar
    useTabScopedCommand(DOM_EVENT.RUN_QUERY_ACTION, tabId, () => {
        if (!isActiveRef.current) return;
        runQuery();
        // Toolbar/shortcut-triggered runs move DOM focus off the
        // editor (e.g. onto the Run button); bring it back so the
        // user can keep typing without an extra click.
        editorRef.current?.focus();
    });

    useTabScopedCommand(DOM_EVENT.RUN_EXPLAIN_ACTION, tabId, detail => {
        if (!isActiveRef.current || !onExplainRef.current) return;
        const query = extractRunnableQuery();
        if (!query) return;
        onExplainRef.current(query, Boolean(detail?.analyze));
    });

    const activeProfile = useConnectionStore(s => s.activeProfile);
    const isConnected = useConnectionStore(s => s.isConnected);
    const activeProject = useProjectStore(state => state.activeProject);
    const activeEnvironmentKey = useEnvironmentStore(state => state.activeEnvironmentKey);
    const trees = useSchemaStore(s => s.trees);
    const addTab = useEditorStore(s => s.addTab);
    const { fontSize, theme, monoFamily, updateFontSize } = useSettingsStore();
    const riskHighlight = useSettingsStore(state => state.riskHighlight);
    const minimap = useSettingsStore(state => state.minimap);
    const errorLens = useSettingsStore(state => state.errorLens);
    const schemaHighlight = useSettingsStore(state => state.sqlEditorStyle.schemaHighlight);
    const sqlEditorStyle = useSettingsStore(state => state.sqlEditorStyle);
    const cachedColumns = useSchemaStore(s => (schemaHighlight ? s.cachedColumns : null));
    const editorFocusMode = useSettingsStore(state => state.editorFocusMode);
    const editorFocusWidth = useSettingsStore(state => state.editorFocusWidth);
    const monacoTheme = useMonacoTheme(theme);
    const targetEnvironmentKey =
        activeEnvironmentKey ||
        activeProject?.last_active_environment_key ||
        activeProject?.default_environment_key;
    const currentEnvironment = React.useMemo(() => {
        if (!activeProject || !targetEnvironmentKey) return null;
        return (
            activeProject.environments?.find(
                environment => environment.key === targetEnvironmentKey,
            ) || null
        );
    }, [activeProject, targetEnvironmentKey]);
    const schemaTree = React.useMemo(() => {
        if (!activeProfile?.name || !activeProfile?.db_name) return [];
        return trees[`${activeProfile.name}:${activeProfile.db_name}`] || [];
    }, [activeProfile?.db_name, activeProfile?.name, trees]);
    const currentSchema = React.useMemo(
        () =>
            resolvePreferredSchemaName(
                schemaTree.map(schema => schema.Name).filter(Boolean),
                currentEnvironment?.last_schema?.trim() || '',
            ),
        [currentEnvironment?.last_schema, schemaTree],
    );
    const currentSchemaRef = useRef(currentSchema);
    currentSchemaRef.current = currentSchema;
    const targetEnvironmentKeyRef = useRef(targetEnvironmentKey);
    targetEnvironmentKeyRef.current = targetEnvironmentKey;
    const schemaWarnings = React.useMemo(() => {
        if (!isActive || !currentSchema || schemaTree.length === 0 || !value.trim()) return [];
        return collectSqlSchemaWarnings(value, schemaTree, currentSchema);
    }, [currentSchema, isActive, schemaTree, value]);
    schemaWarningsRef.current = schemaWarnings;

    // Connection-free syntax checks (unbalanced parens, unterminated strings,
    // trailing commas, `= NULL`, UPDATE/DELETE without WHERE). Shown through the
    // same marker/Error Lens path as the schema warnings, under their own owner.
    const syntaxWarnings = React.useMemo(
        () =>
            isActive && !readOnly
                ? collectSqlSyntaxWarnings(value, activeProfile?.driver ?? '')
                : [],
        [activeProfile?.driver, isActive, readOnly, value],
    );
    const syntaxWarningsRef = useRef(syntaxWarnings);
    syntaxWarningsRef.current = syntaxWarnings;
    const errorLensRef = useRef(errorLens);
    errorLensRef.current = errorLens;

    // Categories the user set to semi-bold; the theme draws them bold and a
    // decoration trims that to 600 (Monaco's token theme has no other weight).
    const resolvedAppearance = useResolvedTheme(theme);
    const semiboldCategories = React.useMemo(
        () => semiboldGrammarCategories(sqlEditorStyle, resolvedAppearance),
        [resolvedAppearance, sqlEditorStyle],
    );
    const semiboldCategoriesRef = useRef(semiboldCategories);
    semiboldCategoriesRef.current = semiboldCategories;

    // Opt-in cosmetic colouring of table/column/alias names. Columns come only
    // from what the schema store has already cached; nothing is fetched here.
    const schemaTokens = React.useMemo(() => {
        if (!schemaHighlight || !isActive || schemaTree.length === 0) return [];
        const prefix = `${activeProfile?.name ?? ''}:${activeProfile?.db_name ?? ''}`;
        return collectSqlSchemaTokens(value, {
            schemas: schemaTree,
            currentSchema,
            getColumns: (schemaName, tableName) =>
                cachedColumns?.[`${prefix}:${schemaName}:${tableName}`]?.columns.map(
                    column => column.Name,
                ),
        });
    }, [
        activeProfile?.db_name,
        activeProfile?.name,
        cachedColumns,
        currentSchema,
        isActive,
        schemaHighlight,
        schemaTree,
        value,
    ]);

    // Drag-to-resize for focus mode — direct DOM mutation avoids React re-renders during drag
    const editorContainerRef = useRef<HTMLDivElement>(null);
    const dragWidthRef = useRef<number | null>(null);
    const editorFocusWidthRef = useRef(editorFocusWidth);
    editorFocusWidthRef.current = editorFocusWidth;

    const startDrag = useCallback((e: React.MouseEvent, side: 'left' | 'right') => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = editorFocusWidthRef.current;
        const container = editorContainerRef.current;
        if (!container) return;

        const onMove = (ev: MouseEvent) => {
            const delta = ev.clientX - startX;
            const change = side === 'left' ? -delta * 2 : delta * 2;
            const w = Math.max(400, Math.min(2400, startWidth + change));
            dragWidthRef.current = w;
            container.style.width = `${w}px`;
        };

        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            const final = dragWidthRef.current;
            dragWidthRef.current = null;
            if (final !== null) {
                useSettingsStore
                    .getState()
                    .save(new utils.Preferences({ editor_focus_width: Math.round(final) }));
            }
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, []);

    const riskHighlightRef = useRef(riskHighlight);
    riskHighlightRef.current = riskHighlight;
    const riskHighlightInstanceRef = useRef<{ dispose: () => void; refresh: () => void } | null>(
        null,
    );
    const { byTab, loadBookmarks, toggleLine, nextLine } = useBookmarkStore();
    const bookmarks = byTab[tabId] || [];
    const toggleLineRef = useRef(toggleLine);
    toggleLineRef.current = toggleLine;
    const activeProfileNameRef = useRef(activeProfile?.name);
    activeProfileNameRef.current = activeProfile?.name;
    const activeProfileRef = useRef(activeProfile);
    activeProfileRef.current = activeProfile;
    const treesRef = useRef(trees);
    treesRef.current = trees;
    const addTabRef = useRef(addTab);
    addTabRef.current = addTab;
    const navWidgetRef = useRef<InlineTableNavigationWidget | null>(null);
    const contextActionsRef = useRef<{ dispose: () => void } | null>(null);

    const applyBookmarkDecorations = useCallback(() => {
        bookmarkDecorationsRef.current?.update(bookmarks);
    }, [bookmarks]);

    useEffect(() => {
        if (!activeProfile?.name) return;
        loadBookmarks(activeProfile.name, tabId).catch(err =>
            console.error('load bookmarks failed', err),
        );
    }, [activeProfile?.name, tabId, loadBookmarks]);

    useEffect(() => {
        applyBookmarkDecorations();
    }, [applyBookmarkDecorations]);

    useEffect(() => {
        previewDecorationsRef.current?.update(previewedSql);
    }, [previewedSql]);

    useEffect(() => {
        riskHighlightInstanceRef.current?.refresh();
    }, [riskHighlight]);

    // schemaWarnings is already [] whenever !isActive/!currentSchema/no
    // schema tree/empty value (see the useMemo below), so update()'s own
    // empty-list branch covers what used to be a separate early-return here.
    useEffect(() => {
        schemaWarningDecorationsRef.current?.update(schemaWarnings, errorLens);
    }, [schemaWarnings, errorLens]);

    // Read at mount time (handleMount must not depend on it), pushed on change.
    const schemaTokensRef = useRef(schemaTokens);
    schemaTokensRef.current = schemaTokens;
    useEffect(() => {
        syntaxDecorationsRef.current?.update(syntaxWarnings, errorLens);
    }, [syntaxWarnings, errorLens]);

    useEffect(() => {
        tokenWeightDecorationsRef.current?.update(semiboldCategories);
    }, [semiboldCategories]);

    useEffect(() => {
        schemaTokenDecorationsRef.current?.update(schemaTokens);
    }, [schemaTokens]);

    useEffect(() => {
        editorRef.current?.updateOptions({ minimap: { enabled: minimap } });
    }, [minimap]);

    useEffect(
        () => () => {
            navWidgetRef.current?.dispose();
            navWidgetRef.current = null;
            schemaWarningDecorationsRef.current?.clear();
            // Belt-and-braces: onDidDispose below already flushes on the
            // normal teardown path. Just make sure nothing lingers.
            if (changeDebounceTimerRef.current !== null) {
                window.clearTimeout(changeDebounceTimerRef.current);
            }
        },
        [],
    );

    const columnCheck = useColumnCheck({
        tabId,
        inlineMessages: errorLens,
        enabled: Boolean(isActive),
        sqlText: value,
        schemas: schemaTree,
        currentSchema,
        profileName: activeProfile?.name ?? '',
        dbName: activeProfile?.db_name ?? '',
        driver: activeProfile?.driver ?? '',
    });

    // Read through refs so the deps stay stable while connection, schema and
    // warnings change underneath the long-lived Monaco providers.
    const codeActionDeps = React.useMemo<SqlCodeActionDeps>(
        () => ({
            getConnection: () => {
                const profile = activeProfileRef.current;
                if (!profile?.name || !profile.db_name) return null;
                return {
                    profileName: profile.name,
                    dbName: profile.db_name,
                    driver: profile.driver || '',
                };
            },
            getCurrentSchema: () => currentSchemaRef.current,
            getEnvironmentKey: () => targetEnvironmentKeyRef.current,
            getTrees: () => treesRef.current,
            getSchemaWarnings: () => schemaWarningsRef.current,
            getColumnWarnings: columnCheck.getWarnings,
            getRefreshColumnsCommandId: columnCheck.getRefreshCommandId,
            fetchColumns: async (schemaName, tableName) => {
                const profile = activeProfileRef.current;
                if (!profile?.name || !profile.db_name) return [];
                return useSchemaStore
                    .getState()
                    .checkAndFetchColumns(profile.name, profile.db_name, schemaName, tableName);
            },
        }),
        [columnCheck.getWarnings, columnCheck.getRefreshCommandId],
    );

    useExpandWildcardAndRun({
        tabId,
        editorRef,
        isActiveRef,
        readOnlyRef,
        codeActionDeps,
        resolveTarget: resolveRunnableQueryTarget,
        runTarget,
    });

    const handleMount: OnMount = useCallback(
        (editor, monacoInstance) => {
            editorRef.current = editor;
            monacoRef.current = monacoInstance;
            // Monaco loads asynchronously, so the tab's query may have moved
            // on since defaultValue was read.
            lastEmittedValueRef.current = valueRef.current;
            applyExternalValue(valueRef.current);
            // A tab opened to run right away (the assistant's "Execute on")
            // runs once its query is in the editor.
            if (takePendingRun(tabId)) {
                window.setTimeout(() => runQueryRef.current?.(), 0);
            }
            navWidgetRef.current?.dispose();
            navWidgetRef.current = new InlineTableNavigationWidget(editor, monacoInstance);
            contextActionsRef.current?.dispose();
            contextActionsRef.current = registerEditorContextActions({
                editor,
                tabId,
            });
            registerAppCommandsInMonaco(editor, monacoInstance);

            bookmarkDecorationsRef.current = setupBookmarkDecorations(editor, monacoInstance);
            previewDecorationsRef.current = setupPreviewDecorations(editor, monacoInstance);
            executedLineDecorationsRef.current = setupExecutedLineDecorations(
                editor,
                monacoInstance,
            );
            schemaWarningDecorationsRef.current = setupSchemaWarningDecorations(
                editor,
                monacoInstance,
                schemaWarningOwnerRef.current,
            );
            syntaxDecorationsRef.current = setupSchemaWarningDecorations(
                editor,
                monacoInstance,
                syntaxWarningOwnerRef.current,
                { source: 'sql-syntax' },
            );
            syntaxDecorationsRef.current.update(syntaxWarningsRef.current, errorLensRef.current);
            // Normally done at app start; harmless and idempotent here.
            installSqlTokenizer(monacoInstance);
            tokenWeightDecorationsRef.current = setupTokenWeightDecorations(editor, monacoInstance);
            tokenWeightDecorationsRef.current.update(semiboldCategoriesRef.current);
            schemaTokenDecorationsRef.current = setupSchemaTokenDecorations(editor, monacoInstance);
            schemaTokenDecorationsRef.current.update(schemaTokensRef.current);
            const detachColumnCheck = columnCheck.attach(editor, monacoInstance);
            ctrlHoverDecorationsRef.current?.dispose();
            ctrlHoverDecorationsRef.current = setupCtrlHoverDecorations(
                editor,
                monacoInstance,
                () => {
                    const profile = activeProfileRef.current;
                    const profileName = profile?.name || '';
                    const dbName = profile?.db_name || '';
                    if (!profileName || !dbName) return null;
                    return getSchemasForActiveDatabase(treesRef.current, profileName, dbName);
                },
            );

            const statementHighlight = setupStatementHighlight(editor, monacoInstance);
            riskHighlightInstanceRef.current = setupRiskHighlight(
                editor,
                monacoInstance,
                () => riskHighlightRef.current,
            );
            initStatementCodeLens(monacoInstance);
            const codeLensUri = editor.getModel()?.uri.toString() ?? '';
            if (codeLensUri) {
                registerStatementLensHandler(codeLensUri, startLine => {
                    const model = editor.getModel();
                    if (!model) return;
                    const text = getBlockText(model, startLine).trim().replace(/;+$/, '');
                    if (!text) return;
                    onRunRef.current(text);
                    // The code lens "Run" link is a DOM widget outside the
                    // editor's input area, and Monaco keeps stealing focus
                    // back to it even after a deferred editor.focus() call.
                    // Route through the same FOCUS_ACTIVE_EDITOR command
                    // Ctrl+I uses, which reliably wins.
                    emitCommand(DOM_EVENT.FOCUS_ACTIVE_EDITOR);
                });
            }

            const openDefinition = (target: TableNavigationMatch) => {
                const profile = activeProfileRef.current;
                const connectionID = profile?.id || '';
                const dbName = profile?.db_name || '';
                const environmentKey = targetEnvironmentKeyRef.current || '';
                const connection =
                    connectionID && dbName && profile?.driver
                        ? { connectionID, dbName, driver: profile.driver, environmentKey }
                        : undefined;
                addTabRef.current(createTableTab(target.qualifiedName, connection));
            };

            // Register SQL completion provider
            registerSqlCompletionSchemaContextCommand(monacoInstance);
            sqlCompletionRegistrationRef.current?.dispose();
            sqlCompletionRegistrationRef.current =
                registerContextAwareSQLCompletion(monacoInstance);
            registerSqlFolding(monacoInstance);
            const codeActionRegistration = registerSqlCodeActions(
                monacoInstance,
                editor,
                codeActionDeps,
            );

            // Add wheel handler for Zoom (Ctrl + Wheel) using native DOM event
            // because Monaco's abstraction sometimes fails to capture in specific environments
            const domNode = editor.getDomNode();
            let wheelZoomHandler: ((e: WheelEvent) => void) | null = null;
            if (domNode) {
                wheelZoomHandler = (e: WheelEvent) => {
                    if (!e) return;
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        e.stopImmediatePropagation();

                        const currentOptions = editor.getOptions();
                        const currentFontSize = currentOptions.get(
                            monacoInstance.editor.EditorOption.fontSize,
                        );

                        if (e.deltaY < 0) {
                            const newSize = Math.min(48, currentFontSize + 1);
                            editor.updateOptions({
                                fontSize: newSize,
                                lineHeight: newSize * 1.5,
                            });
                            updateFontSize(1);
                        } else {
                            const newSize = Math.max(8, currentFontSize - 1);
                            editor.updateOptions({
                                fontSize: newSize,
                                lineHeight: newSize * 1.5,
                            });
                            updateFontSize(-1);
                        }
                    }
                };
                domNode.addEventListener('wheel', wheelZoomHandler, { passive: false });
            }

            const safeId = tabId.replace(/[^a-zA-Z0-9]/g, '');
            const editorFocusKey = editor.createContextKey<boolean>(
                `isEditorFocused_${safeId}`,
                false,
            );

            editor.onDidFocusEditorWidget(() => {
                editorFocusKey.set(true);
                if (onFocusRef.current) {
                    onFocusRef.current();
                }
            });

            editor.onDidBlurEditorWidget(() => {
                editorFocusKey.set(false);
                navWidgetRef.current?.hide();
                contextActionsRef.current?.dispose();
                contextActionsRef.current = null;
                // Don't leave the store stale while focus is elsewhere (e.g.
                // another tab reading this tab's query, or a tab switch).
                flushPendingChange();
            });

            editor.onMouseDown(e => {
                const browserEvent = e?.event?.browserEvent as MouseEvent | undefined;
                const targetType = e?.target?.type;
                const mt = monacoInstance.editor.MouseTargetType;
                const inContentText = targetType === mt.CONTENT_TEXT;
                const clickPosition = e?.target?.position;

                const isModifierClick = Boolean(
                    browserEvent &&
                    (browserEvent.ctrlKey || browserEvent.metaKey) &&
                    browserEvent.button === 0,
                );
                if (isModifierClick && isActiveRef.current) {
                    if (inContentText) {
                        const model = editor.getModel();

                        if (model && clickPosition) {
                            runCtrlClickTableNavigation({
                                model,
                                position: clickPosition,
                                profile: activeProfileRef.current,
                                trees: treesRef.current,
                                onOpenTable: openDefinition,
                                onShowHint: (message, position) =>
                                    navWidgetRef.current?.showHint(message, position),
                                onShowPicker: (matches, position, onPick) =>
                                    navWidgetRef.current?.showPicker(matches, position, onPick),
                            });
                        }

                        browserEvent?.preventDefault();
                        browserEvent?.stopPropagation();
                        return;
                    }
                }

                const isRightClick =
                    Boolean(e?.event?.rightButton) || e?.event?.browserEvent?.button === 2;
                if (!isRightClick) return;
                if (readOnlyRef.current) return;
                if (!isActiveRef.current) return;

                const inBookmarkGutter = targetType === mt.GUTTER_LINE_NUMBERS;
                if (!inBookmarkGutter) return;

                const line = Number(e?.target?.position?.lineNumber || 0);
                const connectionName = activeProfileNameRef.current;
                if (!connectionName || line <= 0) return;

                toggleLineRef.current(connectionName, tabId, line).catch((err: unknown) => {
                    console.error('toggle bookmark by gutter failed', err);
                });
            });

            editor.onDidDispose(() => {
                // Tab closing or unmounting shouldn't drop the last
                // not-yet-synced keystrokes.
                flushPendingChange();
                sqlCompletionRegistrationRef.current?.dispose();
                sqlCompletionRegistrationRef.current = null;
                schemaWarningDecorationsRef.current?.clear();
                schemaTokenDecorationsRef.current?.clear();
                schemaTokenDecorationsRef.current = null;
                tokenWeightDecorationsRef.current?.dispose();
                tokenWeightDecorationsRef.current = null;
                syntaxDecorationsRef.current?.clear();
                syntaxDecorationsRef.current = null;
                detachColumnCheck();
                if (domNode && wheelZoomHandler) {
                    domNode.removeEventListener('wheel', wheelZoomHandler);
                }
                ctrlHoverDecorationsRef.current?.dispose();
                ctrlHoverDecorationsRef.current = null;
                executedLineDecorationsRef.current?.dispose();
                executedLineDecorationsRef.current = null;
                statementHighlight.dispose();
                riskHighlightInstanceRef.current?.dispose();
                riskHighlightInstanceRef.current = null;
                if (codeLensUri) unregisterStatementLensHandler(codeLensUri);
                codeActionRegistration.dispose();
            });

            setEditorMounted(true);
            setEditorInstance(editor);

            if (isActiveRef.current) {
                // Need a tiny timeout because monaco layout might need to settle
                setTimeout(() => {
                    editor.focus();
                }, 10);
            }

            // If bookmarks were already hydrated before Monaco mounted, render them now.
            applyBookmarkDecorations();
        },
        [
            applyBookmarkDecorations,
            applyExternalValue,
            codeActionDeps,
            columnCheck.attach,
            flushPendingChange,
            tabId,
            updateFontSize,
        ],
    );

    useTabScopedCommand(DOM_EVENT.FORMAT_QUERY_ACTION, tabId, () => {
        void (async () => {
            if (!isActiveRef.current || !editorRef.current) return;
            const model = editorRef.current.getModel();
            if (!model) return;
            const target = resolveRunnableQueryTarget() || {
                query: model.getValue(),
                range: model.getFullModelRange(),
            };
            if (!target.query.trim()) return;
            try {
                const dialect = activeProfile?.driver || '';
                const formatted = unwrapOrThrow(
                    await getApiGateway().query.formatSQL(target.query, dialect),
                );
                model.pushEditOperations(
                    [],
                    [
                        {
                            range: target.range,
                            text: formatted,
                        },
                    ],
                    () => null,
                );
                emitChange(model.getValue());
                // The edit above already re-armed the debounce (any content
                // change re-triggers Editor's onChange); the sync above made
                // it redundant, so drop it instead of firing again later.
                cancelPendingChange();
            } catch (err) {
                console.error('format failed', err);
            }
        })();
    });

    useTabScopedCommand(DOM_EVENT.TOGGLE_BOOKMARK_ACTION, tabId, () => {
        void (async () => {
            if (!isActiveRef.current || !editorRef.current || !activeProfile?.name) return;
            const line = editorRef.current.getPosition()?.lineNumber;
            if (!line) return;
            await toggleLine(activeProfile.name, tabId, line);
        })();
    });

    useTabScopedCommand(DOM_EVENT.NEXT_BOOKMARK_ACTION, tabId, () => {
        if (!isActiveRef.current || !editorRef.current) return;
        const currentLine = editorRef.current.getPosition()?.lineNumber || 0;
        const target = nextLine(tabId, currentLine);
        if (!target) return;
        editorRef.current.revealLineInCenter(target);
        editorRef.current.setPosition({ lineNumber: target, column: 1 });
        editorRef.current.focus();
    });

    useTabScopedCommand(DOM_EVENT.JUMP_TO_LINE_ACTION, tabId, detail => {
        const line = Number(detail?.line || 0);
        if (!line || !editorRef.current) return;
        editorRef.current.revealLineInCenter(line);
        editorRef.current.setPosition({ lineNumber: line, column: 1 });
        editorRef.current.focus();
    });

    useEffect(() => {
        return onCommand(DOM_EVENT.FOCUS_ACTIVE_EDITOR, () => {
            if (!isActiveRef.current) return;
            editorRef.current?.focus();
        });
    }, []);

    useEffect(() => {
        const handleCtrlI = (e: KeyboardEvent) => {
            if (!isActiveRef.current) return;
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
                editorRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handleCtrlI);
        return () => window.removeEventListener('keydown', handleCtrlI);
    }, []);

    // Fires after mount and whenever the font family/size changes; the
    // helper waits for the webfont itself, so the caret can't drift from the
    // painted glyphs (see editorFontMetrics.ts).
    const editorFontFamily = MONO_FONT_PRESETS[monoFamily] ?? MONO_FONT_PRESETS.cascadia;
    const [editorMounted, setEditorMounted] = React.useState(false);
    const [editorInstance, setEditorInstance] =
        React.useState<MonacoEditor.IStandaloneCodeEditor | null>(null);
    const selectionInfo = useEditorSelectionInfo(editorInstance);
    // A colour change made in Settings must show without focusing the editor.
    useEditorRepaint(editorInstance, isActive, sqlEditorStyle, monacoTheme, resolvedAppearance);
    useEffect(() => {
        const monacoInstance = monacoRef.current;
        if (!editorMounted || !monacoInstance) return;
        return syncEditorFontMetrics(monacoInstance, editorFontFamily, fontSize);
    }, [editorFontFamily, editorMounted, fontSize]);

    const editorOptions = {
        automaticLayout: true,
        minimap: { enabled: minimap },
        glyphMargin: false,
        lineNumbersMinChars: ULTRA_COMPACT_GUTTER.lineNumbersMinChars,
        lineDecorationsWidth: ULTRA_COMPACT_GUTTER.lineDecorationsWidth,
        fontSize: fontSize,
        fontFamily: editorFontFamily,
        lineHeight: fontSize * 1.5,
        scrollBeyondLastLine: false,
        // Animates wheel/keyboard scrolling instead of snapping a notch at a time.
        smoothScrolling: true,
        wordWrap: 'on' as const,
        tabSize: 2,
        wordBasedSuggestions: 'off' as const,
        suggestOnTriggerCharacters: true,
        quickSuggestions: {
            other: true,
            comments: false,
            strings: false,
        },
        // Monaco's default treats word-separator keys (space included) as
        // "commit characters" that accept the highlighted suggestion instead
        // of inserting the literal character. With the SQL suggest widget
        // staying open while typing (quickSuggestions/suggestOnTriggerCharacters
        // above), this made Space silently re-commit the current word/keyword
        // instead of adding a space — e.g. typing "GROUP BY" then Space did
        // nothing visible. Disable commit-on-punctuation; Tab/Enter/click still
        // accept a suggestion normally.
        acceptSuggestionOnCommitCharacter: false,
        editContext: false,
        readOnly: Boolean(readOnly),
        fixedOverflowWidgets: true,
        scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
        },
    };

    const resizeHandleClassName =
        'w-1 shrink-0 cursor-col-resize transition-colors hover:bg-accent/40 active:bg-accent/60';

    const editorShellClassName = cn(
        'flex min-h-0 overflow-hidden',
        editorFocusMode ? 'h-full shrink-0' : 'flex-1 min-w-0',
    );

    const editorSurfaceClassName = cn(
        'min-h-0 rounded-none',
        editorFocusMode ? 'h-full shrink-0' : 'flex-1 min-w-0',
    );

    return (
        <div
            className='zentro-sql-editor flex h-full flex-row overflow-hidden'
            style={
                {
                    '--zentro-editor-font-size': `${fontSize}px`,
                    '--zentro-editor-line-height': `${fontSize * 1.5}px`,
                } as React.CSSProperties
            }
        >
            <div className='flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'>
                <div
                    className={cn(
                        'flex flex-1 min-h-0 min-w-0 overflow-hidden',
                        editorFocusMode && 'justify-center shadow',
                    )}
                >
                    {editorFocusMode && <div className='flex-1' />}
                    {editorFocusMode && (
                        <div
                            className={resizeHandleClassName}
                            onMouseDown={e => startDrag(e, 'left')}
                        />
                    )}
                    <div className={editorShellClassName}>
                        <EditorToolbar isActive={isActive} tabId={tabId} readOnly={readOnly} />
                        <div
                            ref={editorContainerRef}
                            className={editorSurfaceClassName}
                            style={editorFocusMode ? { width: editorFocusWidth } : undefined}
                        >
                            <Editor
                                height='100%'
                                defaultLanguage='sql'
                                theme={monacoTheme}
                                defaultValue={valueRef.current}
                                className='overflow-hidden'
                                onChange={v => {
                                    if (applyingExternalValueRef.current) return;
                                    if (!readOnly) scheduleChange(v ?? '');
                                }}
                                onMount={handleMount}
                                options={editorOptions}
                            />
                        </div>
                    </div>
                    {editorFocusMode && (
                        <div
                            className={resizeHandleClassName}
                            onMouseDown={e => startDrag(e, 'right')}
                        />
                    )}
                    {editorFocusMode && <div className='flex-1' />}
                </div>
                <EditorStatusStrip info={selectionInfo} />
            </div>
        </div>
    );
};
