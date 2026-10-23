// SPDX-License-Identifier: GPL-3.0-only

import React, { useRef } from 'react';
import { Keyboard } from 'lucide-react';
import { SettingsClasses } from './SettingsStyles';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { SettingField } from './SettingItem';
import { Button, Input } from '../../ui';

interface Props {
    profileName: string;
    onProfileNameChange: (val: string) => void;
    onExportProfile: () => void;
    onImportProfile: (file: File) => Promise<void>;
}

export const SettingsProfiles: React.FC<Props> = ({
    profileName,
    onProfileNameChange,
    onExportProfile,
    onImportProfile,
}) => {
    const profileInputRef = useRef<HTMLInputElement>(null);

    return (
        <div className={SettingsClasses.section}>
            <SettingsSectionHeader
                icon={Keyboard}
                title='Profiles'
                description='Export and import your theme, layout and shortcut configuration.'
            />
            <div className={SettingsClasses.sectionContent}>
                <SettingField
                    label='Profile Name'
                    helperText='Used as file name and profile metadata.'
                >
                    <Input
                        value={profileName}
                        onChange={e => onProfileNameChange(e.target.value)}
                        placeholder='Zentro Profile'
                    />
                </SettingField>

                <div className='flex flex-wrap items-center gap-2.5'>
                    <Button onClick={onExportProfile} variant='outline' size='sm'>
                        Export Profile
                    </Button>
                    <Button
                        onClick={() => profileInputRef.current?.click()}
                        variant='outline'
                        size='sm'
                    >
                        Import Profile
                    </Button>
                    <Input
                        ref={profileInputRef}
                        type='file'
                        accept='.json,.zentro-profile.json'
                        className='hidden'
                        onChange={e => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            void onImportProfile(file).finally(() => {
                                e.target.value = '';
                            });
                        }}
                    />
                </div>
            </div>
        </div>
    );
};
