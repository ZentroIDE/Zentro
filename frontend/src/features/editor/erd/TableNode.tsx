// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { KeyRound, Link2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ErdColumn, TableNodeData } from './types';

const handleClass = 'transition-opacity! group-hover/col:opacity-100! hover:opacity-100!';

const handleStyle = (side: 'left' | 'right'): React.CSSProperties => ({
    top: '50%',
    [side]: -5,
    width: 10,
    height: 10,
    opacity: 0,
    transform: 'translateY(-50%)',
    background: 'var(--status-success)',
});

const ColumnRow: React.FC<{ column: ErdColumn }> = ({ column }) => (
    <div className='group/col relative flex h-6 items-center justify-between gap-3 px-3 text-label text-muted-foreground'>
        <Handle
            type='target'
            position={Position.Left}
            id={`${column.name}__target`}
            style={handleStyle('left')}
            className={handleClass}
        />
        <div className='flex min-w-0 items-center gap-1.5'>
            {column.isPk ? (
                <KeyRound size={11} className='shrink-0 text-(--interactive-primary)' />
            ) : column.isFk ? (
                <Link2 size={11} className='shrink-0 text-(--status-success)' />
            ) : (
                <span className='w-[11px] shrink-0' />
            )}
            <span
                className={cn(
                    'truncate',
                    column.isPk && 'font-semibold text-(--interactive-primary)',
                    column.isFk && !column.isPk && 'font-semibold text-(--status-success)',
                )}
            >
                {column.name}
            </span>
        </div>
        <span className='shrink-0 truncate text-[11px] opacity-50'>{column.type}</span>
        <Handle
            type='source'
            position={Position.Right}
            id={`${column.name}__source`}
            style={handleStyle('right')}
            className={handleClass}
        />
    </div>
);

export const TableNode: React.FC<{ data: TableNodeData }> = ({ data }) => (
    <div
        className={cn(
            'w-60 overflow-hidden rounded-lg border bg-card shadow-md',
            data.isFocus ? 'border-(--interactive-primary)' : 'border-(--border-panel)',
        )}
    >
        <div
            className={cn(
                'flex h-9 items-center border-b border-(--border-panel) px-3 text-small font-semibold text-foreground',
                data.isFocus ? 'bg-(--interactive-primary)/15' : 'bg-secondary',
            )}
        >
            <span className='truncate'>{data.label}</span>
        </div>

        <div className='py-1'>
            {data.columns?.map((column, index) => (
                <ColumnRow key={`${column.name}-${index}`} column={column} />
            ))}
            {(!data.columns || data.columns.length === 0) && (
                <div className='flex h-8 items-center px-3 text-label italic text-muted-foreground'>
                    No columns found
                </div>
            )}
        </div>
    </div>
);
