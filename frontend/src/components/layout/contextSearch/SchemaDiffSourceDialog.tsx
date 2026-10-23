// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

import { getApiGateway } from '../../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../../shared/kernel';
import { useConnectionStore } from '../../../stores/connectionStore';
import { useEditorStore } from '../../../stores/editorStore';
import { useProjectStore } from '../../../stores/projectStore';
import { useSchemaStore } from '../../../stores/schemaStore';
import { DOM_EVENT } from '../../../lib/constants';
import { emitCommand } from '../../../lib/commandBus';
import {
    buildSchemaDiffEnvironmentChoices,
    buildSchemaDiffSource,
    SCHEMA_DIFF_FALLBACK_SCHEMA,
} from '../../../lib/schemaDiffSourceOptions';
import { getErrorMessage } from '../../../lib/errors';
import { onSchemaLoaded } from '../../../lib/events';
import {
    Button,
    Dialog,
    DialogContent,
    DialogTitle,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../../ui';
import { useToast } from '../Toast';
import type { EnvironmentKey } from '../../../types/project';

export interface SchemaDiffSourceDialogProps {
    onClose: () => void;
    targetSide?: 'left' | 'right';
    nextPickerSide?: 'left' | 'right';
    compareTabId?: string;
    initialEnvironmentKey?: string;
    initialSchemaName?: string;
}

/**
 * Picker dialog for choosing a schema-diff source (project environment +
 * schema name). Launched from compare tabs via OPEN_CONTEXT_SEARCH with
 * mode='schema-diff-source'.
 */
export const SchemaDiffSourceDialog: React.FC<SchemaDiffSourceDialogProps> = ({
    onClose,
    targetSide,
    nextPickerSide,
    compareTabId,
    initialEnvironmentKey,
    initialSchemaName,
}) => {
    const { toast } = useToast();

    const loadedConnections = useConnectionStore(state => state.connections);
    const activeProject = useProjectStore(state => state.activeProject);
    const setTree = useSchemaStore(state => state.setTree);
    const setLoading = useSchemaStore(state => state.setLoading);
    const updateTabContext = useEditorStore(state => state.updateTabContext);

    const environmentChoices = React.useMemo(
        () => buildSchemaDiffEnvironmentChoices(activeProject, loadedConnections),
        [activeProject, loadedConnections],
    );
    const [selectedEnvironmentKey, setSelectedEnvironmentKey] = React.useState(
        initialEnvironmentKey || environmentChoices[0]?.environmentKey || '',
    );
    const selectedEnvironment = React.useMemo(
        () =>
            environmentChoices.find(option => option.environmentKey === selectedEnvironmentKey) ||
            null,
        [environmentChoices, selectedEnvironmentKey],
    );
    const profileName = selectedEnvironment?.profileName || '';
    const dbName = selectedEnvironment?.databaseName || '';
    const schemaKey = `${profileName}:${dbName}`;
    const schemas = useSchemaStore(state =>
        profileName && dbName ? state.trees[schemaKey] : undefined,
    );
    const schemasLoading = useSchemaStore(state =>
        profileName && dbName ? state.loadingKeys.has(schemaKey) : false,
    );
    const availableSchemaNames = React.useMemo(() => {
        if (!schemas || schemas.length === 0) return [];
        return Array.from(new Set(schemas.map(schema => schema.Name).filter(Boolean))).sort(
            (left, right) => left.localeCompare(right),
        );
    }, [schemas]);
    const [schemaInput, setSchemaInput] = React.useState(
        initialSchemaName || SCHEMA_DIFF_FALLBACK_SCHEMA,
    );

    React.useEffect(() => {
        const nextEnvironmentKey =
            initialEnvironmentKey || environmentChoices[0]?.environmentKey || '';
        setSelectedEnvironmentKey(nextEnvironmentKey);
        const matchedChoice = environmentChoices.find(
            option => option.environmentKey === nextEnvironmentKey,
        );
        setSchemaInput(
            initialSchemaName || matchedChoice?.schemaName || SCHEMA_DIFF_FALLBACK_SCHEMA,
        );
    }, [environmentChoices, initialEnvironmentKey, initialSchemaName]);

    React.useEffect(() => {
        if (!profileName || !dbName || schemas || schemasLoading) return;
        setLoading(profileName, dbName, true);
        getApiGateway()
            .schema.fetchDatabaseSchema(profileName, dbName)
            .then(unwrapOrThrow)
            .catch(error => {
                setLoading(profileName, dbName, false);
                toast.error(`Failed to load schema: ${getErrorMessage(error)}`);
            });
    }, [dbName, profileName, schemas, schemasLoading, setLoading, toast]);

    React.useEffect(() => {
        const offLoaded = onSchemaLoaded(payload => {
            if (payload.profileName !== profileName || payload.dbName !== dbName) return;
            setTree(profileName, dbName, payload.schemas);
            setLoading(profileName, dbName, false);
        });

        return () => {
            if (typeof offLoaded === 'function') offLoaded();
        };
    }, [dbName, profileName, setLoading, setTree]);

    React.useEffect(() => {
        if (!selectedEnvironment) return;
        if (availableSchemaNames.length === 0) {
            setSchemaInput(selectedEnvironment.schemaName || SCHEMA_DIFF_FALLBACK_SCHEMA);
            return;
        }
        if (!availableSchemaNames.includes(schemaInput)) {
            const preferredSchema =
                availableSchemaNames.find(name => name === selectedEnvironment.schemaName) ||
                availableSchemaNames.find(name => name === initialSchemaName) ||
                availableSchemaNames[0];
            if (preferredSchema) {
                setSchemaInput(preferredSchema);
            }
        }
    }, [availableSchemaNames, initialSchemaName, schemaInput, selectedEnvironment]);

    const handleSelectSchemaDiffSource = React.useCallback(() => {
        if (!compareTabId || !targetSide) return;
        if (!selectedEnvironment) {
            toast.error('Select an environment first');
            return;
        }
        const nextSchemaName =
            schemaInput.trim() || selectedEnvironment.schemaName || SCHEMA_DIFF_FALLBACK_SCHEMA;
        updateTabContext(compareTabId, {
            [targetSide === 'left' ? 'schemaDiffLeftSource' : 'schemaDiffRightSource']:
                buildSchemaDiffSource(selectedEnvironment, nextSchemaName),
            [targetSide === 'left' ? 'schemaDiffLeftSnapshot' : 'schemaDiffRightSnapshot']:
                undefined,
            schemaDiffMigration: undefined,
        });
        void useProjectStore
            .getState()
            .setEnvironmentLastSchema(
                selectedEnvironment.environmentKey as EnvironmentKey,
                nextSchemaName,
            );
        onClose();

        if (nextPickerSide) {
            setTimeout(() => {
                emitCommand(DOM_EVENT.OPEN_CONTEXT_SEARCH, {
                    mode: 'schema-diff-source',
                    targetSide: nextPickerSide,
                    compareTabId,
                });
            }, 50);
        }
    }, [
        compareTabId,
        nextPickerSide,
        onClose,
        selectedEnvironment,
        schemaInput,
        targetSide,
        toast,
        updateTabContext,
    ]);

    return (
        <Dialog open onOpenChange={open => !open && onClose()}>
            <DialogContent showCloseButton={false} className='max-w-lg p-0 overflow-hidden'>
                <DialogTitle className='sr-only'>Schema Diff Source</DialogTitle>
                <div className='border-b border-border px-4 py-3'>
                    <div className='text-title text-foreground'>
                        Select {targetSide === 'left' ? 'Left' : 'Right'} Schema Source
                    </div>
                    <div className='mt-1 text-small text-muted-foreground'>
                        Pick a project environment and schema name for schema diff.
                    </div>
                </div>

                <div className='space-y-4 p-4'>
                    <div className='space-y-2'>
                        <div className='text-label text-muted-foreground'>Environment</div>
                        <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
                            {environmentChoices.map(option => (
                                <Button
                                    key={option.environmentKey}
                                    type='button'
                                    variant={
                                        option.environmentKey === selectedEnvironmentKey
                                            ? 'secondary'
                                            : 'outline'
                                    }
                                    className='justify-start h-auto py-2.5'
                                    onClick={() => {
                                        setSelectedEnvironmentKey(option.environmentKey);
                                        setSchemaInput(
                                            option.schemaName || SCHEMA_DIFF_FALLBACK_SCHEMA,
                                        );
                                    }}
                                >
                                    <div className='flex flex-col items-start'>
                                        <span>{option.environmentLabel}</span>
                                        <span className='text-label text-muted-foreground'>
                                            {option.profileName} · {option.databaseName || 'No DB'}
                                        </span>
                                    </div>
                                </Button>
                            ))}
                        </div>
                    </div>

                    <div className='space-y-2'>
                        <div className='text-label text-muted-foreground'>Schema</div>
                        <Select
                            value={schemaInput}
                            onValueChange={setSchemaInput}
                            disabled={
                                !selectedEnvironment ||
                                !selectedEnvironment.profileName ||
                                !selectedEnvironment.databaseName ||
                                schemasLoading ||
                                availableSchemaNames.length === 0
                            }
                        >
                            <SelectTrigger
                                aria-label='Select schema'
                                className='w-full justify-between'
                            >
                                <SelectValue
                                    placeholder={
                                        schemasLoading
                                            ? 'Loading schemas...'
                                            : !selectedEnvironment
                                              ? 'Select an environment first'
                                              : availableSchemaNames.length === 0
                                                ? 'No schemas found'
                                                : 'Select schema'
                                    }
                                />
                            </SelectTrigger>
                            <SelectContent>
                                {availableSchemaNames.map(schemaName => (
                                    <SelectItem key={schemaName} value={schemaName}>
                                        {schemaName}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <div className='text-label text-muted-foreground'>
                            {schemasLoading
                                ? `Loading schemas from ${dbName || 'database'}...`
                                : selectedEnvironment && !selectedEnvironment.profileName
                                  ? 'This environment is missing a mapped connection profile.'
                                  : selectedEnvironment && !selectedEnvironment.databaseName
                                    ? 'This environment has no database name configured.'
                                    : availableSchemaNames.length > 0
                                      ? `Loaded ${availableSchemaNames.length} schema${availableSchemaNames.length === 1 ? '' : 's'} from ${dbName}.`
                                      : 'Select an environment to load its schemas.'}
                        </div>
                    </div>
                </div>

                <div className='flex items-center justify-end gap-2 border-t border-border px-4 py-3'>
                    <Button type='button' variant='ghost' onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        type='button'
                        onClick={handleSelectSchemaDiffSource}
                        disabled={!selectedEnvironmentKey}
                    >
                        Use Source
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
