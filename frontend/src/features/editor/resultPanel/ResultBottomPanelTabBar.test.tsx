// SPDX-License-Identifier: GPL-3.0-only

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Terminal } from 'lucide-react';
import { ResultBottomPanelTabBar } from './ResultBottomPanelTabBar';

describe('ResultBottomPanelTabBar', () => {
    it('closes explain tabs without toggling the bottom panel selection', () => {
        const onSelectResultTab = vi.fn();
        const onCloseResultTab = vi.fn();
        const onToggleBottomPanel = vi.fn();
        const onCloseExplainTab = vi.fn();

        render(
            <ResultBottomPanelTabBar
                resultTabs={[]}
                activeResultTabId={null}
                explainTabs={[{ id: 'explain-plan', label: 'Explain Plan' }]}
                activeExplainTabId='explain-plan'
                bottomPanels={[]}
                activeBottomPanelId={null}
                bottomPanelView='panel'
                onSelectResultTab={onSelectResultTab}
                onCloseResultTab={onCloseResultTab}
                onToggleBottomPanel={onToggleBottomPanel}
                onCloseExplainTab={onCloseExplainTab}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Close Explain Plan' }));

        expect(onCloseExplainTab).toHaveBeenCalledWith('explain-plan');
        expect(onToggleBottomPanel).not.toHaveBeenCalled();
        expect(onSelectResultTab).not.toHaveBeenCalled();
        expect(onCloseResultTab).not.toHaveBeenCalled();
    });

    it('closes result tabs without selecting the tab', () => {
        const onSelectResultTab = vi.fn();
        const onCloseResultTab = vi.fn();
        const onToggleBottomPanel = vi.fn();
        const onCloseExplainTab = vi.fn();

        render(
            <ResultBottomPanelTabBar
                resultTabs={[{ id: 'tab-1::result:1', label: 'Result 2' }]}
                activeResultTabId='tab-1::result:1'
                explainTabs={[]}
                activeExplainTabId={null}
                bottomPanels={[]}
                activeBottomPanelId={null}
                bottomPanelView='result'
                onSelectResultTab={onSelectResultTab}
                onCloseResultTab={onCloseResultTab}
                onToggleBottomPanel={onToggleBottomPanel}
                onCloseExplainTab={onCloseExplainTab}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Close Result 2' }));

        expect(onCloseResultTab).toHaveBeenCalledWith('tab-1::result:1');
        expect(onSelectResultTab).not.toHaveBeenCalled();
        expect(onToggleBottomPanel).not.toHaveBeenCalled();
        expect(onCloseExplainTab).not.toHaveBeenCalled();
    });

    it('renders registered bottom panels and toggles on click, showing a badge dot when getBadge returns a value', () => {
        const onToggleBottomPanel = vi.fn();

        render(
            <ResultBottomPanelTabBar
                resultTabs={[]}
                activeResultTabId={null}
                explainTabs={[]}
                activeExplainTabId={null}
                bottomPanels={[
                    { id: 'audit', icon: Terminal, title: 'Audit (Ctrl+Shift+L)' },
                    { id: 'terminal', icon: Terminal, title: 'Terminal', getBadge: () => 1 },
                ]}
                activeBottomPanelId='audit'
                bottomPanelView='panel'
                onSelectResultTab={vi.fn()}
                onCloseResultTab={vi.fn()}
                onToggleBottomPanel={onToggleBottomPanel}
                onCloseExplainTab={vi.fn()}
            />,
        );

        expect(screen.getByTitle('Audit (Ctrl+Shift+L)')).toBeInTheDocument();
        const terminalTab = screen.getByTitle('Terminal');
        expect(terminalTab.querySelector('.animate-pulse')).toBeInTheDocument();

        fireEvent.click(terminalTab);
        expect(onToggleBottomPanel).toHaveBeenCalledWith('terminal');
    });

    it('turns a vertical wheel over the result tabs into horizontal scrolling', () => {
        const { container } = render(
            <ResultBottomPanelTabBar
                resultTabs={[{ id: 'tab-1::result:1', label: 'Result 1' }]}
                activeResultTabId='tab-1::result:1'
                explainTabs={[]}
                activeExplainTabId={null}
                bottomPanels={[]}
                activeBottomPanelId={null}
                bottomPanelView='result'
                onSelectResultTab={vi.fn()}
                onCloseResultTab={vi.fn()}
                onToggleBottomPanel={vi.fn()}
                onCloseExplainTab={vi.fn()}
            />,
        );
        const event = new WheelEvent('wheel', { deltaY: 12, bubbles: true, cancelable: true });

        container.querySelector<HTMLElement>('.ui-scrollbar-hover')!.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
    });

    it('flags a result tab that holds unsaved edits', () => {
        render(
            <ResultBottomPanelTabBar
                resultTabs={[
                    { id: 't', label: 'Result 1' },
                    { id: 't::result:kept-1', label: 'Result 2', unsaved: true },
                ]}
                activeResultTabId='t'
                explainTabs={[]}
                activeExplainTabId={null}
                bottomPanels={[]}
                activeBottomPanelId={null}
                bottomPanelView='result'
                onSelectResultTab={vi.fn()}
                onCloseResultTab={vi.fn()}
                onToggleBottomPanel={vi.fn()}
                onCloseExplainTab={vi.fn()}
            />,
        );

        expect(screen.getAllByLabelText('Unsaved changes')).toHaveLength(1);
    });
});
