// SPDX-License-Identifier: GPL-3.0-only

import type { ToastPlacement } from '../components/layout/Toast';
import type { CommandId } from '../lib/shortcutRegistry';
import { ShortcutSource } from '../lib/enums';

export { ShortcutSource };

export interface ProfileMetadata {
    name: string;
    description?: string;
    exported_at: string;
}

export interface ProfileSettings {
    theme: string;
    font_size: number;
    toast_placement: ToastPlacement;
    connect_timeout: number;
    query_timeout: number;
    view_mode: boolean;
}

export interface ProfileLayout {
    show_sidebar: boolean;
    show_result_panel: boolean;
    show_right_sidebar: boolean;
}

export interface ProfileCustomization {
    font_family?: string;
    token_preset_id?: string;
    layout_preset_id?: string;
}

export interface ProfileCommandOverridesMetadata {
    source?: string;
    generated_at?: string;
}

export interface ProfileShortcutRule {
    id: string;
    command_id: CommandId;
    binding: string;
    when: string;
    source: ShortcutSource;
    order: number;
}

export interface ZentroProfilePackageV1 {
    schema: 'zentro.profile';
    version: 1;
    metadata: ProfileMetadata;
    settings: ProfileSettings;
    layout: ProfileLayout;
    shortcuts: Record<CommandId, string>;
}

export interface ZentroProfilePackageV2 {
    schema: 'zentro.profile';
    version: 2;
    metadata: ProfileMetadata;
    settings: ProfileSettings;
    layout: ProfileLayout;
    shortcuts: Record<CommandId, string>;
    customization: ProfileCustomization;
    command_overrides: {
        metadata: ProfileCommandOverridesMetadata;
    };
}

export interface ZentroProfilePackageV3 {
    schema: 'zentro.profile';
    version: 3;
    metadata: ProfileMetadata;
    settings: ProfileSettings;
    layout: ProfileLayout;
    shortcuts: Record<CommandId, string>;
    shortcut_rules: ProfileShortcutRule[];
    customization: ProfileCustomization;
    command_overrides: {
        metadata: ProfileCommandOverridesMetadata;
    };
}

export type ZentroProfilePackage =
    | ZentroProfilePackageV1
    | ZentroProfilePackageV2
    | ZentroProfilePackageV3;
