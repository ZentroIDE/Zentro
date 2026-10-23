// SPDX-License-Identifier: GPL-3.0-only

import { useMemo } from 'react';
import { useFeatureGate } from './useFeatureGate';
import { checkPermission, type Permission } from './permissions';

export function usePermission(permission: Permission) {
    const gate = useFeatureGate();
    return useMemo(() => checkPermission(gate, permission), [gate, permission]);
}
