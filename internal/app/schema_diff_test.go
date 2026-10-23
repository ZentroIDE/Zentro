// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"strings"
	"testing"

	"zentro/internal/constant"
	"zentro/internal/models"
)

type SchemaSnapshot = models.SchemaSnapshot
type SchemaTableSnapshot = models.SchemaTableSnapshot

func TestGenerateSchemaMigration_CreateAndDropTable(t *testing.T) {
	left := SchemaSnapshot{
		Driver:     constant.DriverPostgres,
		SchemaName: "public",
		Supported:  true,
		Tables: []SchemaTableSnapshot{
			{
				Name: "accounts",
				DDL:  `CREATE TABLE public.accounts (id bigint NOT NULL);`,
				Columns: []models.ColumnDef{
					{Name: "id", DataType: "bigint", FullDataType: "bigint", IsNullable: false},
				},
			},
		},
	}
	right := SchemaSnapshot{
		Driver:     constant.DriverPostgres,
		SchemaName: "public",
		Supported:  true,
		Tables: []SchemaTableSnapshot{
			{
				Name: "legacy_users",
				DDL:  `CREATE TABLE public.legacy_users (id bigint NOT NULL);`,
				Columns: []models.ColumnDef{
					{Name: "id", DataType: "bigint", FullDataType: "bigint", IsNullable: false},
				},
			},
		},
	}

	result, err := generateSchemaMigration(left, right)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(result.SQL, `CREATE TABLE "public"."accounts"`) {
		t.Fatalf("expected create table in migration, got: %s", result.SQL)
	}
	if !strings.Contains(result.SQL, `DROP TABLE "public"."legacy_users" CASCADE;`) {
		t.Fatalf("expected drop table in migration, got: %s", result.SQL)
	}
}

func TestGenerateSchemaMigration_PostgresCreateTableWithSequenceAndQuotedNames(t *testing.T) {
	left := SchemaSnapshot{
		Driver:     constant.DriverPostgres,
		SchemaName: "app",
		Supported:  true,
		Tables: []SchemaTableSnapshot{
			{
				Name: "new table",
				DDL:  `CREATE TABLE "app"."new table" ("id" integer NOT NULL DEFAULT nextval('app."new table_id_seq"'::regclass), "new_column_2" character varying(255));`,
				Columns: []models.ColumnDef{
					{
						Name:           "id",
						DataType:       "integer",
						FullDataType:   "integer",
						IsNullable:     false,
						DefaultValue:   `nextval('app."new table_id_seq"'::regclass)`,
						GenerationKind: "sequence",
						SequenceSchema: "app",
						SequenceName:   "new table_id_seq",
					},
					{
						Name:         "new_column_2",
						DataType:     "character varying",
						FullDataType: "character varying(255)",
						IsNullable:   true,
					},
				},
			},
		},
	}
	right := SchemaSnapshot{
		Driver:     constant.DriverPostgres,
		SchemaName: "app",
		Supported:  true,
	}

	result, err := generateSchemaMigration(left, right)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	expectContains(t, result.SQL, `CREATE SEQUENCE "app"."new table_id_seq";`)
	expectContains(t, result.SQL, `CREATE TABLE "app"."new table" (`)
	expectContains(t, result.SQL, `"id" integer NOT NULL DEFAULT nextval('app."new table_id_seq"'::regclass)`)
	expectContains(t, result.SQL, `"new_column_2" character varying(255) NULL`)
	expectContains(t, result.SQL, `ALTER SEQUENCE "app"."new table_id_seq" OWNED BY "app"."new table"."id";`)
}

