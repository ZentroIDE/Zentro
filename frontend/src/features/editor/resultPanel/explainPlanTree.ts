// SPDX-License-Identifier: GPL-3.0-only

type JsonRecord = Record<string, unknown>;

export interface ExplainPlanSummary {
    executionTimeMs?: number;
    planningTimeMs?: number;
    slowestNodeMs?: number;
    largestNodeRows?: number;
    costliestNodeCost?: number;
    rootCost?: number;
    rootRows?: number;
    mode: 'actual' | 'estimated';
}

export interface ExplainPlanNodeViewModel {
    id: string;
    title: string;
    relationLabel?: string;
    detailLines: string[];
    metricValue: string;
    metricShare?: string;
    badges: Array<'slowest' | 'largest' | 'costliest'>;
    children: ExplainPlanNodeViewModel[];
}

export interface ExplainPlanViewModel {
    summary: ExplainPlanSummary;
    root: ExplainPlanNodeViewModel;
}

interface ExplainPlanNodeRaw {
    id: string;
    nodeType: string;
    actualTime?: number;
    totalCost?: number;
    rowCount?: number;
    relationLabel?: string;
    detailLines: string[];
    children: ExplainPlanNodeRaw[];
}

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getNumber(record: JsonRecord, key: string): number | undefined {
    const value = record[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getString(record: JsonRecord, key: string): string | undefined {
    const value = record[key];
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function getStringList(record: JsonRecord, key: string): string[] {
    const value = record[key];
    if (!Array.isArray(value)) return [];
    return value.filter(
        (item): item is string => typeof item === 'string' && item.trim().length > 0,
    );
}

function shorten(text: string, max = 72): string {
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function formatMetricNumber(value: number, digits = 2): string {
    return value.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: digits,
    });
}

function formatMilliseconds(value: number): string {
    if (value < 1) return `${formatMetricNumber(value, 2)} ms`;
    if (value < 100) return `${formatMetricNumber(value, 1)} ms`;
    return `${formatMetricNumber(value, 0)} ms`;
}

function formatRows(value: number): string {
    return value.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
}

function formatPercent(numerator: number, denominator?: number): string | undefined {
    if (!denominator || denominator <= 0) return undefined;
    const ratio = (numerator / denominator) * 100;
    if (!Number.isFinite(ratio)) return undefined;
    return `${Math.max(0, Math.round(ratio))} %`;
}

function buildRelationLabel(plan: JsonRecord): string | undefined {
    const relationName = getString(plan, 'Relation Name');
    const schema = getString(plan, 'Schema');
    const alias = getString(plan, 'Alias');
    const cteName = getString(plan, 'CTE Name');

    if (relationName) {
        const target = schema ? `${schema}.${relationName}` : relationName;
        return alias && alias !== relationName ? `on ${target} (${alias})` : `on ${target}`;
    }

    if (cteName) return `cte ${cteName}`;
    return undefined;
}

function buildDetailLines(plan: JsonRecord): string[] {
    const lines: string[] = [];
    const joinType = getString(plan, 'Join Type');
    const groupKeys = getStringList(plan, 'Group Key');
    const sortKeys = getStringList(plan, 'Sort Key');
    const strategy = getString(plan, 'Strategy');
    const indexName = getString(plan, 'Index Name');

    if (joinType) lines.push(`${joinType} join`);
    if (groupKeys.length > 0) lines.push(`by ${groupKeys.join(', ')}`);
    if (sortKeys.length > 0) lines.push(`sort by ${shorten(sortKeys.join(', '), 54)}`);
    if (strategy) lines.push(`strategy ${strategy.toLowerCase()}`);
    if (indexName) lines.push(`using ${indexName}`);

    const conditionKeys = [
        'Hash Cond',
        'Merge Cond',
        'Join Filter',
        'Index Cond',
        'Recheck Cond',
        'Filter',
    ];
    for (const key of conditionKeys) {
        const condition = getString(plan, key);
        if (!condition) continue;
        const prefix = key.replace(' Cond', '').replace(' Filter', ' filter').toLowerCase();
        lines.push(`${prefix} ${shorten(condition, 56)}`);
        break;
    }

    return lines.slice(0, 3);
}

function normalizeExplainDocument(input: unknown): JsonRecord | null {
    if (isRecord(input) && isRecord(input.Plan)) return input;
    if (Array.isArray(input) && input.length > 0 && isRecord(input[0]) && isRecord(input[0].Plan)) {
        return input[0];
    }
    return null;
}

function buildRawNode(plan: JsonRecord, path = '0'): ExplainPlanNodeRaw {
    const childPlans = Array.isArray(plan.Plans) ? plan.Plans.filter(isRecord) : [];

    return {
        id: path,
        nodeType: getString(plan, 'Node Type') || 'Plan Node',
        actualTime: getNumber(plan, 'Actual Total Time'),
        totalCost: getNumber(plan, 'Total Cost'),
        rowCount: getNumber(plan, 'Actual Rows') ?? getNumber(plan, 'Plan Rows'),
        relationLabel: buildRelationLabel(plan),
        detailLines: buildDetailLines(plan),
        children: childPlans.map((child, index) => buildRawNode(child, `${path}.${index}`)),
    };
}

function collectNodes(node: ExplainPlanNodeRaw, bucket: ExplainPlanNodeRaw[]): void {
    bucket.push(node);
    node.children.forEach(child => collectNodes(child, bucket));
}

function toViewModel(
    node: ExplainPlanNodeRaw,
    summary: ExplainPlanSummary,
    highlights: {
        slowestNodeId?: string;
        largestNodeId?: string;
        costliestNodeId?: string;
    },
): ExplainPlanNodeViewModel {
    const badges: ExplainPlanNodeViewModel['badges'] = [];
    if (node.id === highlights.slowestNodeId) badges.push('slowest');
    if (node.id === highlights.largestNodeId) badges.push('largest');
    if (node.id === highlights.costliestNodeId) badges.push('costliest');

    let metricValue = 'No metrics';
    let metricShare: string | undefined;

    if (typeof node.actualTime === 'number') {
        metricValue = formatMilliseconds(node.actualTime);
        metricShare = formatPercent(node.actualTime, summary.executionTimeMs);
    } else if (typeof node.totalCost === 'number') {
        metricValue = formatMetricNumber(node.totalCost, 2);
        metricShare = formatPercent(node.totalCost, summary.rootCost);
    } else if (typeof node.rowCount === 'number') {
        metricValue = `${formatRows(node.rowCount)} rows`;
        metricShare = formatPercent(node.rowCount, summary.rootRows);
    }

    return {
        id: node.id,
        title: node.nodeType,
        relationLabel: node.relationLabel,
        detailLines: node.detailLines,
        metricValue,
        metricShare,
        badges,
        children: node.children.map(child => toViewModel(child, summary, highlights)),
    };
}

export function buildExplainPlanViewModel(input: unknown): ExplainPlanViewModel | null {
    const document = normalizeExplainDocument(input);
    if (!document) return null;

    const rootPlan = document.Plan;
    if (!isRecord(rootPlan)) return null;

    const rawRoot = buildRawNode(rootPlan);
    const nodes: ExplainPlanNodeRaw[] = [];
    collectNodes(rawRoot, nodes);

    const slowestNode = nodes.reduce<ExplainPlanNodeRaw | undefined>((winner, node) => {
        if (typeof node.actualTime !== 'number') return winner;
        if (!winner || (winner.actualTime ?? -1) < node.actualTime) return node;
        return winner;
    }, undefined);

    const largestNode = nodes.reduce<ExplainPlanNodeRaw | undefined>((winner, node) => {
        if (typeof node.rowCount !== 'number') return winner;
        if (!winner || (winner.rowCount ?? -1) < node.rowCount) return node;
        return winner;
    }, undefined);

    const costliestNode = nodes.reduce<ExplainPlanNodeRaw | undefined>((winner, node) => {
        if (typeof node.totalCost !== 'number') return winner;
        if (!winner || (winner.totalCost ?? -1) < node.totalCost) return node;
        return winner;
    }, undefined);

    const summary: ExplainPlanSummary = {
        executionTimeMs: getNumber(document, 'Execution Time'),
        planningTimeMs: getNumber(document, 'Planning Time'),
        slowestNodeMs: slowestNode?.actualTime,
        largestNodeRows: largestNode?.rowCount,
        costliestNodeCost: costliestNode?.totalCost,
        rootCost: rawRoot.totalCost,
        rootRows: rawRoot.rowCount,
        mode: typeof getNumber(document, 'Execution Time') === 'number' ? 'actual' : 'estimated',
    };

    return {
        summary,
        root: toViewModel(rawRoot, summary, {
            slowestNodeId: slowestNode?.id,
            largestNodeId: largestNode?.id,
            costliestNodeId: costliestNode?.id,
        }),
    };
}
