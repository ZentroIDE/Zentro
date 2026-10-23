// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AssistantMarkdown } from './AssistantMarkdown';

describe('AssistantMarkdown', () => {
    it('puts Open tab and run actions on a SQL fence', () => {
        const onOpenSql = vi.fn();
        render(
            <AssistantMarkdown
                text={'Here:\n```sql\nSELECT id FROM orders\n```\n'}
                onOpenSql={onOpenSql}
                runLabel='Execute'
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Open tab' }));
        expect(onOpenSql).toHaveBeenCalledWith('SELECT id FROM orders', false);

        fireEvent.click(screen.getByRole('button', { name: 'Execute' }));
        expect(onOpenSql).toHaveBeenCalledWith('SELECT id FROM orders', true);
    });
});
