// SPDX-License-Identifier: GPL-3.0-only

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    ReactFlow,
    Background,
    BackgroundVariant,
    ControlButton,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    type Node,
    type Edge,
    type NodeTypes,
    type EdgeTypes,
    type Connection,
    useStore,
    useReactFlow,
    ConnectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { LayoutDashboard, Loader } from 'lucide-react';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../shared/kernel';
import { useSettingsStore } from '../../stores/settingsStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { getErrorMessage } from '../../lib/errors';
import { useFocusZone } from '../../lib/focusZoneRegistry';
import { FKDetailSheet } from './FKDetailSheet';
import { CreateFKDialog } from './CreateFKDialog';
import { ErdEdge, ErdMarkerDefs } from './erd/ErdEdge';
import { TableNode } from './erd/TableNode';
import { useErdLayout } from './erd/useErdLayout';
import type { ConstraintGroup, ErdColumn, TableNodeData, TableRelationship } from './erd/types';

const ERD_PAN_STEP_PX = 40;

/**
 * Keyboard pan/zoom for the ERD canvas. Rendered as a child of <ReactFlow>
 * so useReactFlow() resolves against that instance's own context (ReactFlow
 * provides it internally for its descendants; ErdView itself sits above
 * that tree and can't call the hook directly). Listens on the "erd" focus
 * zone's wrapper element rather than taking its own DOM node, since the
 * wrapper — not this invisible component — is what tabIndex/data-zone live
 * on and what the Focus Zone Registry/shortcut (Ctrl+Shift+M) land focus in.
 */
const ErdKeyboardController: React.FC<{ wrapperRef: React.RefObject<HTMLDivElement | null> }> = ({
    wrapperRef,
}) => {
    const { zoomIn, zoomOut, fitView, getViewport, setViewport } = useReactFlow();

    useEffect(() => {
        const el = wrapperRef.current;
        if (!el) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            // Nodes live inside this wrapper. When one of them has focus, its
            // own arrow handling nudges it; panning here as well moves both.
            if (event.target !== el) return;

            const pan = (dx: number, dy: number) => {
                const viewport = getViewport();
                setViewport(
                    { ...viewport, x: viewport.x - dx, y: viewport.y - dy },
                    { duration: 150 },
                );
            };

            switch (event.key) {
                case 'ArrowUp':
                    event.preventDefault();
                    pan(0, ERD_PAN_STEP_PX);
                    break;
                case 'ArrowDown':
                    event.preventDefault();
                    pan(0, -ERD_PAN_STEP_PX);
                    break;
                case 'ArrowLeft':
                    event.preventDefault();
                    pan(ERD_PAN_STEP_PX, 0);
                    break;
                case 'ArrowRight':
                    event.preventDefault();
                    pan(-ERD_PAN_STEP_PX, 0);
                    break;
                case '+':
                case '=':
                    event.preventDefault();
                    void zoomIn({ duration: 150 });
                    break;
                case '-':
                case '_':
                    event.preventDefault();
                    void zoomOut({ duration: 150 });
                    break;
                case '0':
                    event.preventDefault();
                    void fitView({ duration: 150, padding: 0.3 });
                    break;
                default:
                    break;
            }
        };

        el.addEventListener('keydown', handleKeyDown);
        return () => el.removeEventListener('keydown', handleKeyDown);
    }, [fitView, getViewport, setViewport, wrapperRef, zoomIn, zoomOut]);

    return null;
};

const nodeTypes: NodeTypes = {
    tableNode: TableNode,
};

const edgeTypes: EdgeTypes = {
    erdEdge: ErdEdge,
};

interface ErdViewProps {
    schema: string;
    table: string;
    refreshKey?: number;
    isActive?: boolean;
    onCountChange?: (count: number) => void;
}

