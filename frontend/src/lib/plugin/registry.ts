// SPDX-License-Identifier: GPL-3.0-only

import type {
    PluginContribution,
    PluginManifest,
    PluginCapability,
    ResolvedPluginCommand,
    ToolbarExtension,
    ResultPanelExtension,
    CellRendererExtension,
    DatabaseExplorerNodeExtension,
} from './contracts';

const CONTRIBUTION_HOST_KEY = '__zentroPluginContributions__';
const TOOLBAR_SLOTS_KEY = '__zentroPluginToolbarSlots__';
const RESULT_PANEL_EXT_KEY = '__zentroPluginResultPanelExts__';
const CELL_RENDERER_KEY = '__zentroPluginCellRenderers__';
const DATABASE_EXPLORER_NODE_KEY = '__zentroPluginDatabaseExplorerNodes__';

interface ContributionHost {
    [CONTRIBUTION_HOST_KEY]?: Map<string, PluginContribution>;
    [TOOLBAR_SLOTS_KEY]?: Map<string, ToolbarExtension>;
    [RESULT_PANEL_EXT_KEY]?: Map<string, ResultPanelExtension>;
    [CELL_RENDERER_KEY]?: CellRendererExtension[];
    [DATABASE_EXPLORER_NODE_KEY]?: Map<string, DatabaseExplorerNodeExtension>;
}

function host(): ContributionHost {
    return globalThis as ContributionHost;
}

function store(): Map<string, PluginContribution> {
    const h = host();
    if (!h[CONTRIBUTION_HOST_KEY]) {
        h[CONTRIBUTION_HOST_KEY] = new Map<string, PluginContribution>();
    }
    return h[CONTRIBUTION_HOST_KEY] as Map<string, PluginContribution>;
}

function toolbarSlotStore(): Map<string, ToolbarExtension> {
    const h = host();
    if (!h[TOOLBAR_SLOTS_KEY]) {
        h[TOOLBAR_SLOTS_KEY] = new Map<string, ToolbarExtension>();
    }
    return h[TOOLBAR_SLOTS_KEY] as Map<string, ToolbarExtension>;
}

function resultPanelExtStore(): Map<string, ResultPanelExtension> {
    const h = host();
    if (!h[RESULT_PANEL_EXT_KEY]) {
        h[RESULT_PANEL_EXT_KEY] = new Map<string, ResultPanelExtension>();
    }
    return h[RESULT_PANEL_EXT_KEY] as Map<string, ResultPanelExtension>;
}

function cellRendererStore(): CellRendererExtension[] {
    const h = host();
    if (!h[CELL_RENDERER_KEY]) {
        h[CELL_RENDERER_KEY] = [];
    }
    return h[CELL_RENDERER_KEY] as CellRendererExtension[];
}

function databaseExplorerNodeStore(): Map<string, DatabaseExplorerNodeExtension> {
    const h = host();
    if (!h[DATABASE_EXPLORER_NODE_KEY]) {
        h[DATABASE_EXPLORER_NODE_KEY] = new Map<string, DatabaseExplorerNodeExtension>();
    }
    return h[DATABASE_EXPLORER_NODE_KEY] as Map<string, DatabaseExplorerNodeExtension>;
}

export interface PluginValidationResult {
    valid: boolean;
    errors: string[];
}

export function validateManifest(manifest: PluginManifest): PluginValidationResult {
    const errors: string[] = [];
    if (!manifest.id?.trim()) errors.push('manifest.id is required');
    if (!manifest.version?.trim()) errors.push('manifest.version is required');
    if (!manifest.minAppVersion?.trim()) errors.push('manifest.minAppVersion is required');
    if (!Array.isArray(manifest.capabilities))
        errors.push('manifest.capabilities must be an array');
    return { valid: errors.length === 0, errors };
}

export function registerPluginContribution(contribution: PluginContribution): () => void {
    const check = validateManifest(contribution.manifest);
    if (!check.valid) {
        throw new Error(`Invalid plugin manifest: ${check.errors.join(', ')}`);
    }

    const pluginStore = store();
    if (pluginStore.has(contribution.manifest.id)) {
        throw new Error(`Plugin "${contribution.manifest.id}" is already registered`);
    }

    pluginStore.set(contribution.manifest.id, contribution);

    return () => {
        pluginStore.delete(contribution.manifest.id);
    };
}

