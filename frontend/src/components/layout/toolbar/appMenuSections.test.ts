// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { buildAppMenuSections, registerMenuContribution } from './appMenuSections';

vi.mock('../../../../wailsjs/runtime/runtime', () => ({
    WindowMinimise: vi.fn(),
    WindowToggleMaximise: vi.fn(),
    Quit: vi.fn(),
    WindowReload: vi.fn(),
    WindowReloadApp: vi.fn(),
    BrowserOpenURL: vi.fn(),
}));

describe('appMenuSections contributions', () => {
    it('applies and removes menu contribution items', () => {
        const unregister = registerMenuContribution({
            sectionId: 'help',
            item: {
                id: 'help.customDocs',
                label: 'Custom Docs',
                action: () => undefined,
            },
        });

        const withContribution = buildAppMenuSections({
            getShortcut: () => '',
            isChecking: false,
            hasUpdate: false,
            onCheckForUpdates: () => undefined,
            onOpenAbout: () => undefined,
            onOpenLicense: () => undefined,
            onOpenTipOfTheDay: () => undefined,
        });

        const helpSection = withContribution.find(section => section.id === 'help');
        expect(helpSection?.items.some(item => item.id === 'help.customDocs')).toBe(true);

        unregister();

        const withoutContribution = buildAppMenuSections({
            getShortcut: () => '',
            isChecking: false,
            hasUpdate: false,
            onCheckForUpdates: () => undefined,
            onOpenAbout: () => undefined,
            onOpenLicense: () => undefined,
            onOpenTipOfTheDay: () => undefined,
        });
        const helpAfterUnregister = withoutContribution.find(section => section.id === 'help');
        expect(helpAfterUnregister?.items.some(item => item.id === 'help.customDocs')).toBe(false);
    });
});
