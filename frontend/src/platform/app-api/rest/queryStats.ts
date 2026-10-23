// SPDX-License-Identifier: GPL-3.0-only

import type { QueryStatsAdapter } from '../contracts/queryStats';
import type { RestHttpClient } from './httpClient';

export function createQueryStatsRestAdapter(client: RestHttpClient): QueryStatsAdapter {
    return {
        getQueryStats: filter => client.call('/query-stats/get-query-stats', { filter }),
    };
}
