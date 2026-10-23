// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
    ERD_NODE_WIDTH,
    applySavedLayout,
    computeErdLayout,
    estimateNodeSize,
    type ErdPositions,
} from './erdLayout';

function overlaps(
    a: { x: number; y: number },
    b: { x: number; y: number },
    sizeA: { width: number; height: number },
    sizeB: { width: number; height: number },
) {
    return (
        a.x < b.x + sizeB.width &&
        b.x < a.x + sizeA.width &&
        a.y < b.y + sizeB.height &&
        b.y < a.y + sizeA.height
    );
}

describe('estimateNodeSize', () => {
    it('grows with the number of columns and has a floor for empty tables', () => {
        expect(estimateNodeSize(0).height).toBeGreaterThan(0);
        expect(estimateNodeSize(10).height).toBeGreaterThan(estimateNodeSize(2).height);
        expect(estimateNodeSize(3).width).toBe(ERD_NODE_WIDTH);
    });
});

describe('computeErdLayout', () => {
    const nodes = [
        { id: 'orders', columnCount: 6 },
        { id: 'customers', columnCount: 4 },
        { id: 'products', columnCount: 5 },
        { id: 'order_items', columnCount: 3 },
    ];
    const edges = [
        { source: 'orders', target: 'customers' },
        { source: 'order_items', target: 'orders' },
        { source: 'order_items', target: 'products' },
    ];

    it('places every node at a finite position without overlap', () => {
        const positions = computeErdLayout(nodes, edges);
        expect(Object.keys(positions).sort()).toEqual(nodes.map(n => n.id).sort());
        for (const point of Object.values(positions)) {
            expect(Number.isFinite(point.x)).toBe(true);
            expect(Number.isFinite(point.y)).toBe(true);
        }
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                expect(
                    overlaps(
                        positions[nodes[i].id],
                        positions[nodes[j].id],
                        estimateNodeSize(nodes[i].columnCount),
                        estimateNodeSize(nodes[j].columnCount),
                    ),
                ).toBe(false);
            }
        }
    });

    it('flows left to right from the FK owner to the referenced table', () => {
        const positions = computeErdLayout(nodes, edges);
        expect(positions.orders.x).toBeLessThan(positions.customers.x);
        expect(positions.order_items.x).toBeLessThan(positions.orders.x);
    });

    it('survives self references, unknown endpoints and a lone table', () => {
        const positions = computeErdLayout(
            [{ id: 'employees', columnCount: 2 }],
            [
                { source: 'employees', target: 'employees' },
                { source: 'employees', target: 'ghost' },
            ],
        );
        expect(positions.employees).toBeDefined();
        expect(Number.isFinite(positions.employees.x)).toBe(true);
    });
});

describe('applySavedLayout', () => {
    const computed: ErdPositions = { a: { x: 0, y: 0 }, b: { x: 300, y: 0 } };

    it('prefers saved positions and falls back to computed ones for new tables', () => {
        const merged = applySavedLayout(computed, { a: { x: 10, y: 20 } });
        expect(merged.a).toEqual({ x: 10, y: 20 });
        expect(merged.b).toEqual({ x: 300, y: 0 });
    });

    it('ignores saved entries for tables that are gone and invalid points', () => {
        const merged = applySavedLayout(computed, {
            gone: { x: 1, y: 1 },
            a: { x: Number.NaN, y: 5 },
        });
        expect(merged.gone).toBeUndefined();
        expect(merged.a).toEqual({ x: 0, y: 0 });
    });

    it('returns the computed layout when nothing is saved', () => {
        expect(applySavedLayout(computed, null)).toEqual(computed);
    });
});
