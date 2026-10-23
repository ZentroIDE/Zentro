// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Edge, Node } from '@xyflow/react';
import { applySavedLayout, computeErdLayout, type ErdPositions } from './erdLayout';
import {
    buildErdLayoutKey,
    clearErdLayout,
    loadErdLayout,
    saveErdLayout,
    type ErdLayoutScope,
} from './erdLayoutStorage';
import type { TableNodeData } from './types';

const SAVE_DEBOUNCE_MS = 300;

function toPositions(nodes: Node[]): ErdPositions {
    const positions: ErdPositions = {};
    for (const node of nodes) positions[node.id] = { x: node.position.x, y: node.position.y };
    return positions;
}

export function useErdLayout({ connectionID, dbName, schema, table }: ErdLayoutScope) {
    const key = useMemo(
        () => buildErdLayoutKey({ connectionID, dbName, schema, table }),
        [connectionID, dbName, schema, table],
    );
    const pending = useRef<{ key: string; nodes: Node[] } | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const flush = useCallback(() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        if (!pending.current) return;
        saveErdLayout(pending.current.key, toPositions(pending.current.nodes));
        pending.current = null;
    }, []);

    useEffect(() => flush, [flush]);

    /** Positions every node: saved position when present, dagre otherwise. */
    const resolveLayout = useCallback(
        (nodes: Node[], edges: Edge[]): Node[] => {
            const computed = computeErdLayout(
                nodes.map(node => ({
                    id: node.id,
                    columnCount: (node.data as TableNodeData).columns?.length ?? 0,
                })),
                edges.map(edge => ({ source: edge.source, target: edge.target })),
            );
            const positions = applySavedLayout(computed, loadErdLayout(key));
            return nodes.map(node => ({ ...node, position: positions[node.id] ?? node.position }));
        },
        [key],
    );

    /** Debounced save of the full node set; the key is captured so a table switch cannot cross-write. */
    const saveLayout = useCallback(
        (nodes: Node[]) => {
            pending.current = { key, nodes };
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
        },
        [key, flush],
    );

    const resetLayout = useCallback(() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        pending.current = null;
        clearErdLayout(key);
    }, [key]);

    return { resolveLayout, saveLayout, resetLayout };
}
