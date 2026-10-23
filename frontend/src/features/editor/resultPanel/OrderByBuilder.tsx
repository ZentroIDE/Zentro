// SPDX-License-Identifier: GPL-3.0-only

import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, Plus, X } from 'lucide-react';

import {
    OrderDirection,
    OrderTerm,
    parseOrderByTerms,
    serializeOrderByTerms,
} from '../../../lib/orderByBuilder';
import {
    Badge,
    Button,
    Input,
    Popover,
    PopoverContent,
    PopoverTrigger,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../../../components/ui';
import { useToast } from '../../../components/layout/Toast';
import { cn } from '../../../lib/cn';

interface OrderByBuilderProps {
    /** Current serialised ORDER BY expression (e.g. "name ASC, created_at DESC"). */
    orderValue: string;
    /** Called with the next serialised expression any time the user mutates terms. */
    onOrderChange: (next: string) => void;
    /** Column names available for chip-mode selection + parsing. */
    completionColumns: string[];
    /**
     * Re-run the query with the parent's current filter value + the supplied ORDER BY.
     * The parent owns the filter value; this builder doesn't read it directly.
     */
    onRunWithOrder: (nextOrder: string) => void;
}

/**
 * ORDER BY half of the ResultFilterBar. Owns chip vs text mode + the add/edit
 * popover state machine. Parses `orderValue` on every change so it stays in
 * sync with parent — switches to text mode when expression is "custom"
 * (anything we can't parse back into clean terms).
 *
 * Pure helpers (`parseOrderByTerms`, `serializeOrderByTerms`) live in
 * `lib/orderByBuilder.ts` and are exhaustively unit-tested there.
 */
export const OrderByBuilder: React.FC<OrderByBuilderProps> = ({
    orderValue,
    onOrderChange,
    completionColumns,
    onRunWithOrder,
}) => {
    const { toast } = useToast();
    const [orderTerms, setOrderTerms] = useState<OrderTerm[]>([]);
    const [orderInputMode, setOrderInputMode] = useState<'chips' | 'text'>('chips');
    const [orderBuilderOpen, setOrderBuilderOpen] = useState(false);
    const [editingOrderIndex, setEditingOrderIndex] = useState<number | null>(null);
    const [selectedOrderField, setSelectedOrderField] = useState<string>('');
    const [selectedOrderDir, setSelectedOrderDir] = useState<OrderDirection>('ASC');

    // Re-parse on every value change so chips stay in sync with text edits and
    // auto-switch to text mode when the expression isn't representable as chips.
    useEffect(() => {
        const parsed = parseOrderByTerms(orderValue, completionColumns);
        setOrderTerms(parsed.terms);
        if (parsed.isCustom && orderValue.trim()) {
            setOrderInputMode('text');
        } else if (!orderValue.trim()) {
            setOrderInputMode('chips');
        }
    }, [completionColumns, orderValue]);

    const handleAddOrderTerm = useCallback(
        (dir: OrderDirection = selectedOrderDir) => {
            const field = selectedOrderField.trim();
            if (!field) return;
            const nextTerms = [...orderTerms, { field, dir }];
            const nextExpr = serializeOrderByTerms(nextTerms);
            onOrderChange(nextExpr);
            onRunWithOrder(nextExpr);
            setSelectedOrderField('');
            setSelectedOrderDir('ASC');
            setOrderBuilderOpen(false);
        },
        [onOrderChange, onRunWithOrder, orderTerms, selectedOrderDir, selectedOrderField],
    );

    const handleRemoveOrderTerm = useCallback(
        (index: number) => {
            const nextTerms = orderTerms.filter((_, idx) => idx !== index);
            const nextExpr = serializeOrderByTerms(nextTerms);
            onOrderChange(nextExpr);
            onRunWithOrder(nextExpr);
        },
        [onOrderChange, onRunWithOrder, orderTerms],
    );

    const handleOpenEditOrderTerm = useCallback(
        (index: number) => {
            const target = orderTerms[index];
            if (!target) return;
            setSelectedOrderField(target.field);
            setSelectedOrderDir(target.dir);
            setEditingOrderIndex(index);
        },
        [orderTerms],
    );

    const handleSaveOrderTerm = useCallback(
        (dir: OrderDirection = selectedOrderDir) => {
            if (editingOrderIndex === null) return;
            const field = selectedOrderField.trim();
            if (!field) return;
            const nextTerms = [...orderTerms];
            nextTerms[editingOrderIndex] = { field, dir };
            const nextExpr = serializeOrderByTerms(nextTerms);
            onOrderChange(nextExpr);
            onRunWithOrder(nextExpr);
            setEditingOrderIndex(null);
            setSelectedOrderField('');
            setSelectedOrderDir('ASC');
        },
        [
            editingOrderIndex,
            onOrderChange,
            onRunWithOrder,
            orderTerms,
            selectedOrderDir,
            selectedOrderField,
        ],
    );

    const toggleOrderInputMode = useCallback(() => {
        if (orderInputMode === 'chips') {
            setOrderInputMode('text');
            return;
        }
        const parsed = parseOrderByTerms(orderValue, completionColumns);
        if (parsed.isCustom && orderValue.trim()) {
            toast.error('Cannot switch to chip mode: ORDER BY contains custom expression.');
            return;
        }
        setOrderInputMode('chips');
    }, [completionColumns, orderInputMode, orderValue, toast]);

    return (
        <>
            <span
                title={orderInputMode === 'chips' ? 'Switch to text mode' : 'Switch to chip mode'}
                onClick={toggleOrderInputMode}
                className='h-7 text-label uppercase cursor-pointer font-semibold text-muted-foreground bg-muted tracking-wide shrink-0 select-none transition-colors p-1 px-2 flex items-center ui-interactive-surface mr-1'
            >
                ORDER BY
            </span>
            {orderInputMode === 'chips' ? (
                <>
                    {orderTerms.length > 0 && (
                        <div className='flex items-center gap-1 overflow-x-auto scrollbar-thin'>
                            {orderTerms.map((term, index) => (
                                <Popover
                                    key={`${term.field}:${index}`}
                                    open={editingOrderIndex === index}
                                    onOpenChange={open => setEditingOrderIndex(open ? index : null)}
                                >
                                    <PopoverTrigger asChild>
                                        <Badge
                                            variant='info'
                                            className='cursor-pointer gap-1 px-1 text-label shrink-0 h-6 rounded-md'
                                            onClick={() => handleOpenEditOrderTerm(index)}
                                        >
                                            <span>{term.field}</span>
                                            <span className='text-muted-foreground'>
                                                {term.dir}
                                            </span>
                                            <Button
                                                type='button'
                                                variant='ghost'
                                                size='micro'
                                                title='Remove order term'
                                                onClick={event => {
                                                    event.stopPropagation();
                                                    handleRemoveOrderTerm(index);
                                                }}
                                            >
                                                <X size={10} />
                                            </Button>
                                        </Badge>
                                    </PopoverTrigger>
                                    <PopoverContent
                                        className='w-68 p-2'
                                        align='start'
                                        sideOffset={6}
                                    >
                                        <div
                                            className='space-y-2'
                                            onKeyDown={event => {
                                                if (event.key !== 'Enter') return;
                                                event.preventDefault();
                                                event.stopPropagation();
                                                if (!selectedOrderField.trim()) return;
                                                handleSaveOrderTerm();
                                            }}
                                        >
                                            <div className='text-label text-muted-foreground font-medium'>
                                                Edit sort term
                                            </div>
                                            <Select
                                                value={selectedOrderField}
                                                onValueChange={setSelectedOrderField}
                                            >
                                                <SelectTrigger className='border-input/60'>
                                                    <SelectValue placeholder='Choose field' />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {completionColumns.map(column => (
                                                        <SelectItem key={column} value={column}>
                                                            <span className='text-small'>
                                                                {column}
                                                            </span>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <div className='grid grid-cols-2 gap-1'>
                                                <Button
                                                    type='button'
                                                    variant={
                                                        selectedOrderDir === 'ASC'
                                                            ? 'default'
                                                            : 'outline'
                                                    }
                                                    size='sm'
                                                    className='h-7 text-small'
                                                    disabled={!selectedOrderField.trim()}
                                                    onClick={() => handleSaveOrderTerm('ASC')}
                                                >
                                                    ASC
                                                </Button>
                                                <Button
                                                    type='button'
                                                    variant={
                                                        selectedOrderDir === 'DESC'
                                                            ? 'default'
                                                            : 'outline'
                                                    }
                                                    size='sm'
                                                    className='h-7 text-small'
                                                    disabled={!selectedOrderField.trim()}
                                                    onClick={() => handleSaveOrderTerm('DESC')}
                                                >
                                                    DESC
                                                </Button>
                                            </div>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            ))}
                        </div>
                    )}
                    <Popover open={orderBuilderOpen} onOpenChange={setOrderBuilderOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                type='button'
                                variant='ghost'
                                size='icon'
                                className='shrink-0 text-muted-foreground ui-interactive-surface ml-1'
                                title='Add ORDER BY term'
                            >
                                <Plus size={12} />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className='w-68 p-2' align='start' sideOffset={6}>
                            <div
                                className='space-y-2'
                                onKeyDown={event => {
                                    if (event.key !== 'Enter') return;
                                    event.preventDefault();
                                    event.stopPropagation();
                                    if (!selectedOrderField.trim()) return;
                                    handleAddOrderTerm();
                                }}
                            >
                                <div className='text-label text-muted-foreground font-medium'>
                                    Add sort term
                                </div>
                                <Select
                                    value={selectedOrderField}
                                    onValueChange={setSelectedOrderField}
                                >
                                    <SelectTrigger className='border-input/60'>
                                        <SelectValue placeholder='Choose field' />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {completionColumns.map(column => (
                                            <SelectItem key={column} value={column}>
                                                <span className='text-small'>{column}</span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <div className='grid grid-cols-2 gap-1'>
                                    <Button
                                        type='button'
                                        variant={selectedOrderDir === 'ASC' ? 'default' : 'outline'}
                                        size='sm'
                                        className='h-7 text-small'
                                        disabled={!selectedOrderField.trim()}
                                        onClick={() => handleAddOrderTerm('ASC')}
                                    >
                                        ASC
                                    </Button>
                                    <Button
                                        type='button'
                                        variant={
                                            selectedOrderDir === 'DESC' ? 'default' : 'outline'
                                        }
                                        size='sm'
                                        className='h-7 text-small'
                                        disabled={!selectedOrderField.trim()}
                                        onClick={() => handleAddOrderTerm('DESC')}
                                    >
                                        DESC
                                    </Button>
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                </>
            ) : (
                <Input
                    value={orderValue}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        onOrderChange(event.target.value)
                    }
                    onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        event.stopPropagation();
                        onRunWithOrder(event.currentTarget.value);
                    }}
                    size='sm'
                    variant='ghost'
                    className={cn('h-7! font-mono border-none')}
                    placeholder='created_at DESC, id ASC'
                />
            )}
        </>
    );
};
