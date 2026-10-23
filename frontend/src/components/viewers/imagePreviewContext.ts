// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

export interface ImagePreviewRequest {
    value: string;
    columnType?: string;
    /** The column was explicitly marked "Image", so the URL heuristic is
     *  bypassed when resolving the source. */
    markedAsImage?: boolean;
}

export type ImagePreviewOpener = (request: ImagePreviewRequest) => void;

/**
 * Lets a cell open the full-size image preview without owning a dialog.
 *
 * A data grid renders one preview trigger per image cell, and a dialog per
 * trigger means a dialog per rendered row: whole component trees, with all of
 * their hooks, mounted and thrown away on every scroll even though at most one
 * of them can ever be open. The provider hoists that single dialog above the
 * grid and hands cells this opener instead.
 *
 * `null` means no host is mounted, and the trigger falls back to owning a
 * dialog of its own so it still works outside a grid.
 */
export const ImagePreviewContext = React.createContext<ImagePreviewOpener | null>(null);

export function useImagePreviewOpener(): ImagePreviewOpener | null {
    return React.useContext(ImagePreviewContext);
}
