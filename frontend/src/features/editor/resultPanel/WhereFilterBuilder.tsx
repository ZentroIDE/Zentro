// SPDX-License-Identifier: GPL-3.0-only

import React, { useRef, useEffect, useCallback } from 'react';
import { Copy, ExternalLink, PlusSquare } from 'lucide-react';

import { cn } from '../../../lib/cn';
import { buildFilterOrderQuery } from '../../../lib/queryBuilder';
import { setClipboardText } from '../../../services/clipboardService';
import { Button } from '../../../components/ui';
import { useToast } from '../../../components/layout/Toast';
import { ResultFilterEditor } from './ResultFilterEditor';
import { useFilterMonacoSetup } from './useFilterMonacoSetup';

interface WhereFilterBuilderProps {
    /** Current WHERE expression text (e.g. "id = 1"). */
    value: string;
    onChange: (v: string) => void;
    onRun: (currentValue?: string, currentOrderBy?: string) => void;
    onClear: () => void;
    baseQuery?: string;
    /**
     * Current serialised ORDER BY expression — read-only here, used only to
     * render the combined query preview in the hover tooltip. OrderByBuilder
     * owns mutating it.
     */
    orderValue: string;
    onAppendToQuery?: (fullQuery: string) => void;
    onOpenInNewTab?: (fullQuery: string) => void;
    /** Column names + SELECT aliases available for completion. */
    completionColumns: string[];
    tableName?: string;
}

/**
 * WHERE half of the ResultFilterBar. Owns the Monaco filter editor + the
 * hover tooltip that previews/copies/appends the combined query.
 *
 * Mirrors OrderByBuilder.tsx: parent owns the actual filter value and
 * combined-query concerns that span both halves (e.g. ORDER BY's
 * "run with current filter" needs the live WHERE text), this component only
 * owns WHERE-specific input/editor state.
 */
export const WhereFilterBuilder: React.FC<WhereFilterBuilderProps> = React.memo(
    ({
        value,
        onChange,
        onRun,
        onClear,
        baseQuery,
        orderValue,
        onAppendToQuery,
        onOpenInNewTab,
        completionColumns,
        tableName,
    }) => {
        const normalizeFilterInput = useCallback((raw: string) => raw.replace(/[\r\n]+/g, ' '), []);
        const tooltipTimeout = useRef<number>();
        const [showTooltip, setShowTooltip] = React.useState(false);
        const { toast } = useToast();

        useEffect(
            () => () => {
                if (tooltipTimeout.current) {
                    window.clearTimeout(tooltipTimeout.current);
                    tooltipTimeout.current = undefined;
                }
            },
            [],
        );

        const { handleMonacoMount, handleEditorChange, modelPath, monacoTheme } =
            useFilterMonacoSetup({
                baseQuery,
                completionColumns,
                normalizeFilterInput,
                onChange,
                onClear,
                onRun,
                orderValue,
                tableName,
                value,
            });

        const iconBtn = cn(
            'flex items-center justify-center p-1 border border-transparent rounded-md',
            'text-muted-foreground ui-interactive-surface',
            'transition-colors cursor-pointer shrink-0',
        );

        const renderQueryPreview = (query: string) =>
            buildFilterOrderQuery(query, value, orderValue);

        return (
            <>
                <div
                    className='relative h-full flex items-center'
                    onMouseEnter={() => {
                        tooltipTimeout.current && clearTimeout(tooltipTimeout.current);
                        setShowTooltip(true);
                    }}
                    onMouseLeave={() => {
                        if (tooltipTimeout.current) {
                            window.clearTimeout(tooltipTimeout.current);
                        }
                        tooltipTimeout.current = setTimeout(() => setShowTooltip(false), 200);
                    }}
                >
                    <span className='h-7 text-label uppercase cursor-pointer font-semibold text-muted-foreground tracking-wide shrink-0 select-none transition-colors p-1 px-1.5 flex items-center bg-muted ui-interactive-surface'>
                        WHERE
                    </span>

                    {showTooltip && baseQuery && (
                        <div className='group min-h-40 absolute top-full left-0 z-panel-overlay mt-2 w-120 overflow-hidden rounded-md bg-card shadow-2xl border border-border/50 animate-in fade-in zoom-in-95 duration-100'>
                            <div className='absolute right-2 top-2 z-10 flex flex-col items-center gap-0.5 rounded-md bg-background/95 p-0.5 opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto'>
                                <Button
                                    type='button'
                                    variant='ghost'
                                    size='icon'
                                    className={iconBtn}
                                    title='Copy query'
                                    onClick={() => {
                                        void setClipboardText(
                                            buildFilterOrderQuery(baseQuery, value, orderValue),
                                        )
                                            .then(() => toast.success('Query copied to clipboard'))
                                            .catch(() => toast.error('Failed to copy query'));
                                    }}
                                >
                                    <Copy size={12} />
                                </Button>

                                {onAppendToQuery && (
                                    <Button
                                        type='button'
                                        variant='ghost'
                                        size='icon'
                                        className={cn(
                                            iconBtn,
                                            'text-success ui-interactive-ghost-success',
                                        )}
                                        title='Append to current tab (last line)'
                                        onClick={() => {
                                            onAppendToQuery(
                                                buildFilterOrderQuery(baseQuery, value, orderValue),
                                            );
                                            setShowTooltip(false);
                                        }}
                                    >
                                        <PlusSquare size={12} />
                                    </Button>
                                )}

                                {onOpenInNewTab && (
                                    <Button
                                        type='button'
                                        variant='ghost'
                                        size='icon'
                                        className={cn(
                                            iconBtn,
                                            'text-muted-foreground ui-interactive-surface',
                                        )}
                                        title='Open in new tab'
                                        onClick={() => {
                                            onOpenInNewTab(
                                                buildFilterOrderQuery(baseQuery, value, orderValue),
                                            );
                                            setShowTooltip(false);
                                        }}
                                    >
                                        <ExternalLink size={12} />
                                    </Button>
                                )}
                            </div>
                            <div className='p-3 pr-12 text-label whitespace-pre-wrap max-h-[250px] overflow-y-auto text-muted-foreground'>
                                {renderQueryPreview(baseQuery.replace(/;\s*$/, '').trim())}
                            </div>
                        </div>
                    )}
                </div>

                <div className='items-end flex-1 min-w-12.5 h-7 relative'>
                    <ResultFilterEditor
                        modelPath={modelPath}
                        monacoTheme={monacoTheme}
                        value={value}
                        onMount={handleMonacoMount}
                        onChange={handleEditorChange}
                    />
                </div>
            </>
        );
    },
);

WhereFilterBuilder.displayName = 'WhereFilterBuilder';
