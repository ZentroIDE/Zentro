// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Laptop } from 'lucide-react';
import { SettingsClasses } from './SettingsStyles';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { SettingField, SettingToggle } from './SettingItem';
import { useThemePresets } from '../../../lib/theme/themePresetRegistry';
import {
    Input,
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectSeparator,
    SelectTrigger,
    SelectValue,
} from '../../ui';

interface Props {
    theme: string;
    onThemeChange: (val: string) => void;
    resolvedTheme: 'light' | 'dark';
    fontSize: number;
    onFontSizeChange: (val: number) => void;
    minimap: boolean;
    onMinimapChange: (val: boolean) => void;
    errorLens: boolean;
    onErrorLensChange: (val: boolean) => void;
    editorFocusMode: boolean;
    onEditorFocusModeChange: (val: boolean) => void;
    editorFocusWidth: number;
    onEditorFocusWidthChange: (val: number) => void;
    fontFamily: string;
    onFontFamilyChange: (val: string) => void;
    monoFamily: string;
    onMonoFamilyChange: (val: string) => void;
    themePresetLight: string;
    themePresetDark: string;
    onThemePresetChange: (appearance: 'light' | 'dark', presetId: string) => void;
}

export const SettingsAppearance: React.FC<Props> = ({
    theme,
    onThemeChange,
    resolvedTheme,
    fontSize,
    onFontSizeChange,
    minimap,
    onMinimapChange,
    errorLens,
    onErrorLensChange,
    editorFocusMode,
    onEditorFocusModeChange,
    editorFocusWidth,
    onEditorFocusWidthChange,
    fontFamily,
    onFontFamilyChange,
    monoFamily,
    onMonoFamilyChange,
    themePresetLight,
    themePresetDark,
    onThemePresetChange,
}) => {
    const presets = useThemePresets();
    const lightPresets = presets.filter(preset => preset.appearance === 'light');
    const darkPresets = presets.filter(preset => preset.appearance === 'dark');
    const activePresetId = resolvedTheme === 'dark' ? themePresetDark : themePresetLight;
    const followsSystem = theme === 'system';

    const handleThemeSelect = (presetId: string) => {
        const preset = presets.find(item => item.id === presetId);
        if (!preset) return;
        // onThemePresetChange commits both the preset and its light/dark family
        // in a single save — calling onThemeChange too would fire a second,
        // racing read-modify-write of the whole preferences object.
        onThemePresetChange(preset.appearance, presetId);
    };
    return (
        <div className={SettingsClasses.section}>
            <SettingsSectionHeader
                icon={Laptop}
                title='Appearance'
                description='Customize the visual personality of your project context.'
            />
            <div className={SettingsClasses.sectionContent}>
                <SettingToggle
                    title='Follow System Theme'
                    description='Automatically switch between light and dark based on your OS setting.'
                    checked={followsSystem}
                    onCheckedChange={checked => onThemeChange(checked ? 'system' : resolvedTheme)}
                />

                <SettingField label='Theme' helperText='Pick a color theme in one step.'>
                    <Select
                        value={activePresetId}
                        onValueChange={handleThemeSelect}
                        disabled={followsSystem}
                    >
                        <SelectTrigger variant='outline'>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                <SelectLabel>Light themes</SelectLabel>
                                {lightPresets.map(preset => (
                                    <SelectItem key={preset.id} value={preset.id}>
                                        {preset.label}
                                    </SelectItem>
                                ))}
                            </SelectGroup>
                            <SelectSeparator />
                            <SelectGroup>
                                <SelectLabel>Dark themes</SelectLabel>
                                {darkPresets.map(preset => (
                                    <SelectItem key={preset.id} value={preset.id}>
                                        {preset.label}
                                    </SelectItem>
                                ))}
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                </SettingField>

                <SettingField label='Interface Font' helperText="The app's UI font.">
                    <Select value={fontFamily} onValueChange={onFontFamilyChange}>
                        <SelectTrigger variant='outline'>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value='system'>System Default</SelectItem>
                            <SelectItem value='inter'>Inter</SelectItem>
                        </SelectContent>
                    </Select>
                </SettingField>

                <SettingField
                    label='Editor Font'
                    helperText='Monospace font used in the SQL editor.'
                >
                    <Select value={monoFamily} onValueChange={onMonoFamilyChange}>
                        <SelectTrigger variant='outline'>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value='system'>System Monospace</SelectItem>
                            <SelectItem value='cascadia'>Cascadia Code</SelectItem>
                            <SelectItem value='jetbrains'>JetBrains Mono</SelectItem>
                            <SelectItem value='firaCode'>Fira Code</SelectItem>
                        </SelectContent>
                    </Select>
                </SettingField>

                <SettingField
                    label='Editor Text Size'
                    helperText='Adjust for optimal code readability.'
                >
                    <div className='flex items-center gap-4'>
                        <Input
                            className='max-w-30'
                            type='number'
                            min={8}
                            size='sm'
                            max={48}
                            value={fontSize}
                            onChange={e => onFontSizeChange(parseInt(e.target.value) || 14)}
                        />
                        <span className='text-small text-muted-foreground'>Pixels</span>
                    </div>
                </SettingField>

                <SettingToggle
                    title='Editor Minimap'
                    description='Show a thumbnail overview of the file on the right side of the editor.'
                    checked={minimap}
                    onCheckedChange={onMinimapChange}
                />

                <SettingToggle
                    title='Inline Diagnostics'
                    description='Show error and warning messages at the end of the affected line, like the Error Lens extension.'
                    checked={errorLens}
                    onCheckedChange={onErrorLensChange}
                />

                <SettingToggle
                    title='Editor Focus Mode'
                    description='Center the editor at a fixed width for distraction-free editing.'
                    checked={editorFocusMode}
                    onCheckedChange={onEditorFocusModeChange}
                />

                <SettingField
                    label='Focus Width'
                    helperText='Max width of the editor when focus mode is on.'
                >
                    <div className='flex items-center gap-4'>
                        <Input
                            className='max-w-30'
                            type='number'
                            min={400}
                            max={2400}
                            size='sm'
                            disabled={!editorFocusMode}
                            value={editorFocusWidth}
                            onChange={e =>
                                onEditorFocusWidthChange(parseInt(e.target.value) || 900)
                            }
                        />
                        <span className='text-small text-muted-foreground'>Pixels</span>
                    </div>
                </SettingField>
            </div>
        </div>
    );
};
