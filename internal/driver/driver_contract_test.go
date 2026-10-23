// SPDX-License-Identifier: GPL-3.0-only

package driver_test

import (
	"testing"

	"zentro/internal/driver"
	"zentro/internal/driver/mssql"
	"zentro/internal/driver/mysql"
	"zentro/internal/driver/postgres"
	"zentro/internal/driver/sqlite"
)

func TestDriversImplementDatabaseDriverContract(t *testing.T) {
	var driversUnderTest = []driver.DatabaseDriver{
		postgres.New(),
		mssql.New(),
		mysql.New(),
		sqlite.New(),
	}

	for _, d := range driversUnderTest {
		if d.Name() == "" {
			t.Fatalf("driver name must not be empty")
		}
		if d.Name() != "mysql" && d.DefaultSchema() == "" {
			t.Fatalf("driver %s default schema must not be empty", d.Name())
		}
	}

	for _, d := range []any{postgres.New(), mysql.New(), mssql.New(), sqlite.New()} {
		if _, ok := d.(driver.ReadOnlyRunner); !ok {
			t.Fatalf("%T must implement ReadOnlyRunner", d)
		}
		if _, ok := d.(driver.DryRunner); !ok {
			t.Fatalf("%T must implement DryRunner", d)
		}
		if _, ok := d.(driver.SQLValidator); !ok {
			t.Fatalf("%T must implement SQLValidator", d)
		}
		if _, ok := d.(driver.PlanExplainer); !ok {
			t.Fatalf("%T must implement PlanExplainer", d)
		}
		if _, ok := d.(driver.TableStatsReader); !ok {
			t.Fatalf("%T must implement TableStatsReader", d)
		}
		if _, ok := d.(driver.IndexReader); !ok {
			t.Fatalf("%T must implement IndexReader", d)
		}
		if _, ok := d.(driver.DependencyReader); !ok {
			t.Fatalf("%T must implement DependencyReader", d)
		}
	}
}
