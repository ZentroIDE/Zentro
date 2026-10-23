// SPDX-License-Identifier: GPL-3.0-only

import React, { useRef, useEffect, useMemo, useCallback } from 'react';

import { cn } from '../../lib/cn';
import { extractSelectAliases } from '../../lib/sqlAliases';
import { OrderByBuilder } from './resultPanel/OrderByBuilder';
import { WhereFilterBuilder } from './resultPanel/WhereFilterBuilder';

interface ResultFilterBarProps {
    value: string;
    onChange: (v: string) => void;
    orderValue?: string;
    onOrderChange?: (v: string) => void;
    onRun: (currentValue?: string, currentOrderBy?: string) => void;
    onClear: () => void;
    baseQuery?: string;
    onAppendToQuery?: (fullQuery: string) => void;
    onOpenInNewTab?: (fullQuery: string) => void;
    columns?: string[];
    tableName?: string;
    showFilterInput?: boolean;
    children?: React.ReactNode;
}

export const ResultFilterBar: React.FC<ResultFilterBarProps> = ({
    value,
    onChange,
    orderValue = '',
    onOrderChange,
    onRun,
    onClear,
    baseQuery,
    onAppendToQuery,
    onOpenInNewTab,
    columns = [],
    tableName,
    showFilterInput = true,
    children,
}) => {
    const onOrderChangeRef = useRef(onOrderChange);
    const valueRef = useRef(value);

    const completionColumns = useMemo(() => {
        const selectAliases = baseQuery ? extractSelectAliases(baseQuery) : [];
        return Array.from(
            new Set([...columns, ...selectAliases].filter(column => column.trim().length > 0)),
        );
    }, [baseQuery, columns]);

    useEffect(() => {
        valueRef.current = value;
    }, [value]);

    useEffect(() => {
        onOrderChangeRef.current = onOrderChange;
    }, [onOrderChange]);

    const runNow = useCallback(
        (nextFilterRaw: string, nextOrderRaw: string) => {
            const nextFilter = nextFilterRaw.trim();
            const nextOrder = nextOrderRaw.trim();
            if (!nextFilter && !nextOrder) {
                onClear();
                return;
            }
            onRun(nextFilterRaw, nextOrderRaw);
        },
        [onClear, onRun],
    );

    const handleOrderChange = useCallback((nextOrderValue: string) => {
        onOrderChangeRef.current?.(nextOrderValue);
    }, []);

    const handleRunWithOrder = useCallback(
        (nextOrder: string) => {
            runNow(valueRef.current, nextOrder);
        },
        [runNow],
    );

    const builderFlexClass = children ? 'flex-4' : 'flex-1';

    return (
        <div className='flex items-center gap-1 shrink-0 relative bg-card rounded-t-sm'>
            {showFilterInput ? (
                <div className='flex items-center w-full border-b border-(--border-panel)'>
                    <div className={cn('flex items-center min-w-0', builderFlexClass)}>
                        <WhereFilterBuilder
                            value={value}
                            onChange={onChange}
                            onRun={onRun}
                            onClear={onClear}
                            baseQuery={baseQuery}
                            orderValue={orderValue}
                            onAppendToQuery={onAppendToQuery}
                            onOpenInNewTab={onOpenInNewTab}
                            completionColumns={completionColumns}
                            tableName={tableName}
                        />
                    </div>

                    <div
                        className={cn(
                            'flex items-center min-w-0 bg-card rounded-md',
                            builderFlexClass,
                        )}
                    >
                        <OrderByBuilder
                            orderValue={orderValue}
                            onOrderChange={handleOrderChange}
                            completionColumns={completionColumns}
                            onRunWithOrder={handleRunWithOrder}
                        />
                    </div>

                    {children && (
                        <div className='flex items-center justify-end min-w-0 overflow-visible'>
                            {children}
                        </div>
                    )}
                </div>
            ) : (
                children && (
                    <div className='flex items-center justify-end min-w-0 gap-1 overflow-visible flex-1'>
                        {children}
                    </div>
                )
            )}
        </div>
    );
};
