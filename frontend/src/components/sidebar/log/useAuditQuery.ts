// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useState } from 'react';
import type { app } from '../../../../wailsjs/go/models';
import { getApiGateway } from '../../../platform/apiGatewayRuntime';
import { useProjectStore } from '../../../stores/projectStore';
import { onAuditUpdated, onQueryDone } from '../../../lib/events';

export function useAuditQuery(filter: app.SQLAuditFilter) {
    const [entries, setEntries] = useState<app.SQLAuditEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const activeProjectId = useProjectStore(s => s.activeProject?.id);

    const load = useCallback(async () => {
        setLoading(true);
        const result = await getApiGateway().audit.getSQLAuditLog(filter);
        if (result.ok) {
            setEntries(result.data ?? []);
        }
        setLoading(false);
    }, [
        filter.search,
        filter.status,
        filter.profile,
        filter.limit,
        filter.pinned_only,
        activeProjectId,
    ]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        load();
        const offQueryDone = onQueryDone(() => load());
        const offAuditUpdated = onAuditUpdated(() => load());
        return () => {
            offQueryDone();
            offAuditUpdated();
        };
    }, [load]);

    return { entries, loading, reload: load };
}
