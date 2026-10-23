// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it } from 'vitest';
import { useLayoutStore } from '../stores/layoutStore';
import { buildSidebarContextKey, useSidebarUiStore } from '../stores/sidebarUiStore';
import { prepareFocusZone } from './focusZoneReveal';

describe('prepareFocusZone', () => {
    beforeEach(() => {
        useLayoutStore.setState({
            showSidebar: false,
            showResultPanel: false,
            bottomPanelView: 'panel',
        });
    });

    it('opens the left sidebar on the explorer panel', () => {
        prepareFocusZone('explorer');

        expect(useLayoutStore.getState().showSidebar).toBe(true);
        const contextKey = buildSidebarContextKey(null, null);
        expect(useSidebarUiStore.getState().contextStates[contextKey]?.primary.activePanelId).toBe(
            'explorer',
        );
    });

    it('opens the result panel on the result view', () => {
        prepareFocusZone('resultGrid');

        expect(useLayoutStore.getState().showResultPanel).toBe(true);
        expect(useLayoutStore.getState().bottomPanelView).toBe('result');
    });
});
