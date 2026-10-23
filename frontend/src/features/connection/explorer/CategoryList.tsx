// SPDX-License-Identifier: GPL-3.0-only

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../../../lib/cn';
import { interactiveSelectable, interactiveSelected } from '../../../components/ui/contract';
import type { CategoryGroupNode } from '../databaseExplorerTypes';
import { renderDatabaseExplorerExtension, renderIcon } from './nodeRenderers';

interface CategoryListProps {
    categories: CategoryGroupNode[];
    activeCategoryKey: string | undefined;
    onSelectCategory: (categoryKey: string) => void;
    /** Arrow Down past the last category enters the object tree. */
    onExitDown?: () => void;
    /** The tree calls this to hand focus back to the category that holds the tab stop. */
    focusCategoryRef?: React.MutableRefObject<(() => void) | null>;
}

// Category rows (Tables, Views, …) above the object tree. One row is in the
// tab order; arrows move through the list and into the tree below it.
export const CategoryList: React.FC<CategoryListProps> = ({
    categories,
    activeCategoryKey,
    onSelectCategory,
    onExitDown,
    focusCategoryRef,
}) => {
    const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
    const [focusedIndex, setFocusedIndex] = useState(0);

    useEffect(() => {
        const index = categories.findIndex(category => category.key === activeCategoryKey);
        if (index >= 0) setFocusedIndex(index);
    }, [activeCategoryKey, categories]);

    useEffect(() => {
        if (!focusCategoryRef) return;
        focusCategoryRef.current = () => {
            itemRefs.current[focusedIndex]?.focus();
        };
        return () => {
            focusCategoryRef.current = null;
        };
    }, [focusCategoryRef, focusedIndex]);

    const moveFocus = (index: number) => {
        const next = Math.max(0, Math.min(categories.length - 1, index));
        setFocusedIndex(next);
        itemRefs.current[next]?.focus();
    };

    if (categories.length === 0) return null;

    return (
        <div className='shrink-0' role='listbox' aria-label='Object categories'>
            {categories.map((category, index) => (
                <div
                    key={category.id}
                    ref={element => {
                        itemRefs.current[index] = element;
                    }}
                    role='option'
                    onClick={() => onSelectCategory(category.key)}
                    aria-selected={activeCategoryKey === category.key}
                    tabIndex={index === focusedIndex ? 0 : -1}
                    data-object-key={`category:${category.key}`}
                    className={cn(
                        'group mb-0.5 flex h-7 items-center gap-1.5 overflow-hidden rounded-md px-1.5 text-small! text-foreground transition-colors duration-fast ui-focus-ring',
                        interactiveSelectable,
                        activeCategoryKey === category.key && interactiveSelected,
                        'cursor-pointer',
                    )}
                    onKeyDown={event => {
                        if (event.key === 'ArrowDown') {
                            event.preventDefault();
                            if (index === categories.length - 1) onExitDown?.();
                            else moveFocus(index + 1);
                            return;
                        }
                        if (event.key === 'ArrowUp') {
                            event.preventDefault();
                            if (index > 0) moveFocus(index - 1);
                            return;
                        }
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onSelectCategory(category.key);
                        }
                    }}
                    title={category.label}
                >
                    {renderDatabaseExplorerExtension(`category:${category.key}`, {
                        category,
                    }) ?? (
                        <>
                            {renderIcon(category.icon, 12)}
                            <span className='truncate leading-5'>{category.label}</span>
                        </>
                    )}
                    <span className='ml-auto shrink-0 text-label text-muted-foreground tabular-nums'>
                        {category.totalCount}
                    </span>
                </div>
            ))}
        </div>
    );
};
