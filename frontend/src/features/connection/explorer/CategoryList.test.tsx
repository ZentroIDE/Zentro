// SPDX-License-Identifier: GPL-3.0-only

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OBJECT_TYPE } from '../../../lib/constants';
import { CATEGORY_KEY, type CategoryGroupNode } from '../databaseExplorerTypes';
import { CategoryList } from './CategoryList';

function category(key: CategoryGroupNode['key'], label: string): CategoryGroupNode {
    return {
        id: key,
        key,
        label,
        icon: 'table',
        itemIcon: 'table',
        schemas: [],
        totalCount: 1,
        canOpenDefinition: true,
        allowCreateTable: false,
        dropObjectType: OBJECT_TYPE.TABLE,
    };
}

describe('CategoryList keyboard', () => {
    it('moves through categories and exits into the tree', () => {
        const onSelectCategory = vi.fn();
        const onExitDown = vi.fn();
        render(
            <CategoryList
                categories={[
                    category(CATEGORY_KEY.TABLES, 'Tables'),
                    category(CATEGORY_KEY.VIEWS, 'Views'),
                ]}
                activeCategoryKey={CATEGORY_KEY.TABLES}
                onSelectCategory={onSelectCategory}
                onExitDown={onExitDown}
            />,
        );

        const tables = screen.getByRole('option', { name: /Tables/ });
        const views = screen.getByRole('option', { name: /Views/ });
        expect(tables).toHaveAttribute('tabindex', '0');
        expect(views).toHaveAttribute('tabindex', '-1');

        fireEvent.keyDown(tables, { key: 'ArrowDown' });
        expect(views).toHaveFocus();

        fireEvent.keyDown(views, { key: 'ArrowDown' });
        expect(onExitDown).toHaveBeenCalledTimes(1);

        fireEvent.keyDown(views, { key: 'Enter' });
        expect(onSelectCategory).toHaveBeenCalledWith(CATEGORY_KEY.VIEWS);
    });
});
