// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useState } from 'react';
import { getApiGateway } from '../../../platform/apiGatewayRuntime';
import type { SqlFormatSettings } from '../../../lib/sqlFormatSettings';

const SAMPLE_SQL =
    "select top 10 o.id,c.name,count(*) as items from dbo.orders o inner join dbo.customers c on c.id=o.customer_id where o.status='open' and o.total>100 group by o.id,c.name order by items desc";

/**
 * Formats a fixed sample with the saved options. `options` is only a change
 * signal: the backend reads the persisted preferences itself, and the store
 * updates it after the save has landed, so this always sees the new values.
 */
export function useSqlFormatPreview(options: SqlFormatSettings): string {
    const [preview, setPreview] = useState('');

    useEffect(() => {
        let cancelled = false;
        void getApiGateway()
            .query.formatSQL(SAMPLE_SQL, 'sqlserver')
            .then(result => {
                if (!cancelled && result.ok) setPreview(result.data);
            });
        return () => {
            cancelled = true;
        };
    }, [options]);

    return preview;
}