func TestGenerateSchemaMigration_TableColumnChanges(t *testing.T) {
	left := SchemaSnapshot{
		Driver:     constant.DriverPostgres,
		SchemaName: "public",
		Supported:  true,
		Tables: []SchemaTableSnapshot{
			{
				Name: "accounts",
				DDL:  `CREATE TABLE public.accounts (account_id bigint NOT NULL, email varchar(255) NULL DEFAULT ''::character varying, status text NOT NULL);`,
				Columns: []models.ColumnDef{
					{Name: "account_id", DataType: "bigint", FullDataType: "bigint", IsNullable: false},
					{Name: "email", DataType: "character varying", FullDataType: "varchar(255)", IsNullable: true, DefaultValue: `''::character varying`},
					{Name: "status", DataType: "text", FullDataType: "text", IsNullable: false},
				},
			},
		},
	}
	right := SchemaSnapshot{
		Driver:     constant.DriverPostgres,
		SchemaName: "public",
		Supported:  true,
		Tables: []SchemaTableSnapshot{
			{
				Name: "accounts",
				DDL:  `CREATE TABLE public.accounts (id bigint NOT NULL, email text NOT NULL, obsolete text NULL);`,
				Columns: []models.ColumnDef{
					{Name: "id", DataType: "bigint", FullDataType: "bigint", IsNullable: false},
					{Name: "email", DataType: "text", FullDataType: "text", IsNullable: false},
					{Name: "obsolete", DataType: "text", FullDataType: "text", IsNullable: true},
				},
			},
		},
	}

	result, err := generateSchemaMigration(left, right)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	expectContains(t, result.SQL, `ALTER TABLE "public"."accounts" RENAME COLUMN "id" TO "account_id";`)
	expectContains(t, result.SQL, `ALTER TABLE "public"."accounts" DROP COLUMN "obsolete";`)
	expectContains(t, result.SQL, `ALTER TABLE "public"."accounts" ADD COLUMN "status" text NOT NULL;`)
	expectContains(t, result.SQL, `ALTER TABLE "public"."accounts" ALTER COLUMN "email" TYPE varchar(255) USING "email"::varchar(255);`)
	expectContains(t, result.SQL, `ALTER TABLE "public"."accounts" ALTER COLUMN "email" DROP NOT NULL;`)
	expectContains(t, result.SQL, `ALTER TABLE "public"."accounts" ALTER COLUMN "email" SET DEFAULT ''::character varying;`)
}

func TestGenerateSchemaMigration_MySQL(t *testing.T) {
	left := SchemaSnapshot{
		Driver:     constant.DriverMySQL,
		SchemaName: "shop",
		Supported:  true,
		Tables: []SchemaTableSnapshot{
			{
				Name: "orders",
				DDL:  "CREATE TABLE `orders` (`id` int NOT NULL, `amount` decimal(10,2) NULL);",
				Columns: []models.ColumnDef{
					{Name: "id", DataType: "int", FullDataType: "int", IsNullable: false},
					{Name: "amount", DataType: "decimal", FullDataType: "decimal(10,2)", IsNullable: true},
				},
			},
		},
	}
	right := SchemaSnapshot{
		Driver:     constant.DriverMySQL,
		SchemaName: "shop",
		Supported:  true,
		Tables: []SchemaTableSnapshot{
			{
				Name: "orders",
				DDL:  "CREATE TABLE `orders` (`order_id` int NOT NULL, `total` int NOT NULL, `obsolete` text NULL);",
				Columns: []models.ColumnDef{
					{Name: "order_id", DataType: "int", FullDataType: "int", IsNullable: false},
					{Name: "total", DataType: "int", FullDataType: "int", IsNullable: false},
					{Name: "obsolete", DataType: "text", FullDataType: "text", IsNullable: true},
				},
			},
		},
	}

	result, err := generateSchemaMigration(left, right)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	expectContains(t, result.SQL, "ALTER TABLE `shop`.`orders` CHANGE COLUMN `order_id` `id` int;")
	expectContains(t, result.SQL, "ALTER TABLE `shop`.`orders` DROP COLUMN `obsolete`;")
	expectContains(t, result.SQL, "ALTER TABLE `shop`.`orders` ADD COLUMN `amount` decimal(10,2) NULL;")
}

func TestGenerateSchemaMigration_MSSQL(t *testing.T) {
	left := SchemaSnapshot{
		Driver:     constant.DriverSQLServer,
		SchemaName: "dbo",
		Supported:  true,
		Tables: []SchemaTableSnapshot{
			{
				Name: "users",
				DDL:  "CREATE TABLE dbo.users (id int NOT NULL, email varchar(100) NOT NULL);",
				Columns: []models.ColumnDef{
					{Name: "id", DataType: "int", FullDataType: "int", IsNullable: false},
					{Name: "email", DataType: "varchar", FullDataType: "varchar(100)", IsNullable: false},
				},
			},
		},
	}
	right := SchemaSnapshot{
		Driver:     constant.DriverSQLServer,
		SchemaName: "dbo",
		Supported:  true,
		Tables: []SchemaTableSnapshot{
			{
				Name: "users",
				DDL:  "CREATE TABLE dbo.users (old_id int NOT NULL, email varchar(50) NULL);",
				Columns: []models.ColumnDef{
					{Name: "old_id", DataType: "int", FullDataType: "int", IsNullable: false},
					{Name: "email", DataType: "varchar", FullDataType: "varchar(50)", IsNullable: true},
				},
			},
		},
	}

	result, err := generateSchemaMigration(left, right)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	expectContains(t, result.SQL, "EXEC sp_rename '\"dbo\".\"users\".old_id', 'id', 'COLUMN';")
	expectContains(t, result.SQL, "ALTER TABLE \"dbo\".\"users\" ALTER COLUMN \"email\" varchar(100) NOT NULL;")
}

