// SPDX-License-Identifier: GPL-3.0-only

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { Terminal, RefreshCw, Clock } from 'lucide-react';
import type { app } from '../../../../wailsjs/go/models';
import { getApiGateway } from '../../../platform/apiGatewayRuntime';
import { useProjectStore } from '../../../stores/projectStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import { cn } from '../../../lib/cn';
import { Button } from '../../ui';
import { registerLogLanguages } from './logHighlight';
import { useMonacoTheme } from '../../../lib/theme';

const LEVEL_PAD = 5;

function formatEntry(e: app.AppDebugLogEntry, showTs: boolean): string {
    const level = (e.level ?? '').padEnd(LEVEL_PAD);
    const extra = e.extra && Object.keys(e.extra).length > 0 ? '  ' + JSON.stringify(e.extra) : '';
    return showTs ? `${e.time} ${level} ${e.msg}${extra}` : `${level} ${e.msg}${extra}`;
}

export const AppDebugLogView: React.FC = () => {
    const [entries, setEntries] = useState<app.AppDebugLogEntry[]>([]);
    const [logPath, setLogPath] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [showTimestamp, setShowTimestamp] = useState(true);
    const activeProjectId = useProjectStore(s => s.activeProject?.id);
    const { theme } = useSettingsStore();
    const monacoTheme = useMonacoTheme(theme);
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        const [logResult, pathResult] = await Promise.all([
            getApiGateway().audit.getAppDebugLog({
                lines_from_end: 500,
                min_level: '',
                search: '',
            }),
            getApiGateway().audit.getAppDebugLogPath(),
        ]);
        if (logResult.ok) setEntries(logResult.data ?? []);
        if (pathResult.ok) setLogPath(pathResult.data ?? '');
        setLoading(false);
    }, [activeProjectId]);

    useEffect(() => {
        load();
    }, [load]);

    const content = entries.map(e => formatEntry(e, showTimestamp)).join('\n');

    const handleMount: OnMount = ed => {
        editorRef.current = ed;
        // scroll to bottom on initial load
        const model = ed.getModel();
        if (model) ed.revealLine(model.getLineCount());
    };

    // When entries refresh, scroll to bottom
    useEffect(() => {
        const ed = editorRef.current;
        if (!ed) return;
        const model = ed.getModel();
        if (model) ed.revealLine(model.getLineCount());
    }, [entries]);

    return (
        <div className='flex flex-col h-full overflow-hidden'>
            <div className='flex items-center justify-between gap-1.5 py-1 shrink-0 border-b border-border'>
                <Button
                    type='button'
                    variant='link'
                    size='sm'
                    title={logPath ? `Open in explorer: ${logPath}` : ''}
                    disabled={!logPath}
                    onClick={() =>
                        logPath &&
                        getApiGateway()
                            .project.openDirectoryInExplorer(logPath)
                            .then(result => {
                                if (!result.ok) console.error(result.error.message);
                            })
                    }
                >
                    {logPath || '—'}
                </Button>
                <div className=''>
                    <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        onClick={() => setShowTimestamp(v => !v)}
                        title={showTimestamp ? 'Hide timestamp' : 'Show timestamp'}
                        className={cn(!showTimestamp && 'text-muted-foreground/40')}
                    >
                        <Clock size={12} />
                    </Button>
                    <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        onClick={load}
                        disabled={loading}
                        title='Refresh'
                    >
                        <RefreshCw size={12} className={cn(loading && 'animate-spin')} />
                    </Button>
                </div>
            </div>

            {entries.length === 0 ? (
                <div className='flex flex-col items-center gap-2 px-4 py-8 text-muted-foreground text-small'>
                    <Terminal size={24} className='opacity-30' />
                    <p className='m-0'>No log entries</p>
                </div>
            ) : (
                <div className='flex-1 overflow-hidden'>
                    <Editor
                        height='100%'
                        language='applog'
                        value={content}
                        theme={monacoTheme}
                        beforeMount={registerLogLanguages}
                        onMount={handleMount}
                        options={{
                            readOnly: true,
                            minimap: { enabled: false },
                            lineNumbers: 'off',
                            lineNumbersMinChars: 3,
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
                            renderLineHighlight: 'line',
                            contextmenu: true,
                            quickSuggestions: false,
                            suggestOnTriggerCharacters: false,
                            parameterHints: { enabled: false },
                            folding: false,
                            glyphMargin: false,
                        }}
                    />
                </div>
            )}
        </div>
    );
};
