// SPDX-License-Identifier: GPL-3.0-only

import { useCallback } from 'react';

import { useStatusStore } from '../../../stores/statusStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import { utils } from '../../../../wailsjs/go/models';
import { useToast } from '../Toast';

/**
 * View-mode toggle handler. Refuses to enable while a transaction is active
 * (the user must commit or rollback first) and surfaces a toast either way.
 */
export function useViewModeToggle() {
    const viewMode = useSettingsStore(s => s.viewMode);
    const savePrefs = useSettingsStore(s => s.save);
    const transactionStatus = useStatusStore(s => s.transactionStatus);
    const { toast } = useToast();

    const handleToggleViewMode = useCallback(async () => {
        const next = !viewMode;
        if (next && transactionStatus === 'active') {
            toast.error(
                'Cannot enable View Mode while a transaction is active. Please commit or rollback first.',
            );
            return;
        }
        await savePrefs(new utils.Preferences({ view_mode: next }));
        toast.success(next ? 'View Mode enabled (read-only).' : 'View Mode disabled.');
    }, [viewMode, transactionStatus, savePrefs, toast]);

    return { viewMode, handleToggleViewMode };
}
