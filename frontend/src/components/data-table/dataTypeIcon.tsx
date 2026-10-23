// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import {
    ALargeSmall,
    Binary,
    Braces,
    Calendar,
    CircleDot,
    Clock,
    Fingerprint,
    Hash,
    List,
    Network,
    ToggleLeft,
    Timer,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

function resolveDataTypeIcon(type: string): LucideIcon {
    const t = type.toLowerCase();

    if (
        /^(int|integer|bigint|smallint|serial|bigserial|int2|int4|int8|numeric|decimal|float|real|double|money|oid|tinyint|mediumint|year)/.test(
            t,
        )
    )
        return Hash;

    if (/^(bool|boolean|bit)$/.test(t)) return ToggleLeft;

    if (/^(timestamp|timestamptz|datetime)/.test(t)) return Clock;

    if (/^date$/.test(t)) return Calendar;

    if (/^(time|timetz)/.test(t)) return Clock;

    if (/^interval$/.test(t)) return Timer;

    if (/^(json|jsonb)$/.test(t)) return Braces;

    if (/^uuid$/.test(t)) return Fingerprint;

    if (/^(bytea|blob|binary|varbinary|image|tinyblob|mediumblob|longblob)$/.test(t)) return Binary;

    if (/^(inet|cidr|macaddr)/.test(t)) return Network;

    // Postgres array: _int4 or text[]
    if (t.startsWith('_') || t.endsWith('[]')) return List;

    if (
        /^(text|varchar|char|bpchar|name|citext|character|tinytext|mediumtext|longtext|nvarchar|nchar|ntext|string|enum|set)/.test(
            t,
        )
    )
        return ALargeSmall;

    return CircleDot;
}

interface DataTypeIconProps {
    type: string;
    hint?: string;
    size?: number;
    className?: string;
}

export const DataTypeIcon: React.FC<DataTypeIconProps> = React.memo(
    ({ type, hint, size = 16, className }) => {
        const Icon = resolveDataTypeIcon(type);
        return (
            <span title={hint ?? type} className={className}>
                <Icon size={size} />
            </span>
        );
    },
);
