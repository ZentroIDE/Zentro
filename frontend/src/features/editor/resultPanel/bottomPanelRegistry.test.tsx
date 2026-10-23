// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { describe, it, expect } from 'vitest';
import { Circle } from 'lucide-react';
import { getBottomPanels, registerBottomPanel, unregisterBottomPanel } from './bottomPanelRegistry';

function cleanupTestPanels() {
    getBottomPanels()
        .filter(panel => panel.id.startsWith('test.bottom.'))
        .forEach(panel => unregisterBottomPanel(panel.id));
}

describe('bottomPanelRegistry', () => {
    it('registers panels and returns them sorted by order', () => {
        cleanupTestPanels();

        registerBottomPanel({
            id: 'test.bottom.b',
            label: 'B',
            title: 'B',
            icon: Circle,
            order: 20,
            render: () => <div>B</div>,
        });
        registerBottomPanel({
            id: 'test.bottom.a',
            label: 'A',
            title: 'A',
            icon: Circle,
            order: 10,
            render: () => <div>A</div>,
        });

        const panels = getBottomPanels().filter(panel => panel.id.startsWith('test.bottom.'));

        expect(panels.map(panel => panel.id)).toEqual(['test.bottom.a', 'test.bottom.b']);

        cleanupTestPanels();
    });

    it('deduplicates same id unless replace is true', () => {
        cleanupTestPanels();

        registerBottomPanel({
            id: 'test.bottom.replace',
            label: 'Old',
            title: 'Old',
            icon: Circle,
            order: 10,
            render: () => <div>Old</div>,
        });
        registerBottomPanel({
            id: 'test.bottom.replace',
            label: 'Ignored',
            title: 'Ignored',
            icon: Circle,
            order: 99,
            render: () => <div>Ignored</div>,
        });

        let panel = getBottomPanels().find(item => item.id === 'test.bottom.replace');
        expect(panel?.label).toBe('Old');
        expect(panel?.order).toBe(10);

        registerBottomPanel(
            {
                id: 'test.bottom.replace',
                label: 'New',
                title: 'New',
                icon: Circle,
                order: 30,
                render: () => <div>New</div>,
            },
            { replace: true },
        );

        panel = getBottomPanels().find(item => item.id === 'test.bottom.replace');
        expect(panel?.label).toBe('New');
        expect(panel?.order).toBe(30);

        cleanupTestPanels();
    });

    it('unregisters a panel by id', () => {
        cleanupTestPanels();

        registerBottomPanel({
            id: 'test.bottom.removable',
            label: 'Removable',
            title: 'Removable',
            icon: Circle,
            order: 10,
            render: () => <div>Removable</div>,
        });
        expect(getBottomPanels().some(panel => panel.id === 'test.bottom.removable')).toBe(true);

        unregisterBottomPanel('test.bottom.removable');
        expect(getBottomPanels().some(panel => panel.id === 'test.bottom.removable')).toBe(false);
    });
});
