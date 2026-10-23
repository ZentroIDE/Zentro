// SPDX-License-Identifier: GPL-3.0-only

import { Graph, layout } from '@dagrejs/dagre';

export interface ErdPoint {
    x: number;
    y: number;
}

export type ErdPositions = Record<string, ErdPoint>;

export interface ErdLayoutNode {
    id: string;
    columnCount: number;
}

export interface ErdLayoutEdge {
    source: string;
    target: string;
}

// Keep in sync with the fixed sizes used by TableNode (w-60, h-9 header, h-6 rows, h-8 empty row).
export const ERD_NODE_WIDTH = 240;
const NODE_CHROME_HEIGHT = 46;
const ROW_HEIGHT = 24;
const EMPTY_BODY_HEIGHT = 32;

export function estimateNodeSize(columnCount: number): { width: number; height: number } {
    const body = columnCount > 0 ? columnCount * ROW_HEIGHT : EMPTY_BODY_HEIGHT;
    return { width: ERD_NODE_WIDTH, height: NODE_CHROME_HEIGHT + body };
}

/** Lays tables out left to right (FK owner -> referenced table). Returns top-left positions. */
export function computeErdLayout(nodes: ErdLayoutNode[], edges: ErdLayoutEdge[]): ErdPositions {
    const graph = new Graph();
    graph.setGraph({ rankdir: 'LR', nodesep: 48, ranksep: 140, marginx: 24, marginy: 24 });
    graph.setDefaultEdgeLabel(() => ({}));

    const known = new Set<string>();
    for (const node of nodes) {
        const { width, height } = estimateNodeSize(node.columnCount);
        graph.setNode(node.id, { width, height });
        known.add(node.id);
    }
    for (const edge of edges) {
        if (edge.source === edge.target) continue;
        if (!known.has(edge.source) || !known.has(edge.target)) continue;
        graph.setEdge(edge.source, edge.target);
    }

    layout(graph);

    const positions: ErdPositions = {};
    for (const node of nodes) {
        const placed = graph.node(node.id);
        const { width, height } = estimateNodeSize(node.columnCount);
        positions[node.id] = { x: placed.x - width / 2, y: placed.y - height / 2 };
    }
    return positions;
}

function isValidPoint(point: ErdPoint | undefined): point is ErdPoint {
    return Boolean(point) && Number.isFinite(point?.x) && Number.isFinite(point?.y);
}

/** Saved positions win; tables without a saved position fall back to the computed layout. */
export function applySavedLayout(
    computed: ErdPositions,
    saved: ErdPositions | null | undefined,
): ErdPositions {
    const merged: ErdPositions = {};
    for (const [id, point] of Object.entries(computed)) {
        const savedPoint = saved?.[id];
        merged[id] = isValidPoint(savedPoint) ? savedPoint : point;
    }
    return merged;
}
