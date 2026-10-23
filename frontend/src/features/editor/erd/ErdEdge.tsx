// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import {
    BaseEdge,
    EdgeLabelRenderer,
    Position,
    getSmoothStepPath,
    useStore,
    type EdgeProps,
} from '@xyflow/react';
import { cn } from '@/lib/cn';
import type { ErdEdgeData } from './types';
import { getIntersection, getNodeOrigin, getPosition, type NodeLookupState } from './geometry';

export const ErdMarkerDefs: React.FC = () => (
    <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
            <marker
                id='zentro-fk-many'
                viewBox='0 -10 20 20'
                refX='0'
                refY='0'
                markerWidth='12'
                markerHeight='12'
                orient='auto-start-reverse'
            >
                <path
                    d='M 15,-8 L 1,0 L 15,8 M 15,0 L 1,0'
                    stroke='var(--status-success)'
                    strokeWidth='1.5'
                    fill='none'
                />
            </marker>
            <marker
                id='zentro-fk-one'
                viewBox='0 -10 20 20'
                refX='0'
                refY='0'
                markerWidth='12'
                markerHeight='12'
                orient='auto'
            >
                <path
                    d='M 0,0 L 12,0 M 6,-8 L 6,8'
                    stroke='var(--status-success)'
                    strokeWidth='1.5'
                    fill='none'
                />
            </marker>
        </defs>
    </svg>
);

export const ErdEdge: React.FC<EdgeProps> = ({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    source,
    target,
    style = {},
    data,
    selected,
}) => {
    const edgeData = data as ErdEdgeData;
    const sourceNode = useStore(store => {
        const nodeStore = store as NodeLookupState;
        return nodeStore.nodeLookup?.get(source) ?? nodeStore.nodeInternals?.get(source);
    });
    const targetNode = useStore(store => {
        const nodeStore = store as NodeLookupState;
        return nodeStore.nodeLookup?.get(target) ?? nodeStore.nodeInternals?.get(target);
    });

    let p1 = { x: sourceX, y: sourceY };
    let p2 = { x: targetX, y: targetY };
    let sPos = sourcePosition;
    let tPos = targetPosition;

    if (sourceNode && targetNode) {
        if (source === target) {
            const width = sourceNode.measured?.width ?? 200;
            const height = sourceNode.measured?.height ?? 100;
            const { x: px, y: py } = getNodeOrigin(sourceNode);
            p1 = { x: px + width, y: py + 40 };
            sPos = Position.Right;
            p2 = { x: px + 40, y: py + height };
            tPos = Position.Bottom;
        } else {
            const intersection1 = getIntersection(sourceNode, targetNode);
            const intersection2 = getIntersection(targetNode, sourceNode);
            if (intersection1.x !== 0 || intersection1.y !== 0) {
                p1 = intersection1;
                p2 = intersection2;
                sPos = getPosition(sourceNode, p1);
                tPos = getPosition(targetNode, p2);
            }
        }
    }

    const [edgePath, labelX, labelY] = getSmoothStepPath({
        sourceX: p1.x,
        sourceY: p1.y,
        sourcePosition: sPos,
        targetX: p2.x,
        targetY: p2.y,
        targetPosition: tPos,
        borderRadius: 8,
    });

    return (
        <>
            <BaseEdge
                path={edgePath}
                interactionWidth={16}
                style={{
                    ...style,
                    strokeWidth: selected ? 2.25 : 1.5,
                    stroke: selected ? 'var(--interactive-primary)' : 'var(--status-success)',
                }}
                markerStart='url(#zentro-fk-many)'
                markerEnd='url(#zentro-fk-one)'
            />
            <EdgeLabelRenderer>
                <div
                    style={{
                        transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                    }}
                    className={cn(
                        'nodrag nopan absolute z-sticky pointer-events-auto rounded-full border bg-card px-2 py-0.5 text-[10px] shadow-sm',
                        selected
                            ? 'border-(--interactive-primary) text-foreground'
                            : 'border-(--border-panel) text-muted-foreground',
                    )}
                >
                    {edgeData?.label}
                </div>
            </EdgeLabelRenderer>
        </>
    );
};
