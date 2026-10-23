// SPDX-License-Identifier: GPL-3.0-only

import { useEffect } from 'react';
import { applyAppZoom, useZoomStore } from '../../stores/zoomStore';

export function useAppZoom() {
    const zoomLevel = useZoomStore(state => state.zoomLevel);

    useEffect(() => {
        applyAppZoom(zoomLevel);
    }, [zoomLevel]);
}
