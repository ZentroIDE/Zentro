// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { useSidebarPanels } from './sidebarPanelRegistry';
import { registerBuiltInSidebarPanels } from './sidebarPanels';
import { useSidebarSideState } from '../../stores/sidebarUiStore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui';
import { interactiveBadge } from '../ui/contract';

// Styled to match Sidebar.tsx (the primary sidebar) exactly — same wrapper,
// TabsList/TabsTrigger classes, and content pane — just the 'secondary' side.
export const SecondarySidebar: React.FC = () => {
    const panels = useSidebarPanels('secondary');
    const { activePanelId, setActivePanelId } = useSidebarSideState('secondary', {
        activePanelId: 'detail',
        width: 300,
    });

    React.useEffect(() => {
        registerBuiltInSidebarPanels();
    }, []);

    React.useEffect(() => {
        if (panels.length === 0) return;
        const hasActivePanel = panels.some(panel => panel.id === activePanelId);
        if (!hasActivePanel) {
            setActivePanelId(panels[0].id);
        }
    }, [activePanelId, panels, setActivePanelId]);

    if (panels.length === 0) {
        return null;
    }

    return (
        <div className='sidebar flex h-full w-full select-none flex-col overflow-hidden p-1 rounded-md bg-sidebar text-sidebar-foreground border border-sidebar-border'>
            <Tabs
                value={activePanelId}
                onValueChange={setActivePanelId}
                className='flex h-full flex-col'
            >
                <div className='shrink-0'>
                    <TabsList className='h-9 w-full justify-center gap-1 p-0 rounded-md'>
                        {panels.map(panel => {
                            const Icon = panel.icon;
                            const badge = panel.getBadge?.();
                            return (
                                <TabsTrigger
                                    key={panel.id}
                                    value={panel.id}
                                    className='relative h-8 w-8 cursor-pointer rounded-md shadow-none'
                                    title={panel.label}
                                    aria-label={panel.label}
                                >
                                    <Icon size={13} className='shrink-0' />
                                    {badge !== undefined && badge !== null && badge !== 0 && (
                                        <span
                                            className={`absolute right-0 top-1 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-label font-semibold leading-none ${interactiveBadge}`}
                                        >
                                            {badge}
                                        </span>
                                    )}
                                </TabsTrigger>
                            );
                        })}
                    </TabsList>
                </div>
                <div className='min-h-0 flex-1 overflow-hidden'>
                    {panels.map(panel => (
                        <TabsContent
                            key={panel.id}
                            value={panel.id}
                            className='mt-0 h-full outline-none'
                        >
                            {panel.render()}
                        </TabsContent>
                    ))}
                </div>
            </Tabs>
        </div>
    );
};
