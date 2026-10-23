// SPDX-License-Identifier: GPL-3.0-only

import { create } from 'zustand';
import { withStoreLogger } from '../logger';
import type { ResultState } from './types';
import { DEFAULT_WORKSPACE_ID, createEmptyBucket } from './types';
import { createResultProjectSlice } from './resultProjectSlice';
import { createResultQuerySlice } from './resultQuerySlice';
import { createResultEditSlice } from './resultEditSlice';

export const useResultStore = create<ResultState>()(
    withStoreLogger('resultStore', (set, get, ...args) => ({
        projectResults: {
            [DEFAULT_WORKSPACE_ID]: createEmptyBucket(),
        },
        activeProjectId: DEFAULT_WORKSPACE_ID,
        results: {},
        transactionWrapTabs: {},
        transactionTotals: {},
        messagesByTab: {},
        resultEpochs: {},
        resultRevealRequest: null,

        ...createResultProjectSlice(set, get, ...args),
        ...createResultQuerySlice(set, get, ...args),
        ...createResultEditSlice(set, get, ...args),
    })),
);