func TestGenerateSchemaMigration_MSSQLAddsPrimaryKeyWithoutGenericWarning(t *testing.T) {
	left := SchemaSnapshot{
		Driver:     constant.DriverSQLServer,
		SchemaName: "dbo",
		Supported:  true,
		Tables: []SchemaTableSnapshot{
			{
				Name: "AuditLogs",
				DDL: `CREATE TABLE dbo.AuditLogs (
Id int NOT NULL,
UserId nvarchar(100),
Action nvarchar(max),
EntityName nvarchar(100),
Logs nvarchar(max),
CreateTime datetime,
PRIMARY KEY (Id)
);`,
				Columns: []models.ColumnDef{
					{Name: "Id", DataType: "int", FullDataType: "int", IsNullable: false, IsPrimaryKey: true},
					{Name: "UserId", DataType: "nvarchar", FullDataType: "nvarchar(100)", IsNullable: true},
					{Name: "Action", DataType: "nvarchar", FullDataType: "nvarchar(MAX)", IsNullable: true},
					{Name: "EntityName", DataType: "nvarchar", FullDataType: "nvarchar(100)", IsNullable: true},
					{Name: "Logs", DataType: "nvarchar", FullDataType: "nvarchar(MAX)", IsNullable: true},
					{Name: "CreateTime", DataType: "datetime", FullDataType: "datetime", IsNullable: true},
				},
			},
		},
	}
	right := SchemaSnapshot{
		Driver:     constant.DriverSQLServer,
		SchemaName: "dbo",
		Supported:  true,
		Tables: []SchemaTableSnapshot{
			{
				Name: "AuditLogs",
				DDL: `CREATE TABLE dbo.AuditLogs (
UserId nvarchar(100),
Action nvarchar(max),
EntityName nvarchar(100),
Logs nvarchar(max),
CreateTime datetime,
Id int NOT NULL
);`,
				Columns: []models.ColumnDef{
					{Name: "UserId", DataType: "nvarchar", FullDataType: "nvarchar(100)", IsNullable: true},
					{Name: "Action", DataType: "nvarchar", FullDataType: "nvarchar(MAX)", IsNullable: true},
					{Name: "EntityName", DataType: "nvarchar", FullDataType: "nvarchar(100)", IsNullable: true},
					{Name: "Logs", DataType: "nvarchar", FullDataType: "nvarchar(MAX)", IsNullable: true},
					{Name: "CreateTime", DataType: "datetime", FullDataType: "datetime", IsNullable: true},
					{Name: "Id", DataType: "int", FullDataType: "int", IsNullable: false},
				},
			},
		},
	}

	result, err := generateSchemaMigration(left, right)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	expectContains(t, result.SQL, `ALTER TABLE "dbo"."AuditLogs" ADD CONSTRAINT "PK_AuditLogs_Id" PRIMARY KEY ("Id");`)
	if strings.Contains(result.SQL, `Table "dbo"."AuditLogs" has non-column schema differences`) {
		t.Fatalf("did not expect generic table warning, got: %s", result.SQL)
	}
}

