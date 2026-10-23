// SPDX-License-Identifier: GPL-3.0-only

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X, Trash2, Search } from 'lucide-react';
import { useTemplateStore } from '../../stores/templateStore';
import { useEditorStore } from '../../stores/editorStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { models } from '../../../wailsjs/go/models';
import {
    Button,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    Input,
    Spinner,
} from '../../components/ui';
import { calculateTemplatePopoverStyle } from './templatePopoverPosition';
import { TemplatesTable, type EditableField, type EditingCell } from './TemplatesTable';

type Template = models.Template;

interface TemplatePopoverProps {
    onClose: () => void;
    anchorRect: DOMRect | null;
    tabId?: string;
    isActive?: boolean;
    readOnly?: boolean;
}

export const TemplatePopover: React.FC<TemplatePopoverProps> = ({
    onClose,
    anchorRect,
    tabId,
    isActive,
    readOnly,
}) => {
    const { templates, saveTemplate, deleteTemplate, isLoading } = useTemplateStore();
    const groups = useEditorStore(state => state.groups);
    const updateTabQuery = useEditorStore(state => state.updateTabQuery);
    const viewMode = useSettingsStore(state => state.viewMode);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [filter, setFilter] = useState('');
    const [draftTemplates, setDraftTemplates] = useState<Template[]>([]);
    const [focusNewlyAdded, setFocusNewlyAdded] = useState(false);
    const [editingCell, setEditingCell] = useState<EditingCell>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const prevTemplatesCount = useRef(templates.length);

    const canAppendToEditor = Boolean(tabId && isActive && !readOnly && !viewMode);

    useEffect(() => {
        setDraftTemplates(templates);

        if (focusNewlyAdded && templates.length > prevTemplatesCount.current) {
            const newTemplate = templates[templates.length - 1];
            if (newTemplate?.id) {
                setEditingCell({ id: newTemplate.id, field: 'name' });
            }
            setFocusNewlyAdded(false);
        }
        prevTemplatesCount.current = templates.length;
    }, [templates, focusNewlyAdded]);

    useEffect(() => {
        if (!editingCell) return;
        const exists = draftTemplates.some(template => template.id === editingCell.id);
        if (!exists) {
            setEditingCell(null);
        }
    }, [draftTemplates, editingCell]);

    const filteredTemplates = useMemo(() => {
        const keyword = filter.trim().toLowerCase();
        if (!keyword) return draftTemplates;
        return draftTemplates.filter(
            template =>
                (template.name || '').toLowerCase().includes(keyword) ||
                (template.trigger || '').toLowerCase().includes(keyword) ||
                (template.content || '').toLowerCase().includes(keyword),
        );
    }, [draftTemplates, filter]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
                return;
            }

            if (
                event.target instanceof HTMLInputElement ||
                event.target instanceof HTMLTextAreaElement
            )
                return;

            if (event.key === 'Delete' && selectedIds.size > 0) {
                requestDeleteTemplates(Array.from(selectedIds));
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, selectedIds]);

    const requestDeleteTemplates = (ids: string[]) => {
        if (ids.length === 0) return;
        setPendingDeleteIds(ids);
        setShowDeleteConfirm(true);
    };

    const confirmDeleteTemplates = async () => {
        const ids = pendingDeleteIds;
        if (ids.length === 0) return;
        setSelectedIds(new Set());
        setDraftTemplates(prev => prev.filter(template => !ids.includes(template.id)));
        await Promise.all(ids.map(id => deleteTemplate(id)));
        setPendingDeleteIds([]);
    };

    const handleAdd = async () => {
        const newTemplate: Template = {
            id: '',
            name: 'New Template',
            trigger: 'abbr',
            content: 'SELECT * FROM table;',
        };
        setFocusNewlyAdded(true);
        await saveTemplate(newTemplate);
    };

    const handleDraftUpdate = (id: string, field: EditableField, value: string) => {
        setDraftTemplates(prev =>
            prev.map(template => (template.id === id ? { ...template, [field]: value } : template)),
        );
    };

    const handleBlur = async (id: string, field: EditableField, value: string) => {
        const original = templates.find(template => template.id === id);
        if (original && original[field] === value) return;

        const current = draftTemplates.find(template => template.id === id);
        if (current) {
            await saveTemplate(current);
        }
    };

    const handleInlineBlur = (id: string, field: EditableField, value: string) => {
        void handleBlur(id, field, value).then(() => {
            setEditingCell(current =>
                current?.id === id && current.field === field ? null : current,
            );
        });
    };

    const handleInlineKeyDown = (
        event: React.KeyboardEvent<HTMLInputElement>,
        id: string,
        field: EditableField,
    ) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            const original = templates.find(template => template.id === id);
            if (original) {
                handleDraftUpdate(id, field, String(original[field] || ''));
            }
            setEditingCell(null);
            event.currentTarget.blur();
        }
    };

    const handleAppend = (template: Template) => {
        if (!canAppendToEditor || !tabId) return;
        if (!template.content?.trim()) return;

        const currentTab = groups.flatMap(group => group.tabs).find(tab => tab.id === tabId);

        if (!currentTab) return;
        const base = currentTab.query.trimEnd();
        const nextQuery = base ? `${base}\n\n${template.content}` : template.content;
        updateTabQuery(tabId, nextQuery);
    };

    const toggleSelect = (id: string, multi: boolean) => {
        const next = new Set(selectedIds);
        if (multi) {
            if (next.has(id)) next.delete(id);
            else next.add(id);
        } else {
            next.clear();
            next.add(id);
        }
        setSelectedIds(next);
    };

    const popoverStyle = useMemo(() => calculateTemplatePopoverStyle(anchorRect), [anchorRect]);

    return (
        <div
            ref={containerRef}
            style={popoverStyle}
            className='z-popover flex flex-col overflow-hidden rounded-md border border-border/50 bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-150'
        >
            {/* Header / filter bar */}
            <div className='flex items-center justify-between gap-2 border-b border-border px-3 py-2'>
                <div className='flex min-w-0 items-center gap-2'>
                    <h3 className='truncate text-small text-foreground'>TEMPLATES</h3>
                    <span className='rounded-md border border-border bg-background px-1.5 py-0.5 text-label text-muted-foreground'>
                        {templates.length}
                    </span>
                </div>
                <div className='flex items-center gap-1'>
                    <div className='relative w-50'>
                        <Search
                            className='pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground'
                            size={13}
                        />
                        <Input
                            value={filter}
                            onChange={event => setFilter(event.target.value)}
                            className='pl-7'
                            placeholder='Filter'
                            title='Filter templates'
                        />
                    </div>
                    {selectedIds.size > 0 && (
                        <span
                            className='ml-0.5 rounded-md px-1.5 py-0.5 text-label'
                            style={{
                                border: '1px solid color-mix(in srgb, var(--status-success) 30%, transparent)',
                                background:
                                    'color-mix(in srgb, var(--status-success) 10%, transparent)',
                                color: 'var(--status-success)',
                            }}
                        >
                            {selectedIds.size}
                        </span>
                    )}
                    <Button
                        variant='ghost'
                        size='icon'
                        title='Delete selected templates'
                        disabled={selectedIds.size === 0}
                        style={
                            selectedIds.size > 0
                                ? {
                                      color: 'color-mix(in srgb, var(--status-destructive) 80%, transparent)',
                                  }
                                : undefined
                        }
                        className='ui-interactive-ghost-destructive'
                        onClick={() => requestDeleteTemplates(Array.from(selectedIds))}
                    >
                        <Trash2 size={14} />
                    </Button>
                    <Button
                        variant='ghost'
                        size='icon'
                        title='Add template'
                        onClick={() => void handleAdd()}
                    >
                        <Plus size={14} />
                    </Button>
                    <Button variant='ghost' size='icon' title='Close' onClick={onClose}>
                        <X size={14} />
                    </Button>
                </div>
            </div>

            {/* Table */}
            <div className='min-h-0 flex-1 overflow-auto'>
                <TemplatesTable
                    rows={filteredTemplates}
                    selectedIds={selectedIds}
                    editingCell={editingCell}
                    canAppendToEditor={canAppendToEditor}
                    onToggleSelect={toggleSelect}
                    onBeginEdit={(id, field) => setEditingCell({ id, field })}
                    onDraftUpdate={handleDraftUpdate}
                    onInlineBlur={handleInlineBlur}
                    onInlineKeyDown={handleInlineKeyDown}
                    onAppend={handleAppend}
                    onRequestDelete={requestDeleteTemplates}
                />
            </div>

            {/* Footer — loading indicator only */}
            {isLoading && (
                <div
                    className='flex items-center gap-2 border-t border-border px-3 py-1.5'
                    style={{ background: 'var(--card)' }}
                >
                    <Spinner size={12} />
                    <span className='text-label text-muted-foreground'>Saving…</span>
                </div>
            )}

            <Dialog
                open={showDeleteConfirm}
                onOpenChange={v => {
                    if (!v) {
                        setShowDeleteConfirm(false);
                        setPendingDeleteIds([]);
                    }
                }}
            >
                <DialogContent size='sm'>
                    <DialogHeader>
                        <DialogTitle>Delete Templates</DialogTitle>
                    </DialogHeader>
                    <div className='px-4 py-3'>
                        <p className='text-small'>
                            Delete {pendingDeleteIds.length} selected{' '}
                            {pendingDeleteIds.length === 1 ? 'template' : 'templates'}?
                        </p>
                        <p className='text-label text-muted-foreground mt-1'>
                            This action cannot be undone.
                        </p>
                    </div>
                    <DialogFooter>
                        <Button
                            variant='ghost'
                            onClick={() => {
                                setShowDeleteConfirm(false);
                                setPendingDeleteIds([]);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant='destructive'
                            onClick={() => {
                                void confirmDeleteTemplates();
                            }}
                        >
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
