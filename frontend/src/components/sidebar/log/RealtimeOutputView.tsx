// SPDX-License-Identifier: GPL-3.0-only

import React, { useEffect, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { registerLogLanguages } from './logHighlight';
import type { editor } from 'monaco-editor';
import { Radio, Pause, Play, Trash2, Clock } from 'lucide-react';
import { useLogStore, type RealtimeLogEvent } from '../../../stores/logStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import { cn } from '../../../lib/cn';
import { Button } from '../../ui';
import { useMonacoTheme } from '../../../lib/theme';

const KIND_LABEL: Record<RealtimeLogEvent['kind'], string> = {
    'connection.changed': 'CONNECTION ',
    'query.started': 'QUERY      ',
    'query.done': 'QUERY      ',
    'query.chunk': 'QUERY      ',
    'schema.loaded': 'SCHEMA     ',
    'schema.error': 'SCHEMA     ',
    'tx.status': 'TRANSACTION',
};

function toLocalISOString(ts: number): string {
    const d = new Date(ts);
    const p = (n: number, len = 2) => String(n).padStart(len, '0');
    const offsetMin = -d.getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const absMin = Math.abs(offsetMin);
    const tz = `${sign}${p(Math.floor(absMin / 60))}:${p(absMin % 60)}`;
    return (
        `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
        `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
        `.${p(d.getMilliseconds(), 3)}${tz}`
    );
}

function formatEvent(e: RealtimeLogEvent, showTs: boolean): string {
    const kind = KIND_LABEL[e.kind] ?? e.kind.toUpperCase().padEnd(11);
    const prefix = showTs ? `${toLocalISOString(e.ts)}  ${kind}  ` : `${kind}  `;
    const indent = ' '.repeat(prefix.length);
    const rawMsg = e.message.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // For query.started: put the SQL on a new indented line after "Query started [X/Y]"
    if (e.kind === 'query.started') {
        const m = rawMsg.match(/^(Query started \[\d+\/\d+\])(?: ([\s\S]*))?$/);
        if (m?.[2]) {
            const sqlLines = m[2].split('\n').map(l => indent + '    ' + l);
            return prefix + m[1] + '\n' + sqlLines.join('\n');
        }
    }

    const lines = rawMsg.split('\n');
    const message =
        lines.length > 1
            ? lines[0] +
              '\n' +
              lines
                  .slice(1)
                  .map(l => indent + l)
                  .join('\n')
            : lines[0];
    return prefix + message;
}

export const RealtimeOutputView: React.FC = () => {
    const events = useLogStore(s => s.events);
    const paused = useLogStore(s => s.paused);
    const setPaused = useLogStore(s => s.setPaused);
    const clearEvents = useLogStore(s => s.clearEvents);
    const { theme } = useSettingsStore();
    const monacoTheme = useMonacoTheme(theme);
    const [showTimestamp, setShowTimestamp] = React.useState(true);

    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const isAtBottomRef = useRef(true);
    const renderedCountRef = useRef(0);

    const handleMount: OnMount = ed => {
        editorRef.current = ed;

        // Render events that arrived before Monaco mounted (empty→Monaco transition)
        const pending = useLogStore.getState().events;
        if (pending.length > renderedCountRef.current) {
            const text = pending.map(e => formatEvent(e, showTimestamp)).join('\n');
            ed.getModel()?.setValue(text);
            renderedCountRef.current = pending.length;
            ed.revealLine(ed.getModel()?.getLineCount() ?? 1);
        }

        ed.onDidScrollChange(() => {
            const scrollTop = ed.getScrollTop();
            const scrollHeight = ed.getScrollHeight();
            const layoutHeight = ed.getLayoutInfo().height;
            isAtBottomRef.current = scrollHeight - scrollTop - layoutHeight < 40;
        });
    };

    // Append new events incrementally
    useEffect(() => {
        const ed = editorRef.current;
        if (!ed || paused) return;
        const model = ed.getModel();
        if (!model) return;

        const newEvents = events.slice(renderedCountRef.current);
        if (newEvents.length === 0) return;

        const newLines = newEvents.map(e => formatEvent(e, showTimestamp)).join('\n');
        const lineCount = model.getLineCount();
        const lastLineLen = model.getLineLength(lineCount);
        const prefix = lastLineLen > 0 ? '\n' : '';
        model.applyEdits([
            {
                range: {
                    startLineNumber: lineCount,
                    startColumn: lastLineLen + 1,
                    endLineNumber: lineCount,
                    endColumn: lastLineLen + 1,
                },
                text: prefix + newLines,
            },
        ]);
        renderedCountRef.current = events.length;
        if (isAtBottomRef.current) ed.revealLine(model.getLineCount());
    }, [events, paused, showTimestamp]);

    // When unpausing: flush events accumulated while paused
    useEffect(() => {
        if (paused) return;
        const ed = editorRef.current;
        if (!ed) return;
        const model = ed.getModel();
        if (!model) return;
        const missed = events.slice(renderedCountRef.current);
        if (missed.length === 0) return;
        const newLines = missed.map(e => formatEvent(e, showTimestamp)).join('\n');
        const lineCount = model.getLineCount();
        const lastLineLen = model.getLineLength(lineCount);
        model.applyEdits([
            {
                range: {
                    startLineNumber: lineCount,
                    startColumn: lastLineLen + 1,
                    endLineNumber: lineCount,
                    endColumn: lastLineLen + 1,
                },
                text: (lastLineLen > 0 ? '\n' : '') + newLines,
            },
        ]);
        renderedCountRef.current = events.length;
        ed.revealLine(model.getLineCount());
    }, [paused]); // eslint-disable-line react-hooks/exhaustive-deps

    // Re-render all events when timestamp toggle changes
    useEffect(() => {
        const ed = editorRef.current;
        if (!ed) return;
        const model = ed.getModel();
        if (!model) return;
        const text = events.map(e => formatEvent(e, showTimestamp)).join('\n');
        model.setValue(text);
        renderedCountRef.current = events.length;
    }, [showTimestamp]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleClear = () => {
        clearEvents();
        renderedCountRef.current = 0;
        editorRef.current?.getModel()?.setValue('');
    };

    const toolbar = (
        <div className='flex items-center justify-end gap-1.5 px-2 py-1 shrink-0 border-b border-border/30'>
            <Button
                type='button'
                variant='ghost'
                size='icon'
                onClick={() => setShowTimestamp(v => !v)}
                title={showTimestamp ? 'Hide timestamp' : 'Show timestamp'}
                className={cn(!showTimestamp && 'text-muted-foreground/40')}
            >
                <Clock size={11} />
            </Button>
            <Button
                type='button'
                variant='ghost'
                size='icon'
                tone={paused ? 'warning' : 'default'}
                title={paused ? 'Resume' : 'Pause'}
                onClick={() => setPaused(!paused)}
            >
                {paused ? <Play size={11} /> : <Pause size={11} />}
            </Button>
            <Button
                type='button'
                variant='ghost'
                tone={'destructive'}
                size='icon'
                title='Clear'
                onClick={handleClear}
            >
                <Trash2 size={11} />
            </Button>
        </div>
    );

    if (events.length === 0 && renderedCountRef.current === 0) {
        return (
            <div className='flex flex-col h-full overflow-hidden'>
                {toolbar}
                <div className='flex flex-col items-center gap-2 px-4 py-8 text-muted-foreground text-small'>
                    <Radio size={24} className='opacity-30' />
                    <p className='m-0'>Waiting for events…</p>
                </div>
            </div>
        );
    }

    return (
        <div className='flex flex-col h-full overflow-hidden'>
            {toolbar}
            <div className='flex-1 overflow-hidden'>
                <Editor
                    height='100%'
                    language='rtlog'
                    defaultValue=''
                    theme={monacoTheme}
                    beforeMount={registerLogLanguages}
                    onMount={handleMount}
                    options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        lineNumbers: 'off',
                        lineDecorationsWidth: 0,
                        scrollBeyondLastLine: false,
                        wordWrap: 'off',
                        automaticLayout: true,
                        fontSize: 11,
                        fontFamily: 'var(--font-mono, monospace)',
                        scrollbar: {
                            verticalScrollbarSize: 6,
                            horizontalScrollbarSize: 6,
                        },
                        overviewRulerLanes: 0,
                        hideCursorInOverviewRuler: true,
                        overviewRulerBorder: false,
                        renderLineHighlight: 'none',
                        contextmenu: true,
                        quickSuggestions: false,
                        suggestOnTriggerCharacters: false,
                        parameterHints: { enabled: false },
                        folding: false,
                        glyphMargin: false,
                        guides: { indentation: false },
                    }}
                />
            </div>
        </div>
    );
};
