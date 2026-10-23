// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { GitBranch } from 'lucide-react';
import { SettingsClasses } from './SettingsStyles';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { SettingToggle } from './SettingItem';

interface Props {
    enabled: boolean;
    checked: boolean;
    saving?: boolean;
    repoPath?: string;
    onToggle: (checked: boolean) => void;
}

export const SettingsSourceControl: React.FC<Props> = ({
    enabled,
    checked,
    saving = false,
    repoPath,
    onToggle,
}) => {
    return (
        <div className={SettingsClasses.section}>
            <SettingsSectionHeader
                icon={GitBranch}
                title='Source Control'
                description='Configure project-level Git behavior on app shutdown.'
            />
            <div className={SettingsClasses.sectionContent}>
                <SettingToggle
                    title='Auto commit on app exit'
                    description='Stage all + commit pending changes in this project repository before closing.'
                    checked={checked}
                    onCheckedChange={onToggle}
                    disabled={!enabled || saving}
                />
                {!enabled ? (
                    <span className='text-label text-muted-foreground'>
                        Requires an active project with a configured Git repo path.
                    </span>
                ) : (
                    <span
                        className='truncate text-label text-muted-foreground'
                        title={repoPath || ''}
                    >
                        Repo: {repoPath}
                    </span>
                )}
            </div>
        </div>
    );
};
