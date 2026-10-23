// SPDX-License-Identifier: GPL-3.0-only

import { SAFETY_LEVEL } from '../../../lib/constants';
import React from 'react';
import { Database, Lock } from 'lucide-react';
import { SettingsClasses } from './SettingsStyles';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { SettingField, SettingToggle } from './SettingItem';
import {
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectSeparator,
    SelectTrigger,
    SelectValue,
} from '../../ui';
import { getEnvironmentMeta } from '../../../lib/projects';
import type { EnvironmentKey } from '../../../types/project';
import type { SafetyLevel } from '../../../types/policy';

interface Props {
    connectTimeout: number;
    onConnectTimeoutChange: (val: number) => void;
    queryTimeout: number;
    onQueryTimeoutChange: (val: number) => void;
    activeSafetyEnvironment: EnvironmentKey;
    safetyLevel: SafetyLevel;
    safetyLevelLocked: boolean;
    onSafetyLevelChange: (val: SafetyLevel) => void;
    riskHighlight: boolean;
    onRiskHighlightChange: (val: boolean) => void;
}

const SAFETY_LEVEL_EXPLANATIONS: Record<SafetyLevel, { title: string; description: string }> = {
    strict: {
        title: 'Strict',
        description: 'Blocks UPDATE/DELETE without WHERE. Other writes still require confirmation.',
    },
    balanced: {
        title: 'Balanced',
        description:
            'Prompts for write operations. Destructive writes always require explicit confirmation.',
    },
    relaxed: {
        title: 'Relaxed',
        description:
            'Allows non-destructive writes (e.g. INSERT/CREATE) without prompt. Destructive writes still prompt.',
    },
};

export const SettingsData: React.FC<Props> = ({
    connectTimeout,
    onConnectTimeoutChange,
    queryTimeout,
    onQueryTimeoutChange,
    activeSafetyEnvironment,
    safetyLevel,
    safetyLevelLocked,
    onSafetyLevelChange,
    riskHighlight,
    onRiskHighlightChange,
}) => {
    const [hoveredSafetyLevel, setHoveredSafetyLevel] = React.useState<SafetyLevel>(safetyLevel);
    const activeSafetyEnvironmentLabel = getEnvironmentMeta(activeSafetyEnvironment).label;
    const hoveredSafetyInfo = SAFETY_LEVEL_EXPLANATIONS[hoveredSafetyLevel];

    React.useEffect(() => {
        setHoveredSafetyLevel(safetyLevel);
    }, [safetyLevel]);

    return (
        <div className={SettingsClasses.section}>
            <SettingsSectionHeader
                icon={Database}
                title='Data & Query'
                description='Manage performance thresholds for your datasets.'
            />
            <div className={SettingsClasses.sectionContent}>
                <SettingField
                    label='Connection Timeout'
                    helperText='Seconds before aborting login.'
                >
                    <Input
                        type='number'
                        min={5}
                        max={300}
                        value={connectTimeout}
                        onChange={e => onConnectTimeoutChange(parseInt(e.target.value) || 10)}
                    />
                </SettingField>

                <SettingField label='Execution Timeout' helperText='Seconds for long queries.'>
                    <Input
                        type='number'
                        min={5}
                        max={100000}
                        value={queryTimeout}
                        onChange={e => onQueryTimeoutChange(parseInt(e.target.value) || 60)}
                    />
                </SettingField>

                <SettingField label='Write Safety Level'>
                    <Select
                        value={safetyLevel}
                        onValueChange={value => onSafetyLevelChange(value as SafetyLevel)}
                        onOpenChange={open => {
                            if (open) {
                                setHoveredSafetyLevel(safetyLevel);
                            }
                        }}
                    >
                        <SelectTrigger disabled={safetyLevelLocked} aria-label='Write Safety Level'>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className='p-0'>
                            <SelectItem
                                value={SAFETY_LEVEL.STRICT}
                                onPointerMove={() => setHoveredSafetyLevel(SAFETY_LEVEL.STRICT)}
                                onFocus={() => setHoveredSafetyLevel(SAFETY_LEVEL.STRICT)}
                            >
                                Strict
                            </SelectItem>
                            <SelectItem
                                value={SAFETY_LEVEL.BALANCED}
                                onPointerMove={() => setHoveredSafetyLevel(SAFETY_LEVEL.BALANCED)}
                                onFocus={() => setHoveredSafetyLevel(SAFETY_LEVEL.BALANCED)}
                            >
                                Balanced
                            </SelectItem>
                            <SelectItem
                                value={SAFETY_LEVEL.RELAXED}
                                onPointerMove={() => setHoveredSafetyLevel(SAFETY_LEVEL.RELAXED)}
                                onFocus={() => setHoveredSafetyLevel(SAFETY_LEVEL.RELAXED)}
                            >
                                Relaxed
                            </SelectItem>
                            <SelectSeparator className='mx-0 my-0' />
                            <div className='px-3 py-2 text-label text-muted-foreground'>
                                {hoveredSafetyInfo.description}
                            </div>
                        </SelectContent>
                    </Select>
                    {safetyLevelLocked ? (
                        <p className='flex items-center gap-1.5 text-label text-muted-foreground'>
                            <Lock size={12} aria-hidden />
                            {`${activeSafetyEnvironmentLabel} is always Strict — the safety floor cannot be lowered.`}
                        </p>
                    ) : (
                        <p className='text-label text-muted-foreground'>
                            {`Applies to current environment: ${activeSafetyEnvironmentLabel}. Strict blocks UPDATE/DELETE without WHERE.`}
                        </p>
                    )}
                </SettingField>

                <SettingToggle
                    title='Risk Highlight in Editor'
                    description='Tint destructive and write statements in the SQL editor.'
                    checked={riskHighlight}
                    onCheckedChange={onRiskHighlightChange}
                />
            </div>
        </div>
    );
};
