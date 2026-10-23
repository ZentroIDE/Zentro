// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { cn } from '../../../lib/cn';
import { useProjectStore } from '../../../stores/projectStore';
import type { TabResult } from '../../../stores/resultStore';
import { useResultStore } from '../../../stores/resultStore';
import { useEnvironmentStore } from '../../../stores/environmentStore';
import { withSchemaContextHint } from '../../../lib/schemaErrorHint';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../../../components/ui';
import { parseDmlMeta, DmlType } from './dmlUtils';

const DML_COLOR_CLASSES: Record<DmlType, string> = {
    [DmlType.UPDATE]: 'text-warning',
    [DmlType.INSERT]: 'text-success',
    [DmlType.DELETE]: 'text-destructive',
    [DmlType.BEGIN]: 'text-muted-foreground',
    [DmlType.COMMIT]: 'text-muted-foreground',
    [DmlType.ROLLBACK]: 'text-muted-foreground',
    [DmlType.OTHER]: 'text-foreground',
};

import type { TransactionSummary } from './types';

interface DmlResultPanelProps {
    result?: TabResult;
    tabId?: string;
    transactionSummary?: TransactionSummary;
}

export function DmlResultPanel({ result, tabId, transactionSummary }: DmlResultPanelProps) {
    const results = useResultStore(state => state.results);
    const transactionWrapTabs = useResultStore(state => state.transactionWrapTabs);
    const activeProject = useProjectStore(state => state.activeProject);
    const activeEnvironmentKey = useEnvironmentStore(state => state.activeEnvironmentKey);
    const currentEnvironment = React.useMemo(() => {
        if (!activeProject || !activeEnvironmentKey) return null;
        return (
            activeProject.environments?.find(
                environment => environment.key === activeEnvironmentKey,
            ) || null
        );
    }, [activeEnvironmentKey, activeProject]);

    const sql = React.useMemo(() => {
        if (transactionSummary) {
            return transactionSummary.statements
                .map(s => s.statementText)
                .filter(Boolean)
                .join('\n');
        }
        return result?.lastExecutedQuery ?? '';
    }, [result, transactionSummary]);

    // Hook into resultStore to check if the current tab execution was auto-wrapped in a transaction
    const isAutoWrapped = Boolean(tabId && transactionWrapTabs[tabId]);

    // Check if the SQL statement was manually wrapped in a transaction block
    const isManualTransaction = React.useMemo(() => {
        const upper = sql.trim().toUpperCase();
        return (
            upper.startsWith('BEGIN') && (upper.includes('COMMIT') || upper.includes('ROLLBACK'))
        );
    }, [sql]);

    const transactionValue = React.useMemo(() => {
        if (isAutoWrapped) return 'Yes (Auto-wrapped)';
        if (isManualTransaction) return 'Yes (Manual)';
        return 'No';
    }, [isAutoWrapped, isManualTransaction]);

    const transactionClass = React.useMemo(() => {
        if (isAutoWrapped) return 'text-success font-semibold';
        if (isManualTransaction) return 'text-primary font-semibold';
        return 'text-muted-foreground/60';
    }, [isAutoWrapped, isManualTransaction]);

    // Format the value for Affected Rows with action and verb (e.g. "1 row deleted", "23 rows updated")
    const { affectedValue, affectedColorClass } = React.useMemo(() => {
        if (transactionSummary) {
            const counts = {
                [DmlType.INSERT]: 0,
                [DmlType.UPDATE]: 0,
                [DmlType.DELETE]: 0,
                [DmlType.OTHER]: 0,
            };
            if (transactionSummary.aggregateTotals) {
                // Backend-computed totals across every statement actually
                // executed — the progress-emit throttle means most statements'
                // own results[] entries were never created, so summing
                // transactionSummary.statements below would undercount.
                counts[DmlType.INSERT] = transactionSummary.aggregateTotals.insertedRows;
                counts[DmlType.UPDATE] = transactionSummary.aggregateTotals.updatedRows;
                counts[DmlType.DELETE] = transactionSummary.aggregateTotals.deletedRows;
            } else {
                transactionSummary.statements.forEach(s => {
                    const m = parseDmlMeta(s.statementText);
                    if (
                        m.type === DmlType.INSERT ||
                        m.type === DmlType.UPDATE ||
                        m.type === DmlType.DELETE ||
                        m.type === DmlType.OTHER
                    ) {
                        counts[m.type] += s.affected;
                    }
                });
            }

            const parts: string[] = [];
            if (counts[DmlType.INSERT] > 0) {
                parts.push(
                    `${counts[DmlType.INSERT]} ${counts[DmlType.INSERT] === 1 ? 'row' : 'rows'} inserted`,
                );
            }
            if (counts[DmlType.UPDATE] > 0) {
                parts.push(
                    `${counts[DmlType.UPDATE]} ${counts[DmlType.UPDATE] === 1 ? 'row' : 'rows'} updated`,
                );
            }
            if (counts[DmlType.DELETE] > 0) {
                parts.push(
                    `${counts[DmlType.DELETE]} ${counts[DmlType.DELETE] === 1 ? 'row' : 'rows'} deleted`,
                );
            }

            if (parts.length === 0) {
                const presentTypes = Object.keys(counts).filter(k => {
                    const type = k as DmlType;
                    return transactionSummary.statements.some(
                        s => parseDmlMeta(s.statementText).type === type,
                    );
                }) as DmlType[];
                if (presentTypes.length === 1) {
                    const type = presentTypes[0];
                    const verb =
                        type === DmlType.INSERT
                            ? 'inserted'
                            : type === DmlType.UPDATE
                              ? 'updated'
                              : type === DmlType.DELETE
                                ? 'deleted'
                                : 'affected';
                    return {
                        affectedValue: `0 rows ${verb}`,
                        affectedColorClass: DML_COLOR_CLASSES[type] ?? 'text-foreground',
                    };
                }
                return {
                    affectedValue: `0 rows affected`,
                    affectedColorClass: 'text-muted-foreground',
                };
            }

            let colorClass = 'text-foreground';
            if (parts.length === 1) {
                if (counts[DmlType.INSERT] > 0) colorClass = DML_COLOR_CLASSES[DmlType.INSERT];
                else if (counts[DmlType.UPDATE] > 0) colorClass = DML_COLOR_CLASSES[DmlType.UPDATE];
                else if (counts[DmlType.DELETE] > 0) colorClass = DML_COLOR_CLASSES[DmlType.DELETE];
            }

            return {
                affectedValue: parts.join(', '),
                affectedColorClass: colorClass,
            };
        }

        if (!result) return { affectedValue: '-', affectedColorClass: 'text-foreground' };
        const meta = parseDmlMeta(sql);
        const rowLabel = result.affected === 1 ? 'row' : 'rows';
        return {
            affectedValue: `${result.affected} ${rowLabel} ${meta.verb}`,
            affectedColorClass: DML_COLOR_CLASSES[meta.type] ?? 'text-foreground',
        };
    }, [result, transactionSummary, sql]);

    const executeTime = React.useMemo(() => {
        if (transactionSummary) {
            return `${(transactionSummary.totalDuration / 1000).toFixed(3)}s`;
        }
        if (!result) return '-';
        return `${(result.duration / 1000).toFixed(3)}s`;
    }, [result, transactionSummary]);

    const startedAt = React.useMemo(() => {
        if (transactionSummary) {
            for (const s of transactionSummary.statements) {
                const r = results[s.tabResultKey];
                if (r?.progress?.startedAt) {
                    return r.progress.startedAt;
                }
            }
            return undefined;
        }
        return result?.progress?.startedAt;
    }, [result, transactionSummary, results]);

    const startTimeStr = React.useMemo(() => {
        if (!startedAt) return '-';
        return new Date(startedAt).toString();
    }, [startedAt]);

    const duration = React.useMemo(() => {
        if (transactionSummary) return transactionSummary.totalDuration;
        return result?.duration ?? 0;
    }, [result, transactionSummary]);

    const finishTimeStr = React.useMemo(() => {
        if (!startedAt) return '-';
        return new Date(startedAt + duration).toString();
    }, [startedAt, duration]);

    const errorText = React.useMemo(() => {
        if (transactionSummary) {
            const failedStmt = transactionSummary.statements.find(s => s.error);
            return withSchemaContextHint(
                failedStmt?.error,
                currentEnvironment?.last_schema,
                failedStmt?.statementText,
            );
        }
        return withSchemaContextHint(
            result?.error,
            currentEnvironment?.last_schema,
            result?.lastExecutedQuery,
        );
    }, [currentEnvironment?.last_schema, result, transactionSummary]);

    const stats = [
        ...(transactionSummary
            ? [
                  {
                      name: 'Status',
                      value: !transactionSummary.isComplete
                          ? 'Running transaction…'
                          : transactionSummary.hasError
                            ? 'Transaction failed'
                            : 'Transaction completed',
                      className: cn(
                          'font-semibold',
                          !transactionSummary.isComplete
                              ? 'text-muted-foreground'
                              : transactionSummary.hasError
                                ? 'text-destructive'
                                : 'text-success',
                      ),
                  },
              ]
            : []),
        ...(errorText
            ? [
                  {
                      name: 'Error',
                      value: errorText,
                      className: 'text-destructive font-semibold',
                  },
              ]
            : []),
        {
            name: 'Affected Rows',
            value: affectedValue,
            className: cn('font-semibold', affectedColorClass),
        },
        {
            name: 'Execute time',
            value: executeTime,
            className: 'font-mono text-label tracking-wide',
        },
        { name: 'Start time', value: startTimeStr },
        { name: 'Finish time', value: finishTimeStr },
        { name: 'Transaction', value: transactionValue, className: transactionClass },
        { name: 'Query', value: sql, isQuery: true },
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
                    {stats.map(row => (
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
                                    {
                                        'font-mono text-label text-foreground whitespace-pre-wrap break-all leading-normal font-normal':
                                            row.isQuery,
                                    },
                                )}
                            >
                                {row.isQuery ? (
                                    <pre className='m-0 font-mono whitespace-pre-wrap break-all leading-relaxed text-foreground select-text'>
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
