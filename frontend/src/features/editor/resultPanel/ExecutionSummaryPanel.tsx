// SPDX-License-Identifier: GPL-3.0-only

import { cn } from '../../../lib/cn';
import type { RunTotals, TabResult } from '../../../stores/resultStore';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../../../components/ui';

interface ExecutionSummaryPanelProps {
    // Per-statement results that survived the backend's progress throttle —
    // only a subset of the run, so counts/query come from `totals` instead.
    results: TabResult[];
    totals: RunTotals;
}

function pluralRows(count: number, verb: string): string {
    return `${count} ${count === 1 ? 'row' : 'rows'} ${verb}`;
}

// One summary for a multi-statement run made only of non-SELECT statements,
// in place of a Result tab per (throttled) statement.
export function ExecutionSummaryPanel({ results, totals }: ExecutionSummaryPanelProps) {
    const errorText = results.find(r => r.error)?.error;
    const isRunning = results.some(r => !r.isDone);

    const affectedParts = [
        totals.insertedRows > 0 ? pluralRows(totals.insertedRows, 'inserted') : null,
        totals.updatedRows > 0 ? pluralRows(totals.updatedRows, 'updated') : null,
        totals.deletedRows > 0 ? pluralRows(totals.deletedRows, 'deleted') : null,
    ].filter(Boolean);

    const startedAt = Math.min(...results.map(r => r.progress?.startedAt ?? Infinity));
    const finishedAt = Math.max(
        ...results.map(r => (r.progress?.startedAt ?? 0) + (r.duration ?? 0)),
    );
    const hasTimes = Number.isFinite(startedAt) && finishedAt >= startedAt;

    const rows: { name: string; value: string; className?: string; isQuery?: boolean }[] = [
        {
            name: 'Status',
            value: errorText ? 'Failed' : isRunning ? 'Running…' : 'Completed',
            className: cn(
                'font-semibold',
                errorText
                    ? 'text-destructive'
                    : isRunning
                      ? 'text-muted-foreground'
                      : 'text-success',
            ),
        },
        ...(errorText
            ? [{ name: 'Error', value: errorText, className: 'text-destructive font-semibold' }]
            : []),
        { name: 'Statements', value: String(totals.statementCount ?? results.length) },
        {
            name: 'Affected Rows',
            value: affectedParts.length > 0 ? affectedParts.join(', ') : '0 rows affected',
            className: 'font-semibold',
        },
        ...(hasTimes
            ? [
                  {
                      name: 'Execute time',
                      value: `${((finishedAt - startedAt) / 1000).toFixed(3)}s`,
                      className: 'font-mono text-label tracking-wide',
                  },
                  { name: 'Start time', value: new Date(startedAt).toString() },
                  { name: 'Finish time', value: new Date(finishedAt).toString() },
              ]
            : []),
        ...(totals.query ? [{ name: 'Query', value: totals.query, isQuery: true }] : []),
    ];

    return (
        <div className='w-full h-full overflow-auto bg-card select-text p-1'>
            <Table disableContainerScroll>
                <TableHeader>
                    <TableRow className='hover:bg-transparent border-b border-border/60'>
                        <TableHead className='w-48 font-semibold text-muted-foreground py-1 select-none'>
                            Name
                        </TableHead>
                        <TableHead className='font-semibold text-muted-foreground py-1 select-none'>
                            Value
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map(row => (
                        <TableRow
                            key={row.name}
                            className='border-b border-border/30 last:border-b-0'
                        >
                            <TableCell className='font-medium text-muted-foreground py-1.5 px-2 text-small w-48 align-top select-none'>
                                {row.name}
                            </TableCell>
                            <TableCell
                                className={cn(
                                    'py-1.5 px-2 text-small align-top font-sans text-foreground/90',
                                    row.className,
                                )}
                            >
                                {row.isQuery ? (
                                    <pre className='m-0 font-mono text-label whitespace-pre-wrap break-all leading-relaxed text-foreground select-text'>
                                        {row.value}
                                    </pre>
                                ) : (
                                    row.value
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
