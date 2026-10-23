// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

import { ModeDirectoryResults } from './ModeDirectoryResults';
import type { SearchModeDescriptor, SearchModeResultsProps } from './types';

const ScopeResults: React.FC<SearchModeResultsProps> = props => (
    <ModeDirectoryResults
        {...props}
        heading='Scopes'
        modeFilter={mode => Boolean(mode.prefix?.startsWith('@')) && mode.id !== 'scope'}
    />
);

export const scopeMode: SearchModeDescriptor = {
    id: 'scope',
    prefix: '@',
    description: 'List @ scopes',
    placeholder: 'Pick a scope (@git, @env, ...)...',
    dialogTitle: 'Scopes',
    Results: ScopeResults,
};
