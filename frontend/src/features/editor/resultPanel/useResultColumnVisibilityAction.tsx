// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Columns } from 'lucide-react';
import { Button, Switch } from '../../../components/ui';
import { cn } from '../../../lib/cn';
import { interactiveSelectable } from '../../../components/ui/contract';

import { makeDataColumnId } from '../../../components/data-table';
const SHOW_LABEL = 'Show';
import type { TabResult } from '../../../stores/resultStore';
import type { ResultPanelAction } from './types';

interface ResultColumnVisibilityState {
    result: TabResult | undefined;
    columnVisibility: Record<string, boolean>;
    setColumnVisibility: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}

interface ResultColumnVisibilityActionArgs extends ResultColumnVisibilityState {
    showColumnsPopover: boolean;
    setShowColumnsPopover: React.Dispatch<React.SetStateAction<boolean>>;
    iconSize?: number;
}

export function getResultColumnId(columnName: string, index: number) {
    return makeDataColumnId(columnName, index);
}

export function isResultColumnVisible(
    columnVisibility: Record<string, boolean>,
    columnName: string,
    index: number,
) {
    return columnVisibility[getResultColumnId(columnName, index)] !== false;
}

export function setResultColumnVisible(
    setColumnVisibility: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
    columnName: string,
    index: number,
    visible: boolean,
) {
    const columnId = getResultColumnId(columnName, index);
    setColumnVisibility(prev => {
        const next = { ...prev };
        if (visible) {
            delete next[columnId];
        } else {
            next[columnId] = false;
        }
        return next;
    });
}

export function resetResultColumnVisibility(
    setColumnVisibility: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
) {
    setColumnVisibility({});
}

export function ResultColumnVisibilityPopoverContent({
    result,
    columnVisibility,
    setColumnVisibility,
}: ResultColumnVisibilityState) {
    if (!result || result.columns.length === 0) return null;

    const hiddenCount = result.columns.filter(
        (columnName, index) => !isResultColumnVisible(columnVisibility, columnName, index),
    ).length;

    return (
        <div className='h-[320px] rounded-md bg-popover shadow-sm flex flex-col'>
            <div className='px-3 py-2 border-b border-border/30 flex items-center justify-between gap-2'>
                <div className='text-label font-medium text-muted-foreground uppercase tracking-wide'>
                    {SHOW_LABEL}
                </div>
                <Button
                    type='button'
                    variant='ghost'
                    tone='default'
                    size='micro'
                    onClick={() => resetResultColumnVisibility(setColumnVisibility)}
                    disabled={hiddenCount === 0}
                >
                    Reset
                </Button>
            </div>
            <div className='flex-1 overflow-y-auto p-1.5'>
                {result.columns.map((columnName, index) => {
                    const isVisible = isResultColumnVisible(columnVisibility, columnName, index);
                    return (
                        <label
                            key={`${columnName}:${index}`}
                            className={cn(
                                'flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-small transition-colors',
                                interactiveSelectable,
                                isVisible ? 'text-foreground' : 'text-muted-foreground',
                            )}
                        >
                            <Switch
                                checked={isVisible}
                                size='micro'
                                aria-label={`Toggle column ${columnName}`}
                                onCheckedChange={checked =>
                                    setResultColumnVisible(
                                        setColumnVisibility,
                                        columnName,
                                        index,
                                        checked,
                                    )
                                }
                            />
                            <span className='truncate'>{columnName}</span>
                        </label>
                    );
                })}
            </div>
        </div>
    );
}

export function useResultColumnVisibilityAction({
    result,
    columnVisibility,
    setColumnVisibility,
    showColumnsPopover,
    setShowColumnsPopover,
    iconSize = 12,
}: ResultColumnVisibilityActionArgs): ResultPanelAction | null {
    return React.useMemo(() => {
        if (!result || result.columns.length === 0) return null;

        const hiddenCount = result.columns.filter(
            (columnName, index) => !isResultColumnVisible(columnVisibility, columnName, index),
        ).length;
        const visibilitySignature = result.columns
            .map((columnName, index) => {
                const columnId = getResultColumnId(columnName, index);
                return `${columnId}:${columnVisibility[columnId] === false ? 0 : 1}`;
            })
            .join(',');

        return {
            id: 'columns-toggle',
            icon: <Columns size={iconSize} />,
            title: 'Toggle column visibility',
            variant: hiddenCount > 0 ? 'secondary' : 'ghost',
            className: cn(
                'h-7 gap-1 px-2 text-label border',
                hiddenCount > 0 ? 'border-primary/40 bg-primary/15' : 'border-transparent',
            ),
            badge: hiddenCount > 0 ? <span className='text-label'>-{hiddenCount}</span> : undefined,
            signature: `cols:${showColumnsPopover ? 1 : 0}:${visibilitySignature}`,
            popoverOpen: showColumnsPopover,
            onPopoverOpenChange: setShowColumnsPopover,
            popoverContent: (
                <ResultColumnVisibilityPopoverContent
                    result={result}
                    columnVisibility={columnVisibility}
                    setColumnVisibility={setColumnVisibility}
                />
            ),
        };
    }, [
        columnVisibility,
        iconSize,
        result,
        setColumnVisibility,
        setShowColumnsPopover,
        showColumnsPopover,
    ]);
}
