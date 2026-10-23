// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

import { KIND_LABEL, type SearchItem } from '../../../lib/contextSearchTemplates';
import { CommandItem } from '../../ui';
import { KIND_ICON } from './kindIcons';

interface SearchResultRowProps {
    item: SearchItem;
    onSelect: (item: SearchItem) => void;
    onContextMenu?: (event: React.MouseEvent<HTMLDivElement>, item: SearchItem) => void;
}

export const SearchResultRow: React.FC<SearchResultRowProps> = ({
    item,
    onSelect,
    onContextMenu,
}) => (
    <CommandItem
        value={`${item.qualifiedName} ${KIND_LABEL[item.kind]} ${item.schema}`}
        onSelect={() => onSelect(item)}
        onContextMenu={event => onContextMenu?.(event, item)}
        className='group cursor-pointer flex items-center justify-between px-4 py-1 text-small ui-interactive-command-item-primary'
    >
        <span className='flex min-w-0 items-center gap-2'>
            <span className='shrink-0'>{KIND_ICON[item.kind]}</span>
            <span className='truncate'>{item.name}</span>
        </span>
        <span className='ml-4 flex shrink-0 items-center gap-2'>
            <span className='text-label uppercase tracking-wide text-muted-foreground'>
                {KIND_LABEL[item.kind]}
            </span>
            <span className='text-label text-muted-foreground'>{item.schema}</span>
        </span>
    </CommandItem>
);
