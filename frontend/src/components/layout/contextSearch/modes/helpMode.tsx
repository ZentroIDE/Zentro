// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

import { ModeDirectoryResults } from './ModeDirectoryResults';
import type { SearchModeDescriptor, SearchModeResultsProps } from './types';

const HelpResults: React.FC<SearchModeResultsProps> = props => (
    <ModeDirectoryResults
        {...props}
        heading='Search scopes'
        modeFilter={mode => mode.id !== 'help'}
    />
);

export const helpMode: SearchModeDescriptor = {
    id: 'help',
    prefix: '?',
    description: 'List all search scopes',
    placeholder: 'Pick a search scope...',
    dialogTitle: 'Search Help',
    Results: HelpResults,
};
