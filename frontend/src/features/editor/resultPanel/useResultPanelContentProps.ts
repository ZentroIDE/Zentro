// SPDX-License-Identifier: GPL-3.0-only

import type { ComponentProps } from 'react';
import type { ResultPanelContent } from './ResultPanelContent';

export function useResultPanelContentProps(
    props: ComponentProps<typeof ResultPanelContent>,
): ComponentProps<typeof ResultPanelContent> {
    return props;
}
