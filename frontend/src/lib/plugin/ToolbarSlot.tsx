// SPDX-License-Identifier: GPL-3.0-only

import { createElement, Fragment, useMemo } from 'react';
import { pluginRegistry } from './pluginRegistry';
import { PluginErrorBoundary } from './PluginErrorBoundary';

interface ToolbarSlotProps {
    slot: 'toolbar-left' | 'toolbar-center' | 'toolbar-right';
}

export const ToolbarSlot = ({ slot }: ToolbarSlotProps) => {
    const items = useMemo(() => pluginRegistry.getToolbarItems(slot), [slot]);

    if (items.length === 0) return null;

    return (
        <>
            {items.map((item, i) => (
                <Fragment key={`plugin-${slot}-${i}`}>
                    <PluginErrorBoundary pluginId={item.pluginId}>
                        {createElement(item.component)}
                    </PluginErrorBoundary>
                </Fragment>
            ))}
        </>
    );
};
