// SPDX-License-Identifier: GPL-3.0-only

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import {
    AlertTriangle,
    CircleHelp,
    Database,
    FileCode2,
    Layers,
    Loader2,
    RefreshCw,
    Split,
    Settings2,
} from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';
import type { TabQueryContext } from '../../stores/editor/types';
import { useSettingsStore } from '../../stores/settingsStore';
import { TAB_TYPE } from '../../lib/constants';
import { FEATURE } from '../../lib/license/entitlementMatrix';
import {
    Button,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch,
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '../../components/ui';
import { useFeatureGate } from '../../lib/license/useFeatureGate';
import { cn } from '../../lib/cn';
import { getEnvironmentBgClass, getEnvironmentOrderIndex } from '../../lib/projects';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../shared/kernel';
import type {
    SchemaDiffSource,
    SchemaMigrationResult,
    SchemaSnapshot,
    SchemaIndexSnapshot,
    SchemaConstraintSnapshot,
} from '../../types/schemaDiff';
import { useToast } from '../../components/layout/Toast';
import { getErrorMessage } from '../../lib/errors';
import { useProjectStore } from '../../stores/projectStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useSchemaStore } from '../../stores/schemaStore';
import {
    buildSchemaDiffEnvironmentChoices,
    buildSchemaDiffSource,
    SCHEMA_DIFF_FALLBACK_SCHEMA,
} from '../../lib/schemaDiffSourceOptions';
import type { EnvironmentKey } from '../../types/project';
import { useMonacoTheme } from '../../lib/theme';

interface DiffOptions {
    tables: boolean;
    indexes: boolean;
    constraints: boolean;
    views: boolean;
    routines: boolean;
}

const DIFF_FILTER_KEYS = ['views', 'indexes', 'constraints', 'routines'] as const;

const DIFF_FILTER_HELP: Partial<Record<(typeof DIFF_FILTER_KEYS)[number], string>> = {
    routines: 'Routines include stored procedures and functions saved in the database schema.',
};

function buildNormalizedDDL(snapshot: SchemaSnapshot | undefined, options: DiffOptions): string {
    if (!snapshot) return '';
    const parts: string[] = [];
    const schemaName = snapshot.schemaName || '';

    // Group indexes and constraints by table
    const indexesByTable: Record<string, SchemaIndexSnapshot[]> = {};
    if (options.indexes && snapshot.indexes) {
        snapshot.indexes.forEach(idx => {
            if (!indexesByTable[idx.tableName]) {
                indexesByTable[idx.tableName] = [];
            }
            indexesByTable[idx.tableName].push(idx);
        });
    }

    const constraintsByTable: Record<string, SchemaConstraintSnapshot[]> = {};
    if (options.constraints && snapshot.constraints) {
        snapshot.constraints.forEach(c => {
            if (!constraintsByTable[c.tableName]) {
                constraintsByTable[c.tableName] = [];
            }
            constraintsByTable[c.tableName].push(c);
        });
    }

    const printedConstraints = new Set<string>();
    const printedIndexes = new Set<string>();

    if (snapshot.tables) {
        snapshot.tables.forEach(table => {
            const tableBlock: string[] = [];

            if (options.tables) {
                const ddl = (table.ddl || '').trim().replace(/\r\n/g, '\n');
                if (ddl) {
                    tableBlock.push(
                        `-- Table: ${schemaName}.${table.name}\n${ddl.endsWith(';') ? ddl : ddl + ';'}`,
                    );
                }
            }

            if (options.constraints) {
                const tableConstraints = constraintsByTable[table.name] || [];
                tableConstraints.forEach(c => {
                    const cddl = (c.ddl || '').trim().replace(/\r\n/g, '\n');
                    if (cddl) {
                        tableBlock.push(
                            `-- Constraint: ${c.name}\n${cddl.endsWith(';') ? cddl : cddl + ';'}`,
                        );
                        printedConstraints.add(c.name);
                    }
                });
            }

            if (options.indexes) {
                const tableIndexes = indexesByTable[table.name] || [];
                tableIndexes.forEach(idx => {
                    const iddl = (idx.ddl || '').trim().replace(/\r\n/g, '\n');
                    if (iddl) {
                        tableBlock.push(
                            `-- Index: ${idx.name}\n${iddl.endsWith(';') ? iddl : iddl + ';'}`,
                        );
                        printedIndexes.add(idx.name);
                    }
                });
            }

            if (tableBlock.length > 0) {
                if (!options.tables) {
                    tableBlock.unshift(`-- Table Context: ${schemaName}.${table.name}`);
                }
                parts.push(tableBlock.join('\n\n'));
            }
        });
    }

    // Fallback for any constraints/indexes that were not printed (e.g. table not found in snapshot.tables)
    if (options.constraints && snapshot.constraints) {
        snapshot.constraints.forEach(c => {
            if (!printedConstraints.has(c.name)) {
                const cddl = (c.ddl || '').trim().replace(/\r\n/g, '\n');
                if (cddl) {
                    parts.push(
                        `-- Constraint: ${c.name}\n${cddl.endsWith(';') ? cddl : cddl + ';'}`,
                    );
                }
            }
        });
    }

    if (options.indexes && snapshot.indexes) {
        snapshot.indexes.forEach(idx => {
            if (!printedIndexes.has(idx.name)) {
                const iddl = (idx.ddl || '').trim().replace(/\r\n/g, '\n');
                if (iddl) {
                    parts.push(`-- Index: ${idx.name}\n${iddl.endsWith(';') ? iddl : iddl + ';'}`);
                }
            }
        });
    }

    if (options.views && snapshot.views) {
        snapshot.views.forEach(view => {
            const ddl = (view.ddl || '').trim().replace(/\r\n/g, '\n');
            parts.push(
                `-- View: ${schemaName}.${view.name}\n${ddl.endsWith(';') ? ddl : ddl + ';'}`,
            );
        });
    }

    if (options.routines && snapshot.routines) {
        snapshot.routines.forEach(routine => {
            const ddl = (routine.ddl || '').trim().replace(/\r\n/g, '\n');
            parts.push(
                `-- Routine: ${schemaName}.${routine.name}\n${ddl.endsWith(';') ? ddl : ddl + ';'}`,
            );
        });
    }

    return parts.join('\n\n');
}

interface SchemaDiffTabProps {
    tabId: string;
}

function hasSameSnapshotSource(source?: SchemaDiffSource, snapshot?: SchemaSnapshot): boolean {
    if (!source || !snapshot) return false;
    // Legacy snapshots created before schema-diff object mapping was fixed may miss
    // non-table collections entirely. Force a refetch so views/indexes/etc appear.
    if (
        !Array.isArray(snapshot.tables) ||
        !Array.isArray(snapshot.indexes) ||
        !Array.isArray(snapshot.constraints) ||
        !Array.isArray(snapshot.views) ||
        !Array.isArray(snapshot.routines)
    ) {
        return false;
    }
    return (
        source.profileName === snapshot.profileName &&
        source.databaseName === snapshot.databaseName &&
        source.schemaName === snapshot.schemaName
    );
}

function getSourcePlaceholder(side: 'left' | 'right') {
    return side === 'left' ? 'Select desired schema' : 'Select current schema';
}

interface InlineSchemaDiffSourcePickerProps {
    side: 'left' | 'right';
    source?: SchemaDiffSource;
    loadingSnapshot: boolean;
    disabled: boolean;
    onChangeSource: (source: SchemaDiffSource) => void;
    minAllowedOrderIndex?: number;
    maxAllowedOrderIndex?: number;
}

const InlineSchemaDiffSourcePicker: React.FC<InlineSchemaDiffSourcePickerProps> = ({
    side,
    source,
    loadingSnapshot,
    disabled,
    onChangeSource,
    minAllowedOrderIndex,
    maxAllowedOrderIndex,
}) => {
    const { toast } = useToast();
    const activeProject = useProjectStore(state => state.activeProject);
    const loadedConnections = useConnectionStore(state => state.connections);
    const setLoading = useSchemaStore(state => state.setLoading);
    const environmentChoices = useMemo(() => {
        let choices = buildSchemaDiffEnvironmentChoices(activeProject, loadedConnections);
        if (minAllowedOrderIndex !== undefined) {
            choices = choices.filter(
                c => getEnvironmentOrderIndex(c.environmentKey) >= minAllowedOrderIndex,
            );
        }
        if (maxAllowedOrderIndex !== undefined) {
            choices = choices.filter(
                c => getEnvironmentOrderIndex(c.environmentKey) <= maxAllowedOrderIndex,
            );
        }
        return choices;
    }, [activeProject, loadedConnections, minAllowedOrderIndex, maxAllowedOrderIndex]);
    const selectedEnvironmentKey =
        (typeof source?.environmentKey === 'string' && source.environmentKey) ||
        environmentChoices[0]?.environmentKey ||
        '';
    const selectedEnvironment =
        environmentChoices.find(option => option.environmentKey === selectedEnvironmentKey) || null;
    const schemaProfileName = selectedEnvironment?.profileName || '';
    const schemaDbName = selectedEnvironment?.databaseName || '';
    const schemaTreeKey = `${schemaProfileName}:${schemaDbName}`;
    const schemas = useSchemaStore(state =>
        schemaProfileName && schemaDbName ? state.trees[schemaTreeKey] : undefined,
    );
    const schemaLoading = useSchemaStore(state =>
        schemaProfileName && schemaDbName ? state.loadingKeys.has(schemaTreeKey) : false,
    );

    const availableSchemaNames = useMemo(() => {
        if (!schemas || schemas.length === 0) return [];
        return Array.from(new Set(schemas.map(schema => schema.Name).filter(Boolean))).sort(
            (left, right) => left.localeCompare(right),
        );
    }, [schemas]);

    useEffect(() => {
        if (!schemaProfileName || !schemaDbName || schemas || schemaLoading) return;
        setLoading(schemaProfileName, schemaDbName, true);
        getApiGateway()
            .schema.fetchDatabaseSchema(schemaProfileName, schemaDbName)
            .then(unwrapOrThrow)
            .catch(error => {
                setLoading(schemaProfileName, schemaDbName, false);
                toast.error(`Failed to load schema: ${getErrorMessage(error)}`);
            });
    }, [schemaDbName, schemaLoading, schemaProfileName, schemas, setLoading, toast]);

    const schemaValue = source?.schemaName || '';

    return (
        <div
            className={cn(
                'flex w-full min-w-0 items-center gap-0.5 sm:gap-1 rounded-md px-1 py-1 transition-colors',
                getEnvironmentBgClass(selectedEnvironmentKey) || 'bg-transparent',
            )}
        >
            <Select
                value={selectedEnvironmentKey}
                onValueChange={value => {
                    const nextEnvironment = environmentChoices.find(
                        option => option.environmentKey === value,
                    );
                    if (!nextEnvironment) return;
                    onChangeSource(
                        buildSchemaDiffSource(
                            nextEnvironment,
                            nextEnvironment.schemaName || SCHEMA_DIFF_FALLBACK_SCHEMA,
                        ),
                    );
                }}
                disabled={disabled || environmentChoices.length === 0}
            >
                <SelectTrigger
                    aria-label={`Select ${side} environment`}
                    className='flex h-8 min-w-0 border-0 bg-transparent px-1.5 sm:px-2 font-medium text-body! shadow-none ui-interactive-surface focus:ring-0'
                >
                    <div className='inline-flex min-w-0 items-center gap-1.5'>
                        <Database size={13} className='shrink-0 text-muted-foreground' />
                        <div className='min-w-0 text-left leading-tight'>
                            <div className='truncate'>
                                <SelectValue placeholder='Env' />
                            </div>
                        </div>
                    </div>
                </SelectTrigger>
                <SelectContent>
                    {environmentChoices.map(option => (
                        <SelectItem key={option.environmentKey} value={option.environmentKey}>
                            <div className='min-w-0 leading-tight flex justify-between gap-2'>
                                <div className='truncate'>{option.environmentLabel}</div>
                                <div className='truncate text-caption text-muted-foreground'>
                                    {option.databaseName || 'No DB'}
                                </div>
                            </div>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Select
                value={schemaValue}
                onValueChange={value => {
                    if (!selectedEnvironment) return;
                    onChangeSource(buildSchemaDiffSource(selectedEnvironment, value));
                }}
                disabled={
                    disabled ||
                    !selectedEnvironment ||
                    !selectedEnvironment.profileName ||
                    !selectedEnvironment.databaseName ||
                    schemaLoading ||
                    availableSchemaNames.length === 0
                }
            >
                <SelectTrigger
                    aria-label={`Select ${side} schema`}
                    className='flex h-8 min-w-0 border-0 bg-transparent px-1.5 sm:px-2 font-medium text-body! shadow-none ui-interactive-surface focus:ring-0'
                >
                    <div className='inline-flex min-w-0 items-center gap-1.5'>
                        <Layers size={13} className='shrink-0 text-muted-foreground' />
                        <span className='truncate'>
                            <SelectValue
                                placeholder={
                                    schemaLoading
                                        ? 'Loading...'
                                        : availableSchemaNames.length === 0
                                          ? 'None'
                                          : 'Schema'
                                }
                            />
                        </span>
                    </div>
                </SelectTrigger>
                <SelectContent>
                    {availableSchemaNames.map(schemaName => (
                        <SelectItem key={schemaName} value={schemaName}>
                            {schemaName}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {loadingSnapshot || schemaLoading ? (
                <Loader2 size={13} className='ml-1 shrink-0 animate-spin text-muted-foreground' />
            ) : null}
        </div>
    );
};

export const SchemaDiffTab: React.FC<SchemaDiffTabProps> = ({ tabId }) => {
    const { groups, updateTabContext, addTab, renameTab, setActiveTabId, setTabQuery } =
        useEditorStore();
    const activeProject = useProjectStore(state => state.activeProject);
    const featureGate = useFeatureGate();
    const theme = useSettingsStore(state => state.theme);
    const monacoTheme = useMonacoTheme(theme);
    const { toast } = useToast();
    const canUseSchemaDiff = featureGate.canUse(FEATURE.SCHEMA_DIFF_BASIC);

    const compareTab = useMemo(
        () => groups.flatMap(group => group.tabs).find(tab => tab.id === tabId),
        [groups, tabId],
    );
    const compareContext = compareTab?.context;

    const leftSource = compareContext?.schemaDiffLeftSource;
    const rightSource = compareContext?.schemaDiffRightSource;
    const leftSnapshot = compareContext?.schemaDiffLeftSnapshot;
    const rightSnapshot = compareContext?.schemaDiffRightSnapshot;
    const migration = compareContext?.schemaDiffMigration;

    const [showUnified, setShowUnified] = useState(compareContext?.schemaDiffShowUnified || false);
    const [ignoreWhitespace, setIgnoreWhitespace] = useState(
        compareContext?.schemaDiffIgnoreWhitespace || false,
    );
    const [diffOptions, setDiffOptions] = useState<DiffOptions>({
        tables: true,
        indexes: compareContext?.schemaDiffOptions?.indexes ?? true,
        constraints: compareContext?.schemaDiffOptions?.constraints ?? true,
        views: compareContext?.schemaDiffOptions?.views ?? true,
        routines: compareContext?.schemaDiffOptions?.routines ?? true,
    });
    const [loadingSide, setLoadingSide] = useState<{ left: boolean; right: boolean }>({
        left: false,
        right: false,
    });
    const [generatingMigration, setGeneratingMigration] = useState(false);
    const [sourceErrors, setSourceErrors] = useState<{ left?: string; right?: string }>({});

    const originalRef = useRef<MonacoEditor.ICodeEditor | null>(null);
    const modifiedRef = useRef<MonacoEditor.ICodeEditor | null>(null);
    const diffEditorRef = useRef<MonacoEditor.IStandaloneDiffEditor | null>(null);
    const syncingRef = useRef(false);

    useEffect(() => {
        setShowUnified(compareContext?.schemaDiffShowUnified || false);
        setIgnoreWhitespace(compareContext?.schemaDiffIgnoreWhitespace || false);
        setDiffOptions({
            tables: true,
            indexes: compareContext?.schemaDiffOptions?.indexes ?? true,
            constraints: compareContext?.schemaDiffOptions?.constraints ?? true,
            views: compareContext?.schemaDiffOptions?.views ?? true,
            routines: compareContext?.schemaDiffOptions?.routines ?? true,
        });
    }, [
        compareContext?.schemaDiffIgnoreWhitespace,
        compareContext?.schemaDiffShowUnified,
        compareContext?.schemaDiffOptions,
        tabId,
    ]);

    useEffect(() => {
        return () => {
            diffEditorRef.current?.dispose();
            diffEditorRef.current = null;
            originalRef.current = null;
            modifiedRef.current = null;
        };
    }, []);

    // Keep tab name in sync with selected sources
    useEffect(() => {
        if (leftSource && rightSource) {
            const leftDb = leftSource.databaseName || 'unknown';
            const rightDb = rightSource.databaseName || 'unknown';
            const leftSchema = leftSource.schemaName || 'public';
            const rightSchema = rightSource.schemaName || 'public';
            renameTab(
                tabId,
                `Schema Diff ${leftDb}.${leftSchema} \u2192 ${rightDb}.${rightSchema}`,
            );
        }
    }, [
        leftSource?.databaseName,
        leftSource?.schemaName,
        rightSource?.databaseName,
        rightSource?.schemaName,
        tabId,
        renameTab,
    ]);

    useEffect(() => {
        if (!compareTab?.id) return;
        const t = setTimeout(() => {
            updateTabContext(tabId, {
                schemaDiffShowUnified: showUnified,
                schemaDiffIgnoreWhitespace: ignoreWhitespace,
                schemaDiffOptions: diffOptions,
            });
        }, 500);
        return () => clearTimeout(t);
    }, [ignoreWhitespace, showUnified, diffOptions, tabId, updateTabContext]);

    const refreshSnapshot = React.useCallback(
        async (side: 'left' | 'right', source?: SchemaDiffSource) => {
            if (!compareTab?.id || !source) return;
            setLoadingSide(prev => ({ ...prev, [side]: true }));
            setSourceErrors(prev => ({ ...prev, [side]: undefined }));
            try {
                const snapshot = unwrapOrThrow(
                    await getApiGateway().schema.fetchSchemaSnapshot(
                        source.profileName,
                        source.databaseName,
                        source.schemaName,
                    ),
                );
                updateTabContext(compareTab.id, {
                    [side === 'left' ? 'schemaDiffLeftSnapshot' : 'schemaDiffRightSnapshot']:
                        snapshot,
                    schemaDiffMigration: undefined,
                });
            } catch (error) {
                const message = getErrorMessage(error);
                setSourceErrors(prev => ({ ...prev, [side]: message }));
            } finally {
                setLoadingSide(prev => ({ ...prev, [side]: false }));
            }
        },
        [compareTab?.id, updateTabContext],
    );

    useEffect(() => {
        if (leftSource && !hasSameSnapshotSource(leftSource, leftSnapshot)) {
            void refreshSnapshot('left', leftSource);
        }
    }, [leftSnapshot, leftSource, refreshSnapshot]);

    useEffect(() => {
        if (rightSource && !hasSameSnapshotSource(rightSource, rightSnapshot)) {
            void refreshSnapshot('right', rightSource);
        }
    }, [refreshSnapshot, rightSnapshot, rightSource]);

    const normalizeText = React.useCallback(
        (sql: string) => {
            const lf = sql.replace(/\r\n/g, '\n');
            if (!ignoreWhitespace) return lf;
            return lf
                .split('\n')
                .map(line => line.trim().replace(/\s+/g, ' '))
                .filter(line => line.length > 0)
                .join('\n');
        },
        [ignoreWhitespace],
    );

    const leftText = normalizeText(
        leftSnapshot
            ? buildNormalizedDDL(leftSnapshot, diffOptions) ||
                  '-- No matching objects found or selected --'
            : sourceErrors.left || getSourcePlaceholder('left'),
    );
    const rightText = normalizeText(
        rightSnapshot
            ? buildNormalizedDDL(rightSnapshot, diffOptions) ||
                  '-- No matching objects found or selected --'
            : sourceErrors.right || getSourcePlaceholder('right'),
    );

    const canGenerateMigration =
        Boolean(leftSnapshot && rightSnapshot) &&
        leftSnapshot?.supported === true &&
        rightSnapshot?.supported === true &&
        canUseSchemaDiff;

    useEffect(() => {
        const editor = diffEditorRef.current;
        if (!editor) return;

        const rafId = window.requestAnimationFrame(() => {
            editor.layout();
        });

        return () => {
            window.cancelAnimationFrame(rafId);
        };
    }, [ignoreWhitespace, leftText, rightText, showUnified]);

    const handleChangeSource = React.useCallback(
        (side: 'left' | 'right', nextSource: SchemaDiffSource) => {
            const currentSource = side === 'left' ? leftSource : rightSource;
            if (
                currentSource?.environmentKey === nextSource.environmentKey &&
                currentSource?.profileName === nextSource.profileName &&
                currentSource?.databaseName === nextSource.databaseName &&
                currentSource?.schemaName === nextSource.schemaName
            ) {
                return;
            }
            updateTabContext(tabId, {
                [side === 'left' ? 'schemaDiffLeftSource' : 'schemaDiffRightSource']: nextSource,
                [side === 'left' ? 'schemaDiffLeftSnapshot' : 'schemaDiffRightSnapshot']: undefined,
                schemaDiffMigration: undefined,
            });
            if (typeof nextSource.environmentKey === 'string') {
                void useProjectStore
                    .getState()
                    .setEnvironmentLastSchema(
                        nextSource.environmentKey as EnvironmentKey,
                        nextSource.schemaName,
                    );
            }
        },
        [leftSource, rightSource, tabId, updateTabContext],
    );

    const handleGenerateMigration = React.useCallback(async () => {
        if (!leftSnapshot || !rightSnapshot) return;
        setGeneratingMigration(true);
        try {
            const result = unwrapOrThrow(
                await getApiGateway().schema.generateSchemaMigration(leftSnapshot, rightSnapshot),
            );
            updateTabContext(tabId, {
                schemaDiffMigration: result,
            });
            if (!result.supported && result.unsupportedMessage) {
                toast.error(result.unsupportedMessage);
                return;
            }
            toast.success('Migration script generated');
        } catch (error) {
            toast.error(`Generate migration failed: ${getErrorMessage(error)}`);
        } finally {
            setGeneratingMigration(false);
        }
    }, [leftSnapshot, rightSnapshot, tabId, toast, updateTabContext]);

    const handleOpenMigrationTab = React.useCallback(() => {
        if (!migration?.sql.trim()) return;

        const leftEnv = activeProject?.environments?.find(
            e => e.key === leftSource?.environmentKey,
        );
        const rightEnv = activeProject?.environments?.find(
            e => e.key === rightSource?.environmentKey,
        );

        const leftDb = leftSource?.databaseName || 'unknown';
        const rightDb = rightSource?.databaseName || 'unknown';
        const leftSchema = leftSource?.schemaName || 'public';
        const rightSchema = rightSource?.schemaName || 'public';

        const leftName = `${leftDb}.${leftSchema}`;
        const rightName = `${rightDb}.${rightSchema}`;

        const leftEnvName = leftEnv?.label || leftSource?.profileName || 'unknown';
        const rightEnvName = rightEnv?.label || rightSource?.profileName || 'unknown';

        const comment = `-- Migration from ${leftName} env ${leftEnvName} to ${rightName} env ${rightEnvName}\n\n`;
        const tabName = `Migration ${leftName} \u2192 ${rightName}`;
        const newQuery = comment + migration.sql;

        let existingTabId: string | undefined;
        let existingGroupId: string | undefined;

        for (const group of groups) {
            const found = group.tabs.find(t => t.name === tabName);
            if (found) {
                existingTabId = found.id;
                existingGroupId = group.id;
                break;
            }
        }

        if (existingTabId && existingGroupId) {
            setTabQuery(existingTabId, newQuery);
            setActiveTabId(existingTabId, existingGroupId);
        } else {
            addTab({
                type: TAB_TYPE.QUERY,
                name: tabName,
                query: newQuery,
            });
        }
    }, [
        activeProject,
        addTab,
        leftSource,
        migration?.sql,
        rightSource,
        groups,
        setTabQuery,
        setActiveTabId,
    ]);

    const migrationWarnings = migration?.warnings || [];
    const migrationSql = migration?.sql || '';

    const leftEnvIndex = leftSource?.environmentKey
        ? getEnvironmentOrderIndex(leftSource.environmentKey as EnvironmentKey)
        : undefined;
    const rightEnvIndex = rightSource?.environmentKey
        ? getEnvironmentOrderIndex(rightSource.environmentKey as EnvironmentKey)
        : undefined;

    return (
        <div className='flex h-full min-h-0 flex-col bg-card'>
            <div className='border-b border-border bg-background/40 py-2'>
                <div className='grid w-full grid-cols-[1fr_auto_1fr] items-center gap-4'>
                    <div className='flex w-full min-w-0 items-center justify-start'>
                        <InlineSchemaDiffSourcePicker
                            side='left'
                            source={leftSource}
                            loadingSnapshot={loadingSide.left}
                            disabled={!canUseSchemaDiff}
                            onChangeSource={nextSource => handleChangeSource('left', nextSource)}
                            maxAllowedOrderIndex={rightEnvIndex}
                        />
                    </div>

                    <div className='flex shrink-0 items-center justify-center gap-1.5 text-small text-muted-foreground'>
                        <HoverCard openDelay={200} closeDelay={200}>
                            <HoverCardTrigger asChild>
                                <Button
                                    variant='ghost'
                                    size='sm'
                                    className='h-7 w-7 p-0 ui-interactive-surface'
                                >
                                    <Settings2 size={14} className='text-muted-foreground' />
                                </Button>
                            </HoverCardTrigger>
                            <HoverCardContent align='center' sideOffset={8} className='w-56 p-3'>
                                <div className='flex flex-col gap-3'>
                                    <div className='mb-1 text-small font-medium text-foreground'>
                                        View Settings
                                    </div>
                                    <label className='flex cursor-pointer items-center justify-between gap-1.5 whitespace-nowrap ui-interactive-surface'>
                                        <span className='text-muted-foreground'>
                                            Normalize whitespace
                                        </span>
                                        <Switch
                                            checked={ignoreWhitespace}
                                            onCheckedChange={setIgnoreWhitespace}
                                            aria-label='Normalize whitespace'
                                        />
                                    </label>
                                    <label className='flex cursor-pointer items-center justify-between gap-1.5 whitespace-nowrap ui-interactive-surface'>
                                        <span className='text-muted-foreground'>Unified Diff</span>
                                        <Switch
                                            checked={showUnified}
                                            onCheckedChange={setShowUnified}
                                            aria-label='Unified diff'
                                        />
                                    </label>

                                    <div className='my-1 border-t border-border/60' />

                                    <div className='mb-1 text-small font-medium text-foreground'>
                                        Object Filters
                                    </div>
                                    <TooltipProvider delayDuration={150}>
                                        {DIFF_FILTER_KEYS.map(key => (
                                            <label
                                                key={key}
                                                className='flex cursor-pointer items-center justify-between gap-1.5 whitespace-nowrap ui-interactive-surface capitalize'
                                            >
                                                <span className='flex items-center gap-1 text-muted-foreground'>
                                                    <span>{key}</span>
                                                    {DIFF_FILTER_HELP[key] ? (
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button
                                                                    type='button'
                                                                    variant='ghost'
                                                                    size='sm'
                                                                    className='h-4 w-4 rounded-full p-0 text-muted-foreground/80 hover:bg-transparent ui-interactive-surface'
                                                                    aria-label={`What are ${key}?`}
                                                                    onClick={event =>
                                                                        event.preventDefault()
                                                                    }
                                                                >
                                                                    <CircleHelp size={12} />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent className='max-w-56 normal-case text-label'>
                                                                {DIFF_FILTER_HELP[key]}
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    ) : null}
                                                </span>
                                                <Switch
                                                    checked={diffOptions[key]}
                                                    onCheckedChange={checked => {
                                                        setDiffOptions(prev => ({
                                                            ...prev,
                                                            [key]: checked,
                                                        }));
                                                    }}
                                                    aria-label={`Toggle ${key}`}
                                                />
                                            </label>
                                        ))}
                                    </TooltipProvider>
                                </div>
                            </HoverCardContent>
                        </HoverCard>
                        <Button
                            variant='ghost'
                            size='sm'
                            className='h-7 w-7 p-0 text-muted-foreground ui-interactive-surface'
                            onClick={() => {
                                if (leftSource) void refreshSnapshot('left', leftSource);
                                if (rightSource) void refreshSnapshot('right', rightSource);
                            }}
                            disabled={loadingSide.left || loadingSide.right}
                            title='Refresh diff'
                        >
                            <RefreshCw
                                size={13}
                                className={cn(
                                    (loadingSide.left || loadingSide.right) && 'animate-spin',
                                )}
                            />
                        </Button>
                    </div>

                    <div className='flex w-full min-w-0 items-center justify-start'>
                        <InlineSchemaDiffSourcePicker
                            side='right'
                            source={rightSource}
                            loadingSnapshot={loadingSide.right}
                            disabled={!canUseSchemaDiff}
                            onChangeSource={nextSource => handleChangeSource('right', nextSource)}
                            minAllowedOrderIndex={leftEnvIndex}
                        />
                    </div>
                </div>

                {!canUseSchemaDiff && (
                    <div className='mt-2 text-center text-label text-warning'>
                        Schema diff is not available for this license policy.
                    </div>
                )}
            </div>

            <div className='min-h-0 flex-1 relative'>
                {leftSnapshot && rightSnapshot && !loadingSide.left && !loadingSide.right ? (
                    <DiffEditor
                        height='100%'
                        original={leftText}
                        modified={rightText}
                        language='sql'
                        theme={monacoTheme}
                        options={{
                            automaticLayout: true,
                            minimap: { enabled: false },
                            renderOverviewRuler: true,
                            renderSideBySide: !showUnified,
                            scrollBeyondLastLine: false,
                            ignoreTrimWhitespace: ignoreWhitespace,
                            readOnly: true,
                        }}
                        onMount={(editor: MonacoEditor.IStandaloneDiffEditor) => {
                            diffEditorRef.current = editor;
                            originalRef.current = editor.getOriginalEditor();
                            modifiedRef.current = editor.getModifiedEditor();
                        }}
                    />
                ) : loadingSide.left || loadingSide.right ? (
                    <div className='absolute inset-0 flex flex-col items-center justify-center bg-card/10 text-center p-8'>
                        <Loader2 size={36} className='animate-spin text-primary mb-4' />
                        <h3 className='text-large font-medium text-foreground mb-1'>
                            Extracting Schemas...
                        </h3>
                        <p className='text-caption text-muted-foreground max-w-xs'>
                            Retrieving catalog, tables, columns, indexes, and routines definitions.
                            This may take a moment.
                        </p>
                    </div>
                ) : (
                    <div className='absolute inset-0 flex flex-col items-center justify-center bg-card/30 text-center p-8 border border-dashed border-border/60 rounded-md m-4'>
                        <div className='ui-icon-primary p-4 mb-4 border border-primary/20 shadow-[0_0_15px_rgba(var(--primary-rgb),0.15)] animate-pulse'>
                            <Split size={32} />
                        </div>
                        <h3 className='text-large font-semibold text-foreground mb-2'>
                            Schema Comparison
                        </h3>
                        <p className='text-body text-muted-foreground max-w-md mb-6 leading-relaxed'>
                            Select the databases and schemas on the left and right panels above to
                            visualize schema differences, analyze warnings, and generate standard
                            SQL migration scripts.
                        </p>
                        <div className='flex gap-6 text-caption text-muted-foreground/80 bg-background/50 px-4 py-3 rounded border border-border/40'>
                            <div className='flex items-center gap-1.5'>
                                <Database size={13} className='text-primary' />
                                <span>1. Choose Environment & DB</span>
                            </div>
                            <div className='flex items-center gap-1.5'>
                                <Layers size={13} className='text-primary' />
                                <span>2. Choose Schema</span>
                            </div>
                            <div className='flex items-center gap-1.5'>
                                <Split size={13} className='text-primary' />
                                <span>3. Compare & Sync</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className='bg-background/60 py-1'>
                <div className='mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-3'>
                    {migrationWarnings.length > 0 && (
                        <div className='rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-small text-warning'>
                            <div className='mb-1 flex items-center gap-1.5 font-medium'>
                                <AlertTriangle size={13} />
                                Migration warnings
                            </div>
                            {migrationWarnings.map(warning => (
                                <div key={warning}>{warning}</div>
                            ))}
                        </div>
                    )}
                    <div className='flex items-center gap-2'>
                        <Button
                            variant='secondary'
                            onClick={() => void handleGenerateMigration()}
                            disabled={!canGenerateMigration || generatingMigration}
                        >
                            {generatingMigration ? (
                                <Loader2 size={13} className='mr-1.5 animate-spin' />
                            ) : null}
                            Generate Migration
                        </Button>
                        <Button
                            variant='default'
                            onClick={handleOpenMigrationTab}
                            disabled={!migrationSql.trim()}
                        >
                            Open in Query Tab
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
