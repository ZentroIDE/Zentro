// SPDX-License-Identifier: GPL-3.0-only

import { Position } from '@xyflow/react';

export interface MeasuredNodeLike {
    measured?: { width?: number; height?: number };
    internals?: { positionAbsolute?: { x: number; y: number } };
    positionAbsolute?: { x: number; y: number };
    position?: { x: number; y: number };
}

export interface NodeLookupState {
    nodeLookup?: Map<string, MeasuredNodeLike>;
    nodeInternals?: Map<string, MeasuredNodeLike>;
}

export function getNodeOrigin(node: MeasuredNodeLike) {
    return {
        x: node.internals?.positionAbsolute?.x ?? node.positionAbsolute?.x ?? node.position?.x ?? 0,
        y: node.internals?.positionAbsolute?.y ?? node.positionAbsolute?.y ?? node.position?.y ?? 0,
    };
}

function getNodeCenter(node: MeasuredNodeLike) {
    const width = node.measured?.width ?? 0;
    const height = node.measured?.height ?? 0;
    const { x, y } = getNodeOrigin(node);
    return { x: x + width / 2, y: y + height / 2, width, height };
}

export function getIntersection(
    n1: MeasuredNodeLike | undefined,
    n2: MeasuredNodeLike | undefined,
) {
    if (
        !n1 ||
        !n2 ||
        !n1.measured?.width ||
        !n1.measured?.height ||
        !n2.measured?.width ||
        !n2.measured?.height
    ) {
        return { x: 0, y: 0 };
    }

    const p1 = getNodeCenter(n1);
    const p2 = getNodeCenter(n2);
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;

    if (dx === 0 && dy === 0) return { x: p1.x, y: p1.y };

    const padding = 12;
    const wp = p1.width / 2 + padding;
    const hp = p1.height / 2 + padding;

    if (Math.abs(dx) * hp > Math.abs(dy) * wp) {
        return {
            x: p1.x + (dx > 0 ? wp : -wp),
            y: p1.y + dy * Math.abs(wp / dx),
        };
    }

    return {
        y: p1.y + (dy > 0 ? hp : -hp),
        x: p1.x + dx * Math.abs(hp / dy),
    };
}

export function getPosition(node: MeasuredNodeLike | undefined, point: { x: number; y: number }) {
    if (!node || !node.measured?.width || !node.measured?.height) return Position.Left;
    const center = getNodeCenter(node);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    if (Math.abs(dx) > Math.abs(dy)) {
        return dx > 0 ? Position.Right : Position.Left;
    }
    return dy > 0 ? Position.Bottom : Position.Top;
}
