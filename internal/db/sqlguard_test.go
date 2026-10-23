// SPDX-License-Identifier: GPL-3.0-only

package db

import "testing"

func TestGuardReadOnlyRejectsWritesAndEvasion(t *testing.T) {
	cases := []struct {
		name, sql, code string
	}{
		{"insert", "INSERT INTO t VALUES (1)", GuardSQLNotAllowed},
		{"update", "UPDATE t SET x = 1", GuardSQLNotAllowed},
		{"delete", "DELETE FROM t", GuardSQLNotAllowed},
		{"ddl create", "CREATE TABLE t (id int)", GuardSQLNotAllowed},
		{"ddl drop", "DROP TABLE t", GuardSQLNotAllowed},
		{"cte write", "WITH x AS (DELETE FROM t RETURNING 1) SELECT * FROM x", GuardSQLNotAllowed},
		{"select into", "SELECT * INTO dest FROM t", GuardSQLNotAllowed},
		{"for update", "SELECT * FROM t FOR UPDATE", GuardSQLNotAllowed},
		{"for share", "SELECT * FROM t FOR SHARE", GuardSQLNotAllowed},
		{"for no key", "SELECT * FROM t FOR NO KEY UPDATE", GuardSQLNotAllowed},
		{"deny pg_read_file", "SELECT pg_read_file('/etc/passwd')", GuardSQLNotAllowed},
		{"deny schema prefix", "SELECT pg_catalog.pg_read_file('x')", GuardSQLNotAllowed},
		{"deny mixed case", "SELECT Pg_Read_File('x')", GuardSQLNotAllowed},
		{"deny quoted ident", `SELECT "pg_read_file"('x')`, GuardSQLNotAllowed},
		{"deny lo_import", "SELECT lo_import('/tmp/x')", GuardSQLNotAllowed},
		{"deny dblink", "SELECT dblink_exec('a','b')", GuardSQLNotAllowed},
		{"deny set_config", "SELECT set_config('a','b', true)", GuardSQLNotAllowed},
		{"deny nextval", "SELECT nextval('t_id_seq')", GuardSQLNotAllowed},
		{"deny in comment around write", "SELECT 1; DELETE FROM t", GuardSQLUnsupported},
		{"comment hiding insert word", "SELECT /* INSERT */ 1", ""},
		{"string hiding insert", "SELECT 'INSERT INTO t'", ""},
		{"dollar quote hiding insert", "SELECT $tag$INSERT INTO t$tag$", ""},
		{"quoted column named insert", `SELECT "INSERT" FROM t`, ""},
		{"unicode escape", `SELECT U&"pg_read_file"()`, GuardSQLUnsupported},
		{"two statements", "SELECT 1; SELECT 2", GuardSQLUnsupported},
		{"plain select", "SELECT id FROM t", ""},
		{"with select", "WITH x AS (SELECT 1) SELECT * FROM x", ""},
		{"values", "VALUES (1)", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := GuardReadOnly("postgres", tc.sql)
			if tc.code == "" {
				if got != nil {
					t.Fatalf("allowed SQL was rejected: %+v", got)
				}
				return
			}
			if got == nil || got.Code != tc.code {
				t.Fatalf("sql %q: got %+v, want code %s", tc.sql, got, tc.code)
			}
		})
	}
}

func TestGuardChangeRejectsDenyListAndEvasion(t *testing.T) {
	cases := []struct {
		name, sql, code string
	}{
		{"drop database", "DROP DATABASE prod", GuardSQLNotAllowed},
		{"drop database if exists", "DROP DATABASE IF EXISTS prod", GuardSQLNotAllowed},
		{"grant", "GRANT SELECT ON t TO u", GuardSQLNotAllowed},
		{"revoke", "REVOKE SELECT ON t FROM u", GuardSQLNotAllowed},
		{"alter system", "ALTER SYSTEM SET wal_level = replica", GuardSQLNotAllowed},
		{"create extension", "CREATE EXTENSION dblink", GuardSQLNotAllowed},
		{"set role", "SET ROLE admin", GuardSQLNotAllowed},
		{"set session authorization", "SET SESSION AUTHORIZATION alice", GuardSQLNotAllowed},
		{"create role", "CREATE ROLE attacker", GuardSQLNotAllowed},
		{"create user if not exists", "CREATE USER IF NOT EXISTS attacker", GuardSQLNotAllowed},
		{"alter role", "ALTER ROLE alice WITH LOGIN", GuardSQLNotAllowed},
		{"drop user", "DROP USER alice", GuardSQLNotAllowed},
		{"copy", "COPY t FROM STDIN", GuardSQLNotAllowed},
		{"copy program", "COPY t FROM PROGRAM 'id'", GuardSQLNotAllowed},
		{"deny function", "UPDATE t SET x = nextval('s')", GuardSQLNotAllowed},
		{"deny schema prefix", "SELECT pg_catalog.pg_read_file('x'); UPDATE t SET x = 1", GuardSQLNotAllowed},
		{"comment around grant", "/* GRANT */ UPDATE t SET x = 1", ""},
		{"string hiding grant", "UPDATE t SET x = 'GRANT SELECT'", ""},
		{"quoted table named grant", `UPDATE "GRANT" SET x = 1`, ""},
		{"unicode escape", `UPDATE t SET x = 1 WHERE U&"col" = 1`, GuardSQLUnsupported},
		{"plain update", "UPDATE t SET x = 1 WHERE id = 1", ""},
		{"create table", "CREATE TABLE t (id int)", ""},
		{"alter table", "ALTER TABLE t ADD COLUMN y int", ""},
		{"drop table", "DROP TABLE t", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := GuardChange(tc.sql)
			if tc.code == "" {
				if got != nil {
					t.Fatalf("allowed SQL was rejected: %+v", got)
				}
				return
			}
			if got == nil || got.Code != tc.code {
				t.Fatalf("sql %q: got %+v, want code %s", tc.sql, got, tc.code)
			}
		})
	}
}