func TestGenerateSchemaMigration_MSSQLUpdatesDefaultConstraint(t *testing.T) {
	left := SchemaSnapshot{
		Driver:     constant.DriverSQLServer,
		SchemaName: "dbo",
		Supported:  true,
		Tables: []SchemaTableSnapshot{
			{
				Name: "Departments",
				DDL: `CREATE TABLE dbo.Departments (
RowId int NOT NULL,
Code varchar(50) NOT NULL,
Name nvarchar(100),
Block bit,
CreatedBy varchar(20),
CreatedAt datetime,
LastModifiedBy varchar(20),
LastModifiedAt datetime,
Status int,
Parent nvarchar(100),
BFOCode nvarchar(100),
DepartmentLevel int,
ArchivedAt datetime,
ArchivedBy varchar(20),
ModificationStatus int NOT NULL DEFAULT ((200)),
StoreIndex int,
PRIMARY KEY (Code)
);`,
				Columns: []models.ColumnDef{
					{Name: "RowId", DataType: "int", FullDataType: "int", IsNullable: false},
					{Name: "Code", DataType: "varchar", FullDataType: "varchar(50)", IsNullable: false, IsPrimaryKey: true},
					{Name: "Name", DataType: "nvarchar", FullDataType: "nvarchar(100)", IsNullable: true},
					{Name: "Block", DataType: "bit", FullDataType: "bit", IsNullable: true},
					{Name: "CreatedBy", DataType: "varchar", FullDataType: "varchar(20)", IsNullable: true},
					{Name: "CreatedAt", DataType: "datetime", FullDataType: "datetime", IsNullable: true},
					{Name: "LastModifiedBy", DataType: "varchar", FullDataType: "varchar(20)", IsNullable: true},
					{Name: "LastModifiedAt", DataType: "datetime", FullDataType: "datetime", IsNullable: true},
					{Name: "Status", DataType: "int", FullDataType: "int", IsNullable: true},
					{Name: "Parent", DataType: "nvarchar", FullDataType: "nvarchar(100)", IsNullable: true},
					{Name: "BFOCode", DataType: "nvarchar", FullDataType: "nvarchar(100)", IsNullable: true},
					{Name: "DepartmentLevel", DataType: "int", FullDataType: "int", IsNullable: true},
					{Name: "ArchivedAt", DataType: "datetime", FullDataType: "datetime", IsNullable: true},
					{Name: "ArchivedBy", DataType: "varchar", FullDataType: "varchar(20)", IsNullable: true},
					{Name: "ModificationStatus", DataType: "int", FullDataType: "int", IsNullable: false, DefaultValue: "((200))"},
					{Name: "StoreIndex", DataType: "int", FullDataType: "int", IsNullable: true},
				},
			},
		},
	}
	right := SchemaSnapshot{
		Driver:     constant.DriverSQLServer,
		SchemaName: "dbo",
		Supported:  true,
		Tables: []SchemaTableSnapshot{
			{
				Name: "Departments",
				DDL: `CREATE TABLE dbo.Departments (
RowId int NOT NULL,
Code varchar(50) NOT NULL,
Name nvarchar(100),
Block bit,
CreatedBy varchar(20),
CreatedAt datetime,
LastModifiedBy varchar(20),
LastModifiedAt datetime,
Status int,
Parent nvarchar(100),
BFOCode nvarchar(100),
DepartmentLevel int,
ArchivedAt datetime,
ArchivedBy varchar(20),
ModificationStatus int NOT NULL DEFAULT ((1)),
StoreIndex int,
PRIMARY KEY (Code)
);`,
				Columns: []models.ColumnDef{
					{Name: "RowId", DataType: "int", FullDataType: "int", IsNullable: false},
					{Name: "Code", DataType: "varchar", FullDataType: "varchar(50)", IsNullable: false, IsPrimaryKey: true},
					{Name: "Name", DataType: "nvarchar", FullDataType: "nvarchar(100)", IsNullable: true},
					{Name: "Block", DataType: "bit", FullDataType: "bit", IsNullable: true},
					{Name: "CreatedBy", DataType: "varchar", FullDataType: "varchar(20)", IsNullable: true},
					{Name: "CreatedAt", DataType: "datetime", FullDataType: "datetime", IsNullable: true},
					{Name: "LastModifiedBy", DataType: "varchar", FullDataType: "varchar(20)", IsNullable: true},
					{Name: "LastModifiedAt", DataType: "datetime", FullDataType: "datetime", IsNullable: true},
					{Name: "Status", DataType: "int", FullDataType: "int", IsNullable: true},
					{Name: "Parent", DataType: "nvarchar", FullDataType: "nvarchar(100)", IsNullable: true},
					{Name: "BFOCode", DataType: "nvarchar", FullDataType: "nvarchar(100)", IsNullable: true},
					{Name: "DepartmentLevel", DataType: "int", FullDataType: "int", IsNullable: true},
					{Name: "ArchivedAt", DataType: "datetime", FullDataType: "datetime", IsNullable: true},
					{Name: "ArchivedBy", DataType: "varchar", FullDataType: "varchar(20)", IsNullable: true},
					{Name: "ModificationStatus", DataType: "int", FullDataType: "int", IsNullable: false, DefaultValue: "((1))"},
					{Name: "StoreIndex", DataType: "int", FullDataType: "int", IsNullable: true},
				},
			},
		},
	}

	result, err := generateSchemaMigration(left, right)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	expectContains(t, result.SQL, `WHERE s.name = 'dbo' AND t.name = 'Departments' AND c.name = 'ModificationStatus';`)
	expectContains(t, result.SQL, `ALTER TABLE "dbo"."Departments" ADD DEFAULT (((200))) FOR "ModificationStatus";`)
	if strings.Contains(result.SQL, `Default constraint change detected on Departments.ModificationStatus`) {
		t.Fatalf("did not expect manual default warning, got: %s", result.SQL)
	}
}

func TestGenerateSchemaMigration_SQLite(t *testing.T) {
	left := SchemaSnapshot{Driver: constant.DriverSQLite, SchemaName: "main", Supported: true}
	right := SchemaSnapshot{Driver: constant.DriverSQLite, SchemaName: "main", Supported: true}

	result, err := generateSchemaMigration(left, right)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Supported {
		t.Fatalf("expected SQLite migration to be unsupported")
	}
	expectContains(t, result.UnsupportedMessage, "Visual DDL comparison only")
}

func expectContains(t *testing.T, haystack, needle string) {
	t.Helper()
	if !strings.Contains(haystack, needle) {
		t.Fatalf("expected %q in %s", needle, haystack)
	}
}
