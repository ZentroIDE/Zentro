// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Ban, Italic, Palette } from 'lucide-react';
import { SettingsClasses } from './SettingsStyles';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { SettingToggle } from './SettingItem';
import { SqlStylePreview } from './SqlStylePreview';
import {
    EMPTY_SQL_TOKEN_STYLE,
    isDefaultTokenStyle,
    SQL_COLOR_PALETTE,
    SQL_FONT_WEIGHTS,
    SQL_STYLE_CATEGORIES,
    type SqlEditorStyle,
    type SqlFontWeight,
    type SqlStyleAppearance,
    type SqlStyleCategory,
    type SqlTokenStyle,
} from '../../../lib/sqlEditorStyle';
import {
    Button,
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../../ui';

interface Props {
    value: SqlEditorStyle;
    /** Which theme the user is looking at; the tabs start on it. */
    currentAppearance: SqlStyleAppearance;
    /** The theme preset chosen for each appearance, used for the preview's base colours. */
    presetIds?: Partial<Record<SqlStyleAppearance, string>>;
    onChange: (next: SqlEditorStyle) => void;
}

const WEIGHT_LABEL: Record<SqlFontWeight, string> = {
    normal: 'Normal',
    semibold: 'Semi-bold',
    bold: 'Bold',
};

interface RowProps {
    category: SqlStyleCategory;
    appearance: SqlStyleAppearance;
    style: SqlTokenStyle;
    onChange: (next: SqlTokenStyle | null) => void;
}

const SWATCH_CLASS =
    'size-5 shrink-0 rounded-full border border-border p-0 flex items-center justify-center';

interface SwatchProps {
    label: string;
    color: string;
    name: string;
    selected: boolean;
    onSelect?: () => void;
    asRadio?: boolean;
}

// One colour dot. `color` is empty for "theme default", drawn as a crossed circle.
const Swatch = React.forwardRef<HTMLButtonElement, SwatchProps>(
    ({ label, color, name, selected, onSelect, asRadio = true, ...rest }, ref) => (
        <Button
            {...rest}
            ref={ref}
            variant='ghost'
            size='icon'
            role={asRadio ? 'radio' : undefined}
            aria-checked={asRadio ? selected : undefined}
            aria-label={`${label}: ${name}`}
            title={name}
            className={`${SWATCH_CLASS} ${selected ? 'ring-2 ring-primary ring-offset-1' : ''}`}
            style={color ? { background: color } : undefined}
            onClick={onSelect}
        >
            {color ? null : <Ban className='text-muted-foreground' />}
        </Button>
    ),
);
Swatch.displayName = 'Swatch';

const StyleRow: React.FC<RowProps> = ({ category, appearance, style, onChange }) => {
    const palette = SQL_COLOR_PALETTE[appearance];
    const active = palette.find(entry => entry.value === style.color);
    const activeName =
        style.color === '' ? 'Theme default' : (active?.name ?? `Custom ${style.color}`);

    return (
        <div className='grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-1.5'>
            <div className='flex min-w-0 flex-col'>
                <span className='text-small font-semibold text-foreground'>{category.label}</span>
                <span className='truncate font-mono text-label text-muted-foreground'>
                    {category.hint}
                </span>
            </div>
            <div className='flex items-center gap-3'>
                <HoverCard openDelay={80} closeDelay={120}>
                    <HoverCardTrigger asChild>
                        <Swatch
                            asRadio={false}
                            label={`${category.label} colour`}
                            color={style.color}
                            name={activeName}
                            selected={false}
                        />
                    </HoverCardTrigger>
                    <HoverCardContent
                        align='end'
                        className='w-auto p-2'
                        aria-label={`${category.label} colours`}
                    >
                        <div
                            role='radiogroup'
                            aria-label={`${category.label} colour`}
                            className='flex items-center gap-1.5'
                        >
                            <Swatch
                                label={category.label}
                                color=''
                                name='Theme default'
                                selected={style.color === ''}
                                onSelect={() => onChange({ ...style, color: '' })}
                            />
                            {palette.map(entry => (
                                <Swatch
                                    key={entry.value}
                                    label={category.label}
                                    color={entry.value}
                                    name={entry.name}
                                    selected={style.color === entry.value}
                                    onSelect={() => onChange({ ...style, color: entry.value })}
                                />
                            ))}
                        </div>
                    </HoverCardContent>
                </HoverCard>

                <Select
                    value={style.weight}
                    onValueChange={weight =>
                        onChange({ ...style, weight: weight as SqlFontWeight })
                    }
                >
                    <SelectTrigger
                        variant='outline'
                        className='w-28'
                        aria-label={`${category.label} font weight`}
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {SQL_FONT_WEIGHTS.map(weight => (
                            <SelectItem key={weight} value={weight}>
                                {WEIGHT_LABEL[weight]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Button
                    variant={style.italic ? 'secondary' : 'ghost'}
                    size='icon'
                    aria-pressed={style.italic}
                    aria-label={`${category.label} italic`}
                    title='Italic'
                    onClick={() => onChange({ ...style, italic: !style.italic })}
                >
                    <Italic />
                </Button>

                <Button
                    variant='ghost'
                    size='micro'
                    disabled={isDefaultTokenStyle(style)}
                    onClick={() => onChange(null)}
                >
                    Reset
                </Button>
            </div>
        </div>
    );
};

interface PanelProps extends Omit<Props, 'currentAppearance' | 'presetIds'> {
    appearance: SqlStyleAppearance;
    presetId?: string;
}

const AppearancePanel: React.FC<PanelProps> = ({ appearance, presetId, value, onChange }) => {
    const overrides = value[appearance];

    const update = (categoryId: string, next: SqlTokenStyle | null) => {
        const map = { ...overrides };
        if (!next || isDefaultTokenStyle(next)) delete map[categoryId];
        else map[categoryId] = next;
        onChange({ ...value, [appearance]: map });
    };

    const renderRow = (category: SqlStyleCategory) => (
        <StyleRow
            key={`${appearance}-${category.id}`}
            category={category}
            appearance={appearance}
            style={overrides[category.id] ?? EMPTY_SQL_TOKEN_STYLE}
            onChange={next => update(category.id, next)}
        />
    );

    return (
        <div className='flex flex-col gap-3'>
            <div className='sticky top-0 z-10 -mx-1'>
                <SqlStylePreview
                    appearance={appearance}
                    presetId={presetId}
                    overrides={overrides}
                    schemaHighlight={value.schemaHighlight}
                />
            </div>

            <div className='divide-y divide-border/50'>
                {SQL_STYLE_CATEGORIES.filter(category => !category.schema).map(renderRow)}
            </div>

            <SettingToggle
                title='Highlight table, column and alias names'
                description='Colours names using your schema. Experimental: scans the script as you type.'
                checked={value.schemaHighlight}
                onCheckedChange={checked => onChange({ ...value, schemaHighlight: checked })}
            />
            {value.schemaHighlight && (
                <div className='divide-y divide-border/50'>
                    {SQL_STYLE_CATEGORIES.filter(category => category.schema).map(renderRow)}
                </div>
            )}

            <div>
                <Button
                    variant='outline'
                    size='micro'
                    disabled={Object.keys(overrides).length === 0}
                    onClick={() => onChange({ ...value, [appearance]: {} })}
                >
                    Reset all {appearance} overrides
                </Button>
            </div>
        </div>
    );
};

export const SettingsEditorColors: React.FC<Props> = ({
    value,
    currentAppearance,
    presetIds,
    onChange,
}) => {
    const [appearance, setAppearance] = React.useState<SqlStyleAppearance>(currentAppearance);

    return (
        <div className={SettingsClasses.section}>
            <SettingsSectionHeader
                icon={Palette}
                title='SQL Editor Colors'
                description='Override how each kind of SQL token is drawn. Light and dark themes keep separate overrides, and changes apply to open editors immediately.'
            />
            <div className={SettingsClasses.sectionContent}>
                <div role='group' aria-label='Theme to edit' className='flex items-center gap-2'>
                    {(['light', 'dark'] as const).map(tab => (
                        <Button
                            key={tab}
                            variant={appearance === tab ? 'default' : 'ghost'}
                            size='sm'
                            aria-pressed={appearance === tab}
                            onClick={() => setAppearance(tab)}
                        >
                            {tab === 'light' ? 'Light themes' : 'Dark themes'}
                        </Button>
                    ))}
                </div>
                <AppearancePanel
                    appearance={appearance}
                    presetId={presetIds?.[appearance]}
                    value={value}
                    onChange={onChange}
                />
            </div>
        </div>
    );
};
