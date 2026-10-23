// SPDX-License-Identifier: GPL-3.0-only

import React, { useMemo, useState } from 'react';
import { Database } from 'lucide-react';

import { JsonViewer } from '../../../components/viewers/JsonViewer';
import { Button } from '../../../components/ui';
import { useResultStore } from '../../../stores/resultStore';
import { buildExplainPlanViewModel, type ExplainPlanNodeViewModel } from './explainPlanTree';

interface Props {
    tabId: string;
}

type PlanMetricItem = {
    key: string;
    label: string;
    value: string;
};

function tryParseJson(value: string): unknown | null {
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function JsonNode({ value, depth = 0 }: { value: unknown; depth?: number }): React.ReactElement {
    const indent = depth * 16;

    if (value === null) return <span className='text-muted-foreground'>null</span>;
    if (typeof value === 'boolean') return <span className='text-primary'>{String(value)}</span>;
    if (typeof value === 'number') return <span className='text-success'>{String(value)}</span>;
    if (typeof value === 'string') return <span className='text-warning'>"{value}"</span>;

    if (Array.isArray(value)) {
        if (value.length === 0) return <span className='text-muted-foreground'>[]</span>;
        return (
            <span>
                {'['}
                {value.map((item, i) => (
                    <div key={i} style={{ paddingLeft: indent + 16 }}>
                        <JsonNode value={item} depth={depth + 1} />
                        {i < value.length - 1 && <span className='text-muted-foreground'>,</span>}
                    </div>
                ))}
                <div style={{ paddingLeft: indent }}>{']'}</div>
            </span>
        );
    }

    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>);
        if (entries.length === 0) return <span className='text-muted-foreground'>{'{}'}</span>;
        return (
            <span>
                {'{'}
                {entries.map(([k, v], i) => (
                    <div key={k} style={{ paddingLeft: indent + 16 }}>
                        <span className='text-muted-foreground'>"{k}"</span>
                        <span className='text-foreground'>: </span>
                        <JsonNode value={v} depth={depth + 1} />
                        {i < entries.length - 1 && <span className='text-muted-foreground'>,</span>}
                    </div>
                ))}
                <div style={{ paddingLeft: indent }}>{'}'}</div>
            </span>
        );
    }

    return <span>{String(value)}</span>;
}

