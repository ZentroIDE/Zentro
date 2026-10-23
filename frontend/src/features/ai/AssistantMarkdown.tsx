// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '../../components/ui';
import { highlightCode } from './highlightCode';
import { useMonacoTheme } from '../../lib/theme';
import { useSettingsStore } from '../../stores/settingsStore';

interface AssistantMarkdownProps {
    text: string;
    onOpenSql: (sql: string, run: boolean) => void;
    runLabel: string;
}

function codeText(children: React.ReactNode): string {
    return String(children).replace(/\n$/, '');
}

function isSqlFence(className: string | undefined, text: string): boolean {
    const lang = /language-([a-z0-9+-]+)/i.exec(className || '')?.[1] || '';
    if (lang === 'sql') return true;
    if (lang !== '') return false;
    return /^\s*(with|select|insert|update|delete|merge|create|alter|drop|truncate|explain|declare|begin)\b/i.test(
        text,
    );
}

// HighlightedCode shows plain text first, then swaps in the editor's colored
// markup. It colors again when the theme or the SQL colors change, because the
// markup refers to theme colors by class. Unknown languages stay plain.
function HighlightedCode({ code, lang }: { code: string; lang: string }) {
    const [html, setHtml] = React.useState<string | null>(null);
    const theme = useSettingsStore(state => state.theme);
    const sqlEditorStyle = useSettingsStore(state => state.sqlEditorStyle);
    const monacoTheme = useMonacoTheme(theme);

    React.useEffect(() => {
        let alive = true;
        void highlightCode(code, lang, monacoTheme).then(result => {
            if (alive) setHtml(result);
        });
        return () => {
            alive = false;
        };
    }, [code, lang, monacoTheme, sqlEditorStyle]);

    if (html) {
        return (
            <div
                className='overflow-x-auto p-2 font-mono ui-text-code leading-normal whitespace-nowrap'
                dangerouslySetInnerHTML={{ __html: html }}
            />
        );
    }
    return (
        <pre className='overflow-x-auto p-2'>
            <code className='font-mono ui-text-code'>{code}</code>
        </pre>
    );
}

function AssistantMarkdownView({ text, onOpenSql, runLabel }: AssistantMarkdownProps) {
    return (
        <div className='min-w-0 max-w-full text-small leading-relaxed wrap-break-word'>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    p: ({ children }) => <p className='mb-2 last:mb-0'>{children}</p>,
                    ul: ({ children }) => (
                        <ul className='mb-2 list-disc space-y-1 pl-5 last:mb-0'>{children}</ul>
                    ),
                    ol: ({ children }) => (
                        <ol className='mb-2 list-decimal space-y-1 pl-5 last:mb-0'>{children}</ol>
                    ),
                    li: ({ children }) => <li>{children}</li>,
                    table: ({ children }) => (
                        <div className='mb-2 overflow-x-auto last:mb-0'>
                            <table className='w-full border-collapse text-label'>{children}</table>
                        </div>
                    ),
                    th: ({ children }) => (
                        <th className='border border-border bg-muted px-2 py-1 text-left font-semibold'>
                            {children}
                        </th>
                    ),
                    td: ({ children }) => (
                        <td className='border border-border px-2 py-1 align-top'>{children}</td>
                    ),
                    strong: ({ children }) => (
                        <strong className='font-semibold text-foreground'>{children}</strong>
                    ),
                    code: ({ className, children }) => {
                        const textValue = codeText(children);
                        const block = Boolean(className) || textValue.includes('\n');
                        if (!block) {
                            return (
                                <code className='rounded-md bg-muted px-1 py-0.5 font-mono text-label'>
                                    {textValue}
                                </code>
                            );
                        }
                        const sql = isSqlFence(className, textValue);
                        return (
                            <div className='mb-2 w-full max-w-full overflow-hidden rounded-md border border-border bg-card last:mb-0'>
                                <div className='flex items-center gap-0.5 border-b border-border py-0.5 pr-1 pl-2.5'>
                                    <span className='flex-1 text-label text-muted-foreground'>
                                        {sql
                                            ? 'sql'
                                            : className?.replace('language-', '') || 'code'}
                                    </span>
                                    <Button
                                        type='button'
                                        size='micro'
                                        variant='default'
                                        onClick={() => {
                                            void navigator.clipboard.writeText(textValue);
                                        }}
                                    >
                                        Copy
                                    </Button>
                                    {sql && (
                                        <>
                                            <Button
                                                type='button'
                                                size='micro'
                                                variant='ghost'
                                                onClick={() => onOpenSql(textValue, false)}
                                            >
                                                Open tab
                                            </Button>
                                            <Button
                                                type='button'
                                                size='micro'
                                                variant='ghost'
                                                onClick={() => onOpenSql(textValue, true)}
                                            >
                                                {runLabel}
                                            </Button>
                                        </>
                                    )}
                                </div>
                                <HighlightedCode
                                    code={textValue}
                                    lang={
                                        /language-([a-z0-9+-]+)/i.exec(className || '')?.[1] ||
                                        (sql ? 'sql' : '')
                                    }
                                />
                            </div>
                        );
                    },
                    pre: ({ children }) => <>{children}</>,
                }}
            >
                {text}
            </ReactMarkdown>
        </div>
    );
}

// Memoized: a finished message does not change, so it should not parse its
// Markdown again when something else on the panel renders.
export const AssistantMarkdown = React.memo(AssistantMarkdownView);
