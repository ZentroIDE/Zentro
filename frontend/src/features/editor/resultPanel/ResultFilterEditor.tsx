// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';

interface ResultFilterEditorProps {
    modelPath: string;
    monacoTheme: string;
    onMount: OnMount;
    value: string;
    onChange: (value: string) => void;
}

export const ResultFilterEditor: React.FC<ResultFilterEditorProps> = React.memo(
    ({ modelPath, monacoTheme, onMount, value, onChange }) => (
        <Editor
            path={modelPath}
            theme={monacoTheme}
            defaultLanguage='sql'
            // Uncontrolled: `value` seeds a brand-new model only. Feeding it in
            // as a controlled prop let @monaco-editor/react's own value-diffing
            // race the onChange this component just emitted and reset the
            // model mid-keystroke — the caret and the selection highlight would
            // then disagree with the real text. Genuinely external writes
            // (Escape-to-clear, a pasted multi-line value) are instead pushed
            // in explicitly by useFilterMonacoSetup's applyExternalValue.
            defaultValue={value}
            onMount={onMount}
            onChange={next => onChange(next ?? '')}
            options={{
                placeholder: 'Filter expression (WHERE clause). Esc to clear, Enter to run.',
                automaticLayout: true,
                minimap: { enabled: false },
                codeLens: false,
                glyphMargin: false,
                lineNumbers: 'off',
                folding: false,
                lineDecorationsWidth: 0,
                lineNumbersMinChars: 0,
                renderLineHighlight: 'none',
                overviewRulerLanes: 0,
                overviewRulerBorder: false,
                hideCursorInOverviewRuler: true,
                wordWrap: 'off',
                scrollBeyondLastLine: false,
                contextmenu: true,
                fontSize: 11,
                lineHeight: 28,
                fontFamily: 'var(--font-mono, monospace)',
                quickSuggestions: {
                    other: true,
                    comments: false,
                    strings: false,
                },
                wordBasedSuggestions: 'off',
                suggestOnTriggerCharacters: true,
                // See MonacoEditor.tsx — without this, Space commits the
                // highlighted suggestion instead of inserting a literal space.
                acceptSuggestionOnCommitCharacter: false,
                editContext: false,
                acceptSuggestionOnEnter: 'on',
                tabCompletion: 'on',
                scrollbar: {
                    vertical: 'hidden',
                    verticalScrollbarSize: 0,
                    horizontal: 'auto',
                    horizontalScrollbarSize: 6,
                    handleMouseWheel: true,
                },
                padding: { top: 0, bottom: 0 },
            }}
        />
    ),
);

ResultFilterEditor.displayName = 'ResultFilterEditor';
