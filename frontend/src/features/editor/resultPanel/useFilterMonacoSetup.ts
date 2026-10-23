// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { OnMount } from '@monaco-editor/react';

import {
    createResultFilterModelPath,
    registerResultFilterCompletion,
} from '../../../lib/monaco/resultFilterCompletion';
import { useConnectionStore } from '../../../stores/connectionStore';
import { useSchemaStore, type SchemaNode } from '../../../stores/schemaStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import { useMonacoTheme } from '../../../lib/theme';

// Stable empty-array reference so the useSchemaStore selector below never
// returns a fresh array identity when there's no schema for this connection
// yet — returning a new `[]` each call would make Zustand's snapshot
// comparison always see a "change" and infinite-loop the render.
const EMPTY_SCHEMAS: SchemaNode[] = [];

interface UseFilterMonacoSetupArgs {
    baseQuery?: string;
    completionColumns: string[];
    normalizeFilterInput: (raw: string) => string;
    onChange: (value: string) => void;
    onClear: () => void;
    onRun: (currentValue?: string, currentOrderBy?: string) => void;
    orderValue: string;
    tableName?: string;
    /** Current filter text. Only ever pushed into the model when it did not
     *  originate from this editor's own typing — see applyExternalValue below. */
    value: string;
}

export function useFilterMonacoSetup({
    baseQuery,
    completionColumns,
    normalizeFilterInput,
    onChange,
    onClear,
    onRun,
    orderValue,
    tableName,
    value,
}: UseFilterMonacoSetupArgs) {
    const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
    const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
    const completionDisposableRef = useRef<{ dispose: () => void } | null>(null);
    const editorInstanceKey = useRef(`result-filter-${Math.random().toString(36).slice(2)}`);
    const focusContextKey = useRef(`isResultFilterFocused_${Math.random().toString(36).slice(2)}`);

    const onRunRef = useRef(onRun);
    const onClearRef = useRef(onClear);
    const onChangeRef = useRef(onChange);
    const orderValueRef = useRef(orderValue);

    // The editor mounts uncontrolled (defaultValue, not value): feeding Monaco
    // a controlled `value` that gets re-derived from this component's own
    // onChange — round-tripped through the result store + tab context on every
    // keystroke — lets @monaco-editor/react's controlled-value diffing race its
    // own emission and reset the model out from under in-flight typing, which
    // is what stranded the caret and desynced the selection highlight from the
    // real text (see MonacoEditor.tsx's identical fix for the main editor).
    // Only genuinely external writes (Escape-to-clear, a pasted multi-line
    // value getting normalized, a filter set from elsewhere) get pushed in via
    // applyExternalValue below; anything this editor emitted itself is skipped.
    const lastEmittedValueRef = useRef(value);
    const applyingExternalValueRef = useRef(false);

    const { theme } = useSettingsStore();
    const monacoTheme = useMonacoTheme(theme);
    const activeProfile = useConnectionStore(state => state.activeProfile);
    const driver = activeProfile?.driver || '';
    const profileKey = activeProfile?.name ?? '';
    const dbName = activeProfile?.db_name ?? '';
    // Only re-register the completion provider when THIS connection's schema
    // slice changes — depending on the full `trees` map would tear down and
    // rebuild the provider (mid-navigation, if the suggest widget happens to
    // be open) whenever any OTHER connection's schema refreshes anywhere in
    // the app.
    const activeSchemas = useSchemaStore(state => {
        if (!profileKey || !dbName) return EMPTY_SCHEMAS;
        return state.trees[`${profileKey}:${dbName}`] || EMPTY_SCHEMAS;
    });

    useEffect(() => {
        onRunRef.current = onRun;
    }, [onRun]);

    useEffect(() => {
        onClearRef.current = onClear;
    }, [onClear]);

    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => {
        orderValueRef.current = orderValue;
    }, [orderValue]);

    const runNow = useCallback((nextFilterRaw: string, nextOrderRaw: string) => {
        const nextFilter = nextFilterRaw.trim();
        const nextOrder = nextOrderRaw.trim();
        if (!nextFilter && !nextOrder) {
            onClearRef.current();
            return;
        }
        onRunRef.current(nextFilterRaw, nextOrderRaw);
    }, []);

    const emitChange = useCallback((next: string) => {
        lastEmittedValueRef.current = next;
        onChangeRef.current(next);
    }, []);

    // Pushes a write that did not come from this editor's own typing into the
    // model, e.g. Escape-to-clear or a filter set programmatically elsewhere.
    // Anything we just emitted ourselves is skipped via lastEmittedValueRef —
    // re-applying it is exactly what corrupted in-flight typing.
    const applyExternalValue = useCallback((next: string) => {
        const editor = editorRef.current;
        const model = editor?.getModel();
        if (!editor || !model) return;
        if (next === model.getValue()) return;
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
        lastEmittedValueRef.current = value;
        applyExternalValue(value);
    }, [applyExternalValue, value]);

    const handleEditorChange = useCallback(
        (raw: string) => {
            if (applyingExternalValueRef.current) return;
            const normalized = normalizeFilterInput(raw);
            emitChange(normalized);
            // e.g. a multi-line paste: reflect the normalized text back since
            // nothing else will now that the editor is uncontrolled.
            if (normalized !== raw) applyExternalValue(normalized);
        },
        [applyExternalValue, emitChange, normalizeFilterInput],
    );

    const modelPath = useMemo(() => {
        const suffix = tableName ? tableName.replace(/[^a-zA-Z0-9_-]/g, '_') : 'result';
        return createResultFilterModelPath(`${editorInstanceKey.current}-${suffix}`);
    }, [tableName]);

    const registerCompletion = useCallback(() => {
        const monaco = monacoRef.current;
        if (!monaco) return;
        completionDisposableRef.current?.dispose();
        completionDisposableRef.current = registerResultFilterCompletion({
            monaco,
            modelPath,
            columns: completionColumns,
            driver,
            baseQuery,
            schemas: activeSchemas,
            fetchColumns: (schemaName, nextTableName) =>
                useSchemaStore
                    .getState()
                    .checkAndFetchColumns(profileKey, dbName, schemaName, nextTableName),
        });
    }, [activeSchemas, baseQuery, completionColumns, dbName, driver, modelPath, profileKey]);

    useEffect(() => {
        registerCompletion();
        return () => {
            completionDisposableRef.current?.dispose();
            completionDisposableRef.current = null;
        };
    }, [registerCompletion]);

    useEffect(() => {
        return () => {
            completionDisposableRef.current?.dispose();
            completionDisposableRef.current = null;
            const monaco = monacoRef.current;
            if (monaco) {
                try {
                    const uri = monaco.Uri.parse(modelPath);
                    monaco.editor.getModel(uri)?.dispose();
                } catch {
                    // ignore - model may already be gone
                }
            }
            // Do not dispose the editor here — @monaco-editor/react owns the editor
            // lifecycle and calls setModel() after this cleanup when the path prop
            // changes, which throws "InstantiationService has been disposed" if we
            // already called dispose() on the instance.
        };
    }, [modelPath]);

    const handleMonacoMount: OnMount = useCallback(
        (editor, monaco) => {
            editorRef.current = editor;
            monacoRef.current = monaco;
            registerCompletion();

            const filterEditorFocusContext = editor.createContextKey<boolean>(
                focusContextKey.current,
                false,
            );

            editor.onDidFocusEditorWidget(() => {
                filterEditorFocusContext.set(true);
            });

            editor.onDidBlurEditorWidget(() => {
                filterEditorFocusContext.set(false);
            });

            editor.onDidDispose(() => {
                filterEditorFocusContext.set(false);
            });

            editor.addCommand(
                monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space,
                () => {
                    void editor.trigger('result-filter', 'editor.action.triggerSuggest', {});
                },
                focusContextKey.current,
            );

            editor.addCommand(
                monaco.KeyCode.Escape,
                () => {
                    onClearRef.current();
                },
                '!suggestWidgetVisible',
            );

            editor.onKeyDown(event => {
                if (event.keyCode !== monaco.KeyCode.Enter) return;
                if (event.ctrlKey || event.metaKey || event.altKey) return;

                const editorDomNode = editor.getDomNode();
                const suggestVisible = Boolean(
                    editorDomNode?.querySelector('.suggest-widget.visible'),
                );
                if (suggestVisible) return;

                event.preventDefault();
                event.stopPropagation();
                const currentValue = normalizeFilterInput(editor.getValue());
                const nextValue = currentValue.trim();
                emitChange(currentValue);
                const nextOrder = orderValueRef.current.trim();
                if (!nextValue && !nextOrder) {
                    onClearRef.current();
                    return;
                }
                runNow(currentValue, orderValueRef.current);
            });
        },
        [emitChange, normalizeFilterInput, registerCompletion, runNow],
    );

    return {
        handleMonacoMount,
        handleEditorChange,
        modelPath,
        monacoTheme,
    };
}
