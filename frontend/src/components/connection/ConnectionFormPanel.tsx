// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

import { useConnectionForm } from '../../hooks/useConnectionForm';
import { ConnectionEditorPanel } from './ConnectionEditorPanel';
import type { ConnectionProfile } from '../../types/connection';

interface ConnectionFormPanelProps {
    /** Editing an existing gateway, or null/undefined to create a new one. */
    profile?: ConnectionProfile | null;
    /** Names already taken in the pool — the form rejects a duplicate. */
    existingNames?: string[];
    showUriField?: boolean;
    /** Fired after the gateway is persisted (create or update). */
    onSaved: () => void;
    onCancel: () => void;
}

/**
 * Self-contained create/edit surface for a pool connection: owns
 * {@link useConnectionForm} and renders the two-column
 * {@link ConnectionEditorPanel} (provider identity + credentials form).
 * Settings → Connections drives the editor through its own feature hook; this
 * exists for the other place a connection is created — the project dialog's
 * environment picker (which is also the only route on first run, when
 * Settings isn't mounted yet).
 */
export const ConnectionFormPanel: React.FC<ConnectionFormPanelProps> = ({
    profile = null,
    existingNames = [],
    showUriField,
    onSaved,
    onCancel,
}) => {
    const form = useConnectionForm({
        profile,
        existingNames,
        onSaved,
    });

    return <ConnectionEditorPanel form={form} showUriField={showUriField} onCancel={onCancel} />;
};
