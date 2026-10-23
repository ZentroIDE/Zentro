// SPDX-License-Identifier: GPL-3.0-only

import { useState, useEffect, useRef } from 'react';
import { getApiGateway } from '../platform/apiGatewayRuntime';
import { STORAGE_KEY } from '../lib/constants';

export interface UpdateInfo {
    latest_version: string;
    release_url: string;
    changelog: string;
    has_update: boolean;
    download_url: string;
    checksum_sha256?: string;
}

/**
 * useUpdateCheck drives the update-available UI. On installs where
 * canAutoUpdate is true (Windows, and Linux when running as an AppImage),
 * actually applying an update (restartAndUpdate) quits this process
 * immediately and hands the entire download -> verify -> install -> relaunch
 * sequence to a detached helper - see internal/app/update_installer_windows.go
 * and update_installer_linux.go. Nothing about that sequence is observable
 * from here; the only feedback loop is consumeLastUpdateResult, read once on
 * the next launch (the one the helper produced). Every other install falls
 * back to opening the release page in a browser.
 */
export const useUpdateCheck = () => {
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    const updateInfoRef = useRef<UpdateInfo | null>(null);
    const [currentVersion, setCurrentVersion] = useState('');
    const [isChecking, setIsChecking] = useState(false);
    const [updateError, setUpdateError] = useState<string | null>(null);
    const [canAutoUpdate, setCanAutoUpdate] = useState(false);
    const [isNightly, setIsNightly] = useState(false);
    const [isApplying, setIsApplying] = useState(false);
    // Set once on launch if the update helper that (maybe) relaunched this
    // process reported success - the version we've now landed on.
    const [updatedToVersion, setUpdatedToVersion] = useState<string | null>(null);

    const setInfo = (info: UpdateInfo | null) => {
        updateInfoRef.current = info;
        setUpdateInfo(info);
    };

    // The update check is a built-in, non-configurable behaviour (VSCode-style):
    // it always runs quietly on launch. `manual` only controls whether a
    // previously "skipped" version is still filtered out of the result.
    const check = async (manual = false): Promise<UpdateInfo | null | undefined> => {
        setIsChecking(true);
        try {
            const result = await getApiGateway().settings.checkForUpdates();
            if (!result.ok) {
                console.error('Failed to check for updates:', result.error.message);
                // The automatic launch check has no other surface - without
                // this a failing check (bad release API, offline, 5xx) is
                // completely invisible. The manual menu action shows its own
                // toast, so don't double up there.
                if (!manual) {
                    setUpdateError(`Could not check for updates: ${result.error.message}`);
                }
                return undefined;
            }
            const info = result.data;
            const dismissed = localStorage.getItem(STORAGE_KEY.DISMISSED_UPDATE_VERSION);
            const allowDismissFilter = !manual;
            const hasVisibleUpdate =
                info.has_update && (!allowDismissFilter || info.latest_version !== dismissed);

            const nextInfo = hasVisibleUpdate ? (info as UpdateInfo) : null;
            setInfo(nextInfo);
            return nextInfo;
        } finally {
            setIsChecking(false);
        }
    };

    const dismiss = () => {
        if (updateInfo) {
            localStorage.setItem(STORAGE_KEY.DISMISSED_UPDATE_VERSION, updateInfo.latest_version);
            setInfo(null);
        }
    };

    // Quits this process and hands off to the detached update helper - see
    // the module doc comment above. `info` defaults to the last known
    // updateInfo so callers don't have to thread it through themselves.
    const restartAndUpdate = async (info?: UpdateInfo) => {
        const target = info ?? updateInfoRef.current;
        if (!target) {
            setUpdateError('No update is available to install.');
            return;
        }
        setIsApplying(true);
        const result = await getApiGateway().settings.restartAndUpdate?.(target);
        if (result && !result.ok) {
            setUpdateError(result.error.message);
            // Nothing actually happened - the app is still here, so let the
            // user see the failure and retry instead of looking stuck.
            setIsApplying(false);
        }
        // On success the app quits immediately - nothing else to do here.
    };

    useEffect(() => {
        (async () => {
            const aboutResult = await getApiGateway().settings.getAboutInfo();
            setCurrentVersion(aboutResult.ok ? aboutResult.data.version : '');
            const supportsAutoUpdate = aboutResult.ok && aboutResult.data.canAutoUpdate;
            setCanAutoUpdate(supportsAutoUpdate);
            const onNightly = aboutResult.ok && aboutResult.data.channel === 'nightly';
            setIsNightly(onNightly);

            if (supportsAutoUpdate) {
                // Reports on the update the helper just applied (or failed
                // to) before relaunching into this very session - the one
                // feedback loop for a process that ran entirely after the
                // previous instance had already quit.
                const last = await getApiGateway().settings.consumeLastUpdateResult?.();
                if (last?.ok && last.data && typeof last.data === 'object') {
                    if (last.data.ok) {
                        setUpdatedToVersion(last.data.version);
                    } else {
                        setUpdateError(
                            `Update to v${last.data.version} failed: ${last.data.error || 'unknown error'}`,
                        );
                    }
                }
            }
        })();
    }, []);

    useEffect(() => {
        // Delay initial check to not interfere with startup
        const timer = setTimeout(() => {
            check();
        }, 5000);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {
        hasUpdate: !!updateInfo,
        updateInfo,
        currentVersion,
        isChecking,
        check,
        dismiss,
        updateError,
        restartAndUpdate,
        isApplying,
        canAutoUpdate,
        isNightly,
        updatedToVersion,
    };
};
