// SPDX-License-Identifier: GPL-3.0-only

/**
 * Public editor-domain API for modules outside `features/editor`.
 *
 * Use this barrel when another feature, app-level hook, or shell component
 * needs editor orchestration hooks or facade components without depending on
 * `features/editor` implementation paths.
 */
export { MonacoEditorWrapper } from './MonacoEditor';
export { QueryGroup } from './QueryGroup';
export { QueryTabs } from './QueryTabs';
export { EditorSchemaSelect } from './EditorSchemaSelect';
export { TabBar } from './TabBar';
export { TableInfo } from './TableInfo';
export { CatalogInfoView } from './CatalogInfoView';
export { GitDiffView } from './GitDiffView';
export { SchemaDiffTab } from './SchemaDiffTab';
export { saveQueryTabById } from './scriptAutosave';
export { useQueryTabAutosave } from './useQueryTabAutosave';
export { useResultFilterEscapeClear } from './useResultFilterEscapeClear';
export { useResultFilterTooltip } from './useResultFilterTooltip';
export { useResultPanelCount } from './useResultPanelCount';
export { useResultPanelKeyboardShortcuts } from './useResultPanelKeyboardShortcuts';
export { useResultPanelScriptActions } from './useResultPanelScriptActions';
export { useTabCycling } from './useTabCycling';
export { useTabExecution } from './useTabExecution';
export { registerBottomPanel, unregisterBottomPanel } from './resultPanel/bottomPanelRegistry';
export type { BottomPanelDefinition } from './resultPanel/bottomPanelRegistry';

export {
    createQueryTab,
    createSettingsTab,
    createShortcutsTab,
    createTableTab,
    createCatalogTab,
    createCompareTab,
    createGitDiffTab,
    createScriptTab,
    createExplainTab,
    createReadOnlyQueryTab,
    registerTabFactory,
    resolveTabFactory,
} from '../../lib/tabFactory';
export type { TabFactory } from '../../lib/tabFactory';
