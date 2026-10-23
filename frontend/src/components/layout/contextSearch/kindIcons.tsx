// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Eye, Hash, Layers, Link2, List, Sigma, Table2, Type, Zap } from 'lucide-react';

import type { ObjectKind } from '../../../lib/contextSearchTemplates';

export const KIND_ICON: Record<ObjectKind, React.ReactNode> = {
    table: <Table2 size={14} />,
    foreign_table: <Link2 size={14} />,
    view: <Eye size={14} />,
    materialized_view: <Layers size={14} />,
    function: <Zap size={14} />,
    index: <Hash size={14} />,
    sequence: <List size={14} />,
    data_type: <Type size={14} />,
    aggregate_function: <Sigma size={14} />,
};