export const ErdView: React.FC<ErdViewProps> = ({
    schema,
    table,
    refreshKey = 0,
    isActive = true,
    onCountChange,
}) => {
    const { theme } = useSettingsStore();
    const connectionID = useConnectionStore(s => s.activeProfile?.id ?? '');
    const dbName = useConnectionStore(s => s.activeProfile?.db_name ?? '');
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [constraintGroups, setConstraintGroups] = useState<ConstraintGroup[]>([]);
    const [selectedConstraint, setSelectedConstraint] = useState<ConstraintGroup | null>(null);
    const [createFKParams, setCreateFKParams] = useState<{
        sourceTable: string;
        sourceColumn: string;
        sourceType: string;
        targetTable: string;
        targetColumn: string;
        targetType: string;
    } | null>(null);
    const [localVersion, setLocalVersion] = useState(0);
    const { resolveLayout, saveLayout, resetLayout } = useErdLayout({
        connectionID,
        dbName,
        schema,
        table,
    });
    const nodesRef = useRef<Node[]>([]);
    nodesRef.current = nodes;

    const isMounted = useRef(true);
    const isFetching = useRef(false);
    const loadedFnRef = useRef<((...args: unknown[]) => unknown) | null>(null);
    const erdWrapperRef = useRef<HTMLDivElement | null>(null);
    useFocusZone('erd', erdWrapperRef);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    const handleEdgeClick = useCallback(
        (_evt: React.MouseEvent, edge: Edge) => {
            const group = constraintGroups.find(g => g.ConstraintName === edge.id);
            if (group) setSelectedConstraint(group);
        },
        [constraintGroups],
    );

    const handleNodeDragStop = useCallback(
        (_evt: React.MouseEvent, _node: Node, dragged: Node[]) => {
            const latest = new Map(dragged.map(node => [node.id, node]));
            saveLayout(nodesRef.current.map(node => latest.get(node.id) ?? node));
        },
        [saveLayout],
    );

    const handleResetLayout = useCallback(() => {
        resetLayout();
        setLocalVersion(v => v + 1);
    }, [resetLayout]);

    const handleConnect = useCallback(
        (connection: Connection) => {
            const sourceColName = connection.sourceHandle?.replace('__source', '') ?? '';
            const targetColName = connection.targetHandle?.replace('__target', '') ?? '';
            const sourceNode = nodes.find(n => n.id === connection.source);
            const targetNode = nodes.find(n => n.id === connection.target);
            const srcCol = (sourceNode?.data as TableNodeData)?.columns.find(
                c => c.name === sourceColName,
            );
            const tgtCol = (targetNode?.data as TableNodeData)?.columns.find(
                c => c.name === targetColName,
            );
            setCreateFKParams({
                sourceTable: connection.source ?? '',
                sourceColumn: sourceColName,
                sourceType: srcCol?.type ?? '',
                targetTable: connection.target ?? '',
                targetColumn: targetColName,
                targetType: tgtCol?.type ?? '',
            });
        },
        [nodes],
    );

    const loadErd = useCallback(async () => {
        if (isFetching.current) return;
        isFetching.current = true;

        try {
            if (isMounted.current) {
                setLoading(true);
                setError('');
            }

            const initialRels = unwrapOrThrow(
                await getApiGateway().schema.fetchTableRelationships(
                    connectionID,
                    dbName,
                    schema,
                    table,
                ),
            );
            if (!isMounted.current) return;

            const relatedTables = new Set<string>([table]);
            (initialRels || []).forEach(relation => {
                relatedTables.add(relation.SourceTable);
                relatedTables.add(relation.TargetTable);
            });

            const allRelsMap = new Map<string, TableRelationship>();
            (initialRels || []).forEach(relation =>
                allRelsMap.set(relation.ConstraintName, relation),
            );

            const neighborTables = Array.from(relatedTables).filter(t => t !== table);
            const neighborRelResults = await Promise.all(
                neighborTables.map(currentTable => {
                    let relationSchema = schema;
                    const relationOfTable = initialRels?.find(
                        relation =>
                            relation.SourceTable === currentTable ||
                            relation.TargetTable === currentTable,
                    );
                    if (relationOfTable) {
                        relationSchema =
                            relationOfTable.SourceTable === currentTable
                                ? relationOfTable.SourceSchema
                                : relationOfTable.TargetSchema;
                    }
                    return getApiGateway()
                        .schema.fetchTableRelationships(
                            connectionID,
                            dbName,
                            relationSchema,
                            currentTable,
                        )
                        .then(unwrapOrThrow)
                        .catch(error => {
                            console.warn(`Failed to fetch rels for ${currentTable}`, error);
                            return [] as TableRelationship[];
                        });
                }),
            );
            if (!isMounted.current) return;
            neighborRelResults.forEach(neighborRels => {
                (neighborRels || []).forEach(neighborRelation => {
                    if (
                        relatedTables.has(neighborRelation.SourceTable) &&
                        relatedTables.has(neighborRelation.TargetTable)
                    ) {
                        allRelsMap.set(neighborRelation.ConstraintName, neighborRelation);
                    }
                });
            });

            const finalRels = Array.from(allRelsMap.values());
            if (onCountChange && isMounted.current) {
                onCountChange(finalRels.length);
            }

            const columnsMap = new Map<string, ErdColumn[]>();
            const allTablesList = Array.from(relatedTables);
            const colFetchEntries = allTablesList.map(currentTable => {
                let relationSchema = schema;
                if (currentTable !== table) {
                    const relationOfTable = finalRels.find(
                        relation =>
                            relation.SourceTable === currentTable ||
                            relation.TargetTable === currentTable,
                    );
                    if (relationOfTable) {
                        relationSchema =
                            relationOfTable.SourceTable === currentTable
                                ? relationOfTable.SourceSchema
                                : relationOfTable.TargetSchema;
                    }
                }
                return { currentTable, relationSchema };
            });
            const colResults = await Promise.all(
                colFetchEntries.map(({ currentTable, relationSchema }) =>
                    getApiGateway()
                        .schema.fetchTableColumns(
                            connectionID,
                            dbName,
                            relationSchema,
                            currentTable,
                        )
                        .then(unwrapOrThrow)
                        .catch(error => {
                            console.error(
                                `Failed to fetch columns for ${currentTable} in schema ${relationSchema}`,
                                error,
                            );
                            return [];
                        }),
                ),
            );
            if (!isMounted.current) return;
            colFetchEntries.forEach(({ currentTable }, i) => {
                const cols = colResults[i] || [];
                const tableFks = new Set(
                    finalRels
                        .filter(relation => relation.SourceTable === currentTable)
                        .map(relation => relation.SourceColumn),
                );
                columnsMap.set(
                    currentTable,
                    cols.map(column => ({
                        name: column.Name,
                        type: column.DataType,
                        isPk: column.IsPrimaryKey,
                        isFk: tableFks.has(column.Name),
                    })),
                );
            });

            if (!isMounted.current) return;

            const groupsMap = new Map<string, ConstraintGroup>();
            finalRels.forEach(relation => {
                const existing = groupsMap.get(relation.ConstraintName);
                if (!existing) {
                    groupsMap.set(relation.ConstraintName, {
                        ...relation,
                        columns: [relation.SourceColumn],
                        targets: [relation.TargetColumn],
                    });
                    return;
                }
                existing.columns.push(relation.SourceColumn);
                existing.targets.push(relation.TargetColumn);
            });

            const newNodes: Node[] = [];
            const newEdges: Edge[] = [];
            const addedNodeIds = new Set<string>();
            const addTableNode = (id: string) => {
                if (addedNodeIds.has(id)) return;
                addedNodeIds.add(id);
                const data: TableNodeData = {
                    label: id,
                    columns: columnsMap.get(id) || [],
                    isFocus: id === table,
                };
                newNodes.push({ id, type: 'tableNode', position: { x: 0, y: 0 }, data });
            };

            addTableNode(table);
            for (const relation of groupsMap.values()) {
                addTableNode(relation.SourceTable);
                addTableNode(relation.TargetTable);

                newEdges.push({
                    id: relation.ConstraintName,
                    type: 'erdEdge',
                    source: relation.SourceTable,
                    target: relation.TargetTable,
                    data: {
                        label: `${relation.columns.join(', ')} -> ${relation.targets.join(', ')}`,
                    },
                    style: { stroke: 'var(--status-success)' },
                });
            }

            setConstraintGroups(Array.from(groupsMap.values()));
            setNodes(resolveLayout(newNodes, newEdges));
            setEdges(newEdges);
            setLoading(false);
        } catch (error: unknown) {
            if (isMounted.current) {
                setError(getErrorMessage(error));
                setLoading(false);
            }
        } finally {
            isFetching.current = false;
        }
    }, [
        connectionID,
        dbName,
        schema,
        table,
        setNodes,
        setEdges,
        resolveLayout,
        onCountChange,
        localVersion,
        refreshKey,
    ]);

    useEffect(() => {
        if (!isActive) return;
        if (loadedFnRef.current === loadErd) return;
        loadedFnRef.current = loadErd;
        void loadErd();
    }, [isActive, loadErd]);

    if (loading) {
        return (
            <div className='flex items-center justify-center gap-2 p-5 h-full bg-background text-muted-foreground'>
                <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading ERD...
            </div>
        );
    }

    if (error) {
        return <div className='p-5 h-full text-destructive bg-background'>{error}</div>;
    }

    return (
        <>
            <div
                ref={erdWrapperRef}
                data-zone='erd'
                tabIndex={0}
                className='flex-1 w-full h-full min-h-0 relative bg-background'
            >
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    onEdgeClick={handleEdgeClick}
                    onConnect={handleConnect}
                    onNodeDragStop={handleNodeDragStop}
                    connectionMode={ConnectionMode.Loose}
                    fitView
                    fitViewOptions={{ padding: 0.3 }}
                    minZoom={0.1}
                    maxZoom={2}
                    colorMode={theme as 'light' | 'dark' | 'system'}
                    proOptions={{ hideAttribution: true }}
                >
                    <ErdMarkerDefs />
                    <Background
                        variant={BackgroundVariant.Dots}
                        color='color-mix(in srgb, var(--content-primary) 25%, transparent)'
                        gap={20}
                        size={1.5}
                    />
                    <Controls showInteractive={false} position='bottom-left'>
                        <ControlButton
                            onClick={handleResetLayout}
                            title='Reset layout'
                            aria-label='Reset layout'
                        >
                            <LayoutDashboard />
                        </ControlButton>
                    </Controls>
                    <MiniMap
                        pannable
                        zoomable
                        position='bottom-right'
                        nodeColor='var(--content-muted)'
                        nodeStrokeWidth={0}
                        maskColor='color-mix(in srgb, var(--surface-app) 65%, transparent)'
                        style={{
                            background: 'var(--surface-panel)',
                            border: '1px solid var(--border-panel)',
                            borderRadius: 8,
                        }}
                    />
                    <ErdKeyboardController wrapperRef={erdWrapperRef} />
                </ReactFlow>
                <FKDetailSheet
                    constraint={selectedConstraint}
                    schema={schema}
                    connectionID={connectionID}
                    dbName={dbName}
                    onClose={() => setSelectedConstraint(null)}
                    onUpdated={() => setLocalVersion(v => v + 1)}
                />
            </div>

            {createFKParams && (
                <CreateFKDialog
                    open
                    {...createFKParams}
                    schema={schema}
                    connectionID={connectionID}
                    dbName={dbName}
                    onClose={() => setCreateFKParams(null)}
                    onCreated={() => setLocalVersion(v => v + 1)}
                />
            )}
        </>
    );
};
