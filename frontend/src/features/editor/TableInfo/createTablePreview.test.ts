// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { models } from '../../../../wailsjs/go/models';
import { buildCreateTablePreviewLines } from './createTablePreview';

describe('buildCreateTablePreviewLines', () => {
    it('builds canonical postgres create statements for serial primary keys', () => {
        const lines = buildCreateTablePreviewLines('postgres', 'app', 'new table', [
            new models.ColumnDef({
                Name: 'id',
                DataType: 'SERIAL',
                FullDataType: 'SERIAL',
                IsNullable: false,
                IsPrimaryKey: true,
                DefaultValue: '',
            }),
            new models.ColumnDef({
                Name: 'new_column_2',
                DataType: 'varchar(255)',
                FullDataType: 'varchar(255)',
                IsNullable: true,
                IsPrimaryKey: false,
                DefaultValue: '',
            }),
        ]);

        expect(lines.join('\n')).toContain(`CREATE SEQUENCE "app"."new table_id_seq";`);
        expect(lines.join('\n')).toContain(`CREATE TABLE "app"."new table" (`);
        expect(lines.join('\n')).toContain(
            `"id" integer NOT NULL DEFAULT nextval('app."new table_id_seq"'::regclass)`,
        );
        expect(lines.join('\n')).toContain(`PRIMARY KEY ("id")`);
        expect(lines.join('\n')).toContain(
            `ALTER SEQUENCE "app"."new table_id_seq" OWNED BY "app"."new table"."id";`,
        );
    });
});
