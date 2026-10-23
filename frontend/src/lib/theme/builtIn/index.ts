// SPDX-License-Identifier: GPL-3.0-only

import { registerThemePreset } from '../themePresetRegistry';
import { dark2026 } from './dark2026';
import { light2026 } from './light2026';
import { solarizedDark } from './solarizedDark';
import { solarizedLight } from './solarizedLight';

let builtInThemePresetsRegistered = false;

export function registerBuiltInThemePresets(): void {
    if (builtInThemePresetsRegistered) return;

    registerThemePreset(dark2026);
    registerThemePreset(light2026);
    registerThemePreset(solarizedDark);
    registerThemePreset(solarizedLight);

    builtInThemePresetsRegistered = true;
}