function Badge({
    tone,
    children,
}: {
    tone: 'slowest' | 'largest' | 'costliest';
    children: React.ReactNode;
}): React.ReactElement {
    const toneClass =
        tone === 'slowest'
            ? 'bg-warning/12 text-warning'
            : tone === 'largest'
              ? 'bg-primary/10 text-primary'
              : 'bg-destructive/10 text-destructive';

    return (
        <span
            className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${toneClass}`}
        >
            {children}
        </span>
    );
}

function PlanMetric({ label, value }: { label: string; value: string }): React.ReactElement {
    return (
        <div className='min-w-28 flex-1 rounded-md bg-card px-3 py-2'>
            <div className='text-small font-semibold text-foreground'>{value}</div>
            <div className='mt-0.5 text-label text-muted-foreground'>{label}</div>
        </div>
    );
}

function ExplainPlanNodeCard({ node }: { node: ExplainPlanNodeViewModel }): React.ReactElement {
    return (
        <div className='w-72 max-w-[calc(100vw-3rem)] rounded-md bg-card px-3 py-3 shadow-sm'>
            <div className='flex items-start justify-between gap-4'>
                <div className='min-w-0 flex-1'>
                    <div className='text-small font-semibold uppercase tracking-wide text-foreground'>
                        {node.title}
                    </div>
                    {node.relationLabel ? (
                        <div className='mt-1 text-label text-muted-foreground'>
                            {node.relationLabel}
                        </div>
                    ) : null}
                </div>
                <div className='shrink-0 text-right'>
                    <div className='text-small font-medium text-foreground'>{node.metricValue}</div>
                    {node.metricShare ? (
                        <div className='mt-0.5 text-label text-muted-foreground'>
                            {node.metricShare}
                        </div>
                    ) : null}
                </div>
            </div>

            <div className='mt-4 space-y-1 text-label leading-relaxed text-muted-foreground'>
                {node.detailLines.length > 0 ? (
                    node.detailLines.map(line => <div key={line}>{line}</div>)
                ) : (
                    <div>No planner annotations</div>
                )}
            </div>

            <div className='mt-4 flex items-end justify-between gap-3'>
                <div className='flex min-w-0 flex-wrap gap-1'>
                    {node.badges.map(badge => (
                        <Badge key={badge} tone={badge}>
                            {badge}
                        </Badge>
                    ))}
                </div>
                <Database size={12} className='shrink-0 text-primary' />
            </div>
        </div>
    );
}

function ExplainPlanTree({ node }: { node: ExplainPlanNodeViewModel }): React.ReactElement {
    if (node.children.length === 0) {
        return <ExplainPlanNodeCard node={node} />;
    }

    if (node.children.length === 1) {
        return (
            <div className='flex flex-col items-center'>
                <ExplainPlanNodeCard node={node} />
                <div className='h-4 w-px bg-border/60' />
                <ExplainPlanTree node={node.children[0]} />
            </div>
        );
    }

    return (
        <div className='flex flex-col items-center'>
            <ExplainPlanNodeCard node={node} />
            <div className='h-4 w-px shrink-0 bg-border/60' />
            <div className='relative flex items-start justify-center gap-4 pt-4'>
                <div className='pointer-events-none absolute left-8 right-8 top-0 h-px bg-border/60' />
                {node.children.map(child => (
                    <div key={child.id} className='flex flex-col items-center'>
                        <div className='h-4 w-px bg-border/60' />
                        <ExplainPlanTree node={child} />
                    </div>
                ))}
            </div>
        </div>
    );
}

export const ExplainResultView: React.FC<Props> = ({ tabId }) => {
    const result = useResultStore(s => s.results[tabId]);
    const isAnalyze = tabId.endsWith(':analyze');
    const explainTitle = isAnalyze ? 'Explain Analyze' : 'Explain Plan';
    const [jsonViewMode, setJsonViewMode] = useState<'json' | 'tree'>('tree');

    const content = useMemo(() => {
        if (!result?.isDone || result.rows.length === 0) return null;

        if (result.columns.length === 1 && result.rows.length === 1) {
            const raw = result.rows[0][0];
            const parsed = tryParseJson(raw);
            if (parsed !== null) return { type: 'json' as const, data: parsed, raw };
        }

        return { type: 'text' as const, lines: result.rows.map(row => row[0] ?? '') };
    }, [result]);

    const planView = useMemo(() => {
        if (content?.type !== 'json') return null;
        return buildExplainPlanViewModel(content.data);
    }, [content]);

    if (!result) return null;

    const metricItems: PlanMetricItem[] =
        planView === null
            ? []
            : planView.summary.mode === 'actual'
              ? [
                    planView.summary.executionTimeMs !== undefined
                        ? {
                              key: 'execution-time',
                              label: 'Execution time',
                              value: `${planView.summary.executionTimeMs.toLocaleString(undefined, {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 2,
                              })} ms`,
                          }
                        : null,
                    planView.summary.planningTimeMs !== undefined
                        ? {
                              key: 'planning-time',
                              label: 'Planning time',
                              value: `${planView.summary.planningTimeMs.toLocaleString(undefined, {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 2,
                              })} ms`,
                          }
                        : null,
                    planView.summary.slowestNodeMs !== undefined
                        ? {
                              key: 'slowest-node',
                              label: 'Slowest node',
                              value: `${planView.summary.slowestNodeMs.toLocaleString(undefined, {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 2,
                              })} ms`,
                          }
                        : null,
                    planView.summary.largestNodeRows !== undefined
                        ? {
                              key: 'largest-node',
                              label: 'Largest node',
                              value: planView.summary.largestNodeRows.toLocaleString(),
                          }
                        : null,
                    planView.summary.costliestNodeCost !== undefined
                        ? {
                              key: 'costliest-node',
                              label: 'Costliest node',
                              value: planView.summary.costliestNodeCost.toLocaleString(undefined, {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 2,
                              }),
                          }
                        : null,
                ].filter((item): item is PlanMetricItem => item !== null)
              : [
                    planView.summary.rootCost !== undefined
                        ? {
                              key: 'total-cost',
                              label: 'Estimated total cost',
                              value: planView.summary.rootCost.toLocaleString(undefined, {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 2,
                              }),
                          }
                        : null,
                    planView.summary.rootRows !== undefined
                        ? {
                              key: 'plan-rows',
                              label: 'Estimated rows',
                              value: planView.summary.rootRows.toLocaleString(),
                          }
                        : null,
                    planView.summary.largestNodeRows !== undefined
                        ? {
                              key: 'largest-node',
                              label: 'Largest node',
                              value: planView.summary.largestNodeRows.toLocaleString(),
                          }
                        : null,
                    planView.summary.costliestNodeCost !== undefined
                        ? {
                              key: 'costliest-node',
                              label: 'Costliest node',
                              value: planView.summary.costliestNodeCost.toLocaleString(undefined, {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 2,
                              }),
                          }
                        : null,
                ].filter((item): item is PlanMetricItem => item !== null);

    const header = (
        <div className='flex items-center justify-between gap-3 border-b border-border/30 px-3 py-2'>
            <div className='min-w-0'>
                <div className='text-small font-medium text-foreground'>{explainTitle}</div>
                <div className='text-label text-muted-foreground'>
                    {!result.isDone
                        ? 'Waiting for planner output'
                        : result.error
                          ? 'Planner execution returned an error'
                          : !content
                            ? 'Planner finished without structured output'
                            : content.type === 'json'
                              ? planView
                                  ? 'Planner tree and raw JSON output'
                                  : 'JSON planner output'
                              : `${content.lines.length.toLocaleString()} line${content.lines.length === 1 ? '' : 's'} of text output`}
                </div>
            </div>
            {content?.type === 'json' ? (
                <div className='flex items-center gap-1 shrink-0'>
                    <Button
                        type='button'
                        variant={jsonViewMode === 'tree' ? 'secondary' : 'ghost'}
                        size='micro'
                        onClick={() => setJsonViewMode('tree')}
                    >
                        Tree
                    </Button>
                    <Button
                        type='button'
                        variant={jsonViewMode === 'json' ? 'secondary' : 'ghost'}
                        size='micro'
                        onClick={() => setJsonViewMode('json')}
                    >
                        JSON
                    </Button>
                </div>
            ) : null}
        </div>
    );

    if (!result.isDone) {
        return (
            <div className='flex h-full min-h-0 flex-col overflow-hidden'>
                {header}
                <div className='flex items-center gap-2 px-3 py-2 text-small text-muted-foreground'>
                    <span className='h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin' />
                    Running explain...
                </div>
            </div>
        );
    }

    if (result.error) {
        return (
            <div className='flex h-full min-h-0 flex-col overflow-hidden'>
                {header}
                <div className='px-3 py-2 text-small font-mono text-destructive'>
                    {result.error}
                </div>
            </div>
        );
    }

    if (!content) {
        return (
            <div className='flex h-full min-h-0 flex-col overflow-hidden'>
                {header}
                <div className='px-3 py-2 text-small text-muted-foreground'>No explain output.</div>
            </div>
        );
    }

    return (
        <div className='flex h-full min-h-0 flex-col overflow-hidden'>
            {header}
            <div className='flex-1 overflow-auto'>
                {content.type === 'json' ? (
                    jsonViewMode === 'json' ? (
                        <div className='h-full px-3 py-2'>
                            <JsonViewer value={content.raw} height='100%' useMonaco={true} />
                        </div>
                    ) : planView ? (
                        <div className='min-w-max px-4 py-4'>
                            <div className='mx-auto max-w-7xl'>
                                {metricItems.length > 0 ? (
                                    <div className='flex flex-wrap gap-2 rounded-md bg-background/50 px-3 py-3'>
                                        {metricItems.map(item => (
                                            <PlanMetric
                                                key={item.key}
                                                label={item.label}
                                                value={item.value}
                                            />
                                        ))}
                                    </div>
                                ) : null}

                                <div className='mt-5 flex justify-center pb-6'>
                                    <ExplainPlanTree node={planView.root} />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className='px-3 py-2 text-label leading-relaxed'>
                            <JsonNode value={content.data} />
                        </div>
                    )
                ) : (
                    <div className='px-3 py-2 text-label leading-relaxed'>
                        {content.lines.map((line, i) => (
                            <div key={i} className='whitespace-pre text-foreground'>
                                {line}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
