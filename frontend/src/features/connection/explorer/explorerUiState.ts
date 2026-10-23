// SPDX-License-Identifier: GPL-3.0-only

import { EXPLORER_PANEL_STATE_DEFAULT } from '../../../components/sidebar/sidebarPanelStateDefaults';

export type ExplorerUiState = typeof EXPLORER_PANEL_STATE_DEFAULT;

export type ExplorerUiStateUpdater = (next: Partial<ExplorerUiState>) => void;
