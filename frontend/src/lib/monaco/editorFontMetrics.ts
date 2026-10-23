// SPDX-License-Identifier: GPL-3.0-only

import type { Monaco } from '@monaco-editor/react';

// Monaco measures glyph widths once, when the editor is created or the font
// options change. The editor fonts are self-hosted webfonts (fonts.css) that
// the browser only fetches on first use and swaps in afterwards, so that first
// measurement is routinely taken against the fallback face. Once the real
// font arrives the text is painted with different advance widths while
// Monaco's caret/selection maths still use the old ones — the caret shows at
// one column and typing lands at another until something (zoom, a font-size
// change) forces a re-measure. remeasureFonts() is that forced re-measure.

const FONT_WEIGHTS = ['400', '700'] as const;

function primaryFamily(fontFamily: string): string {
    return fontFamily.split(',')[0]?.trim() ?? '';
}

async function loadEditorFonts(fontFamily: string, fontSize: number): Promise<void> {
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    const family = primaryFamily(fontFamily);
    if (!fonts || !family) return;
    await Promise.allSettled(
        FONT_WEIGHTS.map(weight => fonts.load(`${weight} ${fontSize}px ${family}`)),
    );
}

/**
 * Keeps Monaco's font metrics in sync with the webfont actually being painted.
 * Re-measures once the requested font has loaded, and again whenever the
 * browser finishes loading any further font face. Returns a disposer.
 */
export function syncEditorFontMetrics(
    monaco: Monaco,
    fontFamily: string,
    fontSize: number,
): () => void {
    let disposed = false;
    const remeasure = () => {
        if (!disposed) monaco.editor.remeasureFonts();
    };

    void loadEditorFonts(fontFamily, fontSize).then(remeasure);

    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    fonts?.addEventListener?.('loadingdone', remeasure);
    return () => {
        disposed = true;
        fonts?.removeEventListener?.('loadingdone', remeasure);
    };
}