export function listPluginContributions(enabledOnly?: boolean): PluginContribution[] {
    const all = [...store().values()];
    if (!enabledOnly) return all;
    return all.filter(c => {
        if (!c.manifest.id) return false;
        return !c.manifest.id.startsWith('disabled.');
    });
}

export function isPluginIdRegistered(pluginId: string): boolean {
    return store().has(pluginId);
}

export function canAccessCapability(pluginId: string, capability: PluginCapability): boolean {
    const contribution = store().get(pluginId);
    return contribution?.manifest.capabilities.includes(capability) ?? false;
}

export function listByCapability(capability: PluginCapability): PluginContribution[] {
    return listPluginContributions().filter(item =>
        item.manifest.capabilities.includes(capability),
    );
}

export function resolvePluginCommands(
    handlerResolver: (pluginId: string, handlerKey: string) => () => void | Promise<void>,
): ResolvedPluginCommand[] {
    const out: ResolvedPluginCommand[] = [];
    for (const contribution of listByCapability('ui.commands')) {
        const commands = contribution.commands ?? [];
        for (const command of commands) {
            out.push({
                pluginId: contribution.manifest.id,
                entry: {
                    id: command.id,
                    label: command.title,
                    category: command.category,
                    defaultBinding: command.defaultBinding,
                    defaultWhen: command.defaultWhen,
                    action: handlerResolver(contribution.manifest.id, command.handlerKey),
                },
            });
        }
    }
    return out;
}

export function resolvePluginCommandsSafe(
    handlerResolver: (pluginId: string, handlerKey: string) => () => void | Promise<void>,
): ResolvedPluginCommand[] {
    const out: ResolvedPluginCommand[] = [];
    for (const contribution of listByCapability('ui.commands')) {
        const commands = contribution.commands ?? [];
        for (const command of commands) {
            let action: () => void | Promise<void>;
            try {
                action = handlerResolver(contribution.manifest.id, command.handlerKey);
            } catch {
                action = () => {
                    console.error(
                        `[plugin:${contribution.manifest.id}] handler "${command.handlerKey}" not found`,
                    );
                };
            }
            out.push({
                pluginId: contribution.manifest.id,
                entry: {
                    id: command.id,
                    label: command.title,
                    category: command.category,
                    defaultBinding: command.defaultBinding,
                    defaultWhen: command.defaultWhen,
                    action,
                },
            });
        }
    }
    return out;
}

/* ── Extension Point Registry ───────────────────────────── */

export function registerToolbarItem(extension: ToolbarExtension): () => void {
    const id = `${extension.slot}::${crypto.randomUUID()}`;
    const slotStore = toolbarSlotStore();
    slotStore.set(id, extension);
    return () => {
        slotStore.delete(id);
    };
}

export function getToolbarItems(slot: ToolbarExtension['slot']): ToolbarExtension[] {
    return Array.from(toolbarSlotStore().values())
        .filter(item => item.slot === slot && (!item.isEnabled || item.isEnabled()))
        .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
}

export function registerResultPanelExtension(extension: ResultPanelExtension): () => void {
    const extStore = resultPanelExtStore();
    extStore.set(extension.resultType, extension);
    return () => {
        extStore.delete(extension.resultType);
    };
}

export function getResultPanelExtension(resultType: string): ResultPanelExtension | undefined {
    return resultPanelExtStore().get(resultType);
}

export function registerCellRenderer(extension: CellRendererExtension): () => void {
    const renderers = cellRendererStore();
    renderers.push(extension);
    return () => {
        const idx = renderers.indexOf(extension);
        if (idx !== -1) renderers.splice(idx, 1);
    };
}

export function getCellRenderer(dataType: string): CellRendererExtension | undefined {
    return cellRendererStore()
        .slice()
        .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
        .find(ext => {
            if (ext.dataType instanceof RegExp) return ext.dataType.test(dataType);
            return ext.dataType === dataType;
        });
}

export function registerDatabaseExplorerNodeExtension(
    extension: DatabaseExplorerNodeExtension,
): () => void {
    const nodeStore = databaseExplorerNodeStore();
    nodeStore.set(extension.nodeType, extension);
    return () => {
        nodeStore.delete(extension.nodeType);
    };
}

export function getDatabaseExplorerNodeExtension(
    nodeType: string,
): DatabaseExplorerNodeExtension | undefined {
    return databaseExplorerNodeStore().get(nodeType);
}
