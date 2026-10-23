// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Eye, Hash, Layers, Link2, List, Sigma, Table2, Type, Zap } from 'lucide-react';
import type { DatabaseExplorerIcon } from '../databaseExplorerTypes';
import { pluginRegistry } from '../../../lib/plugin/pluginRegistry';
import { PluginErrorBoundary } from '../../../lib/plugin/PluginErrorBoundary';

const iconClass = 'opacity-80 shrink-0';

type ExplorerIconComponent = React.ComponentType<{ size?: number | string; className?: string }>;

// Registry of default node icons keyed by node icon kind. Adding a new node
// type is an entry here, not a new switch branch.
const EXPLORER_NODE_ICONS: Record<DatabaseExplorerIcon, ExplorerIconComponent> = {
    table: Table2,
    foreign_table: Link2,
    view: Eye,
    materialized_view: Layers,
    index: Hash,
    function: Zap,
    procedure: Zap,
    sequence: List,
    data_type: Type,
    aggregate: Sigma,
    schema: Layers,
};

export function renderIcon(icon: DatabaseExplorerIcon, size = 12): React.ReactNode {
    const Icon = EXPLORER_NODE_ICONS[icon] ?? Layers;
    return <Icon size={size} className={iconClass} />;
}

// Plugin extension point: a registered plugin renderer for the node type wins
// over the built-in rendering (callers fall back with `?? <default/>`).
export function renderDatabaseExplorerExtension(
    nodeType: string,
    node: unknown,
): React.ReactNode | null {
    const extension = pluginRegistry.getDatabaseExplorerItem(nodeType);
    if (!extension) return null;

    return (
        <PluginErrorBoundary pluginId={extension.pluginId}>
            <extension.component node={node} />
        </PluginErrorBoundary>
    );
}
