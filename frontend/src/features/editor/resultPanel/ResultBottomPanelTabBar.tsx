// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { X, type LucideIcon } from 'lucide-react';

import { cn } from '../../../lib/cn';
import { useSmoothWheelScroll } from '../../../hooks/useSmoothWheelScroll';
import {
    Button,
    TAB_STRIP_BAR_CLASS,
    TAB_STRIP_ITEM_CLASS,
    TAB_STRIP_ITEM_ACTIVE_CLASS,
} from '../../../components/ui';

interface ResultTabItem {
    id: string;
    label: string;
    title?: string;
    running?: boolean;
    /** The result holds edits that were never saved. */
    unsaved?: boolean;
}

interface ExplainTabItem {
    id: string;
    label: string;
    running?: boolean;
}

interface BottomPanelTabItem {
    id: string;
    icon: LucideIcon;
    title: string;
    getBadge?: () => string | number | null | undefined;
}

interface ResultBottomPanelTabBarProps {
    resultTabs: ResultTabItem[];
    activeResultTabId?: string | null;
    explainTabs: ExplainTabItem[];
    activeExplainTabId?: string | null;
    bottomPanels: BottomPanelTabItem[];
    activeBottomPanelId?: string | null;
    bottomPanelView: 'result' | 'panel';
    onSelectResultTab: (id: string) => void;
    onCloseResultTab: (id: string) => void;
    onToggleBottomPanel: (id: string) => void;
    onCloseExplainTab: (id: string) => void;
}

export const ResultBottomPanelTabBar: React.FC<ResultBottomPanelTabBarProps> = ({
    resultTabs,
    activeResultTabId,
    explainTabs,
    activeExplainTabId,
    bottomPanels,
    activeBottomPanelId,
    bottomPanelView,
    onSelectResultTab,
    onCloseResultTab,
    onToggleBottomPanel,
    onCloseExplainTab,
}) => {
    const tabBaseClass = cn(TAB_STRIP_ITEM_CLASS, 'rounded-md h-7');
    const tabActiveClass = TAB_STRIP_ITEM_ACTIVE_CLASS;
    const resultTabsScrollRef = React.useRef<HTMLDivElement>(null);
    useSmoothWheelScroll(resultTabsScrollRef, { axis: 'x' });

    return (
        <div className={cn(TAB_STRIP_BAR_CLASS)}>
            <div
                ref={resultTabsScrollRef}
                className='flex h-full items-stretch flex-1 gap-1 overflow-x-auto ui-scrollbar-hover transition-opacity p-1'
            >
                {resultTabs.map(item => {
                    const isActive = bottomPanelView === 'result' && item.id === activeResultTabId;
                    return (
                        <div
                            key={item.id}
                            onClick={() => onSelectResultTab(item.id)}
                            className={cn(tabBaseClass, isActive && tabActiveClass)}
                            title={item.title || item.label}
                        >
                            <span>{item.label}</span>
                            {item.unsaved && (
                                <span
                                    className='h-1.5 w-1.5 shrink-0 rounded-full bg-warning'
                                    aria-label='Unsaved changes'
                                    title='Unsaved changes'
                                />
                            )}
                            {item.running && (
                                <span className='w-1.5 h-1.5 rounded-full bg-success shrink-0 animate-pulse' />
                            )}
                            <Button
                                type='button'
                                variant='ghost'
                                size='micro'
                                className='h-5 w-5 p-0 opacity-0 transition-opacity group-hover:opacity-100'
                                title={`Close ${item.label}`}
                                aria-label={`Close ${item.label}`}
                                onClick={event => {
                                    event.stopPropagation();
                                    onCloseResultTab(item.id);
                                }}
                            >
                                <X size={10} />
                            </Button>
                        </div>
                    );
                })}
            </div>

            <div className='flex h-full gap-1 shrink-0 py-1'>
                {explainTabs.map(item => {
                    const isActive = bottomPanelView === 'panel' && activeExplainTabId === item.id;
                    return (
                        <div
                            key={item.id}
                            onClick={() => onToggleBottomPanel(item.id)}
                            className={cn(tabBaseClass, isActive && tabActiveClass)}
                        >
                            <span>{item.label}</span>
                            {item.running && (
                                <span className='w-1.5 h-1.5 rounded-full bg-success shrink-0 animate-pulse' />
                            )}
                            <Button
                                type='button'
                                variant='ghost'
                                size='micro'
                                className='h-5 w-5 p-0 opacity-0 transition-opacity group-hover:opacity-100'
                                title={`Close ${item.label}`}
                                aria-label={`Close ${item.label}`}
                                onClick={event => {
                                    event.stopPropagation();
                                    onCloseExplainTab(item.id);
                                }}
                            >
                                <X size={10} />
                            </Button>
                        </div>
                    );
                })}

                {bottomPanels.map(item => {
                    const isActive = bottomPanelView === 'panel' && activeBottomPanelId === item.id;
                    const badge = item.getBadge?.();
                    const Icon = item.icon;
                    return (
                        <div
                            key={item.id}
                            title={item.title}
                            onClick={() => onToggleBottomPanel(item.id)}
                            className={cn(tabBaseClass, isActive && tabActiveClass, 'px-3')}
                        >
                            <Icon size={13} />
                            {badge !== undefined && badge !== null && badge !== 0 && (
                                <span className='w-2 h-2 rounded-full bg-success shrink-0 animate-pulse' />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
