// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

// databaseTypeNames returns the driver's declared type name for each column
// (e.g. "TIMESTAMPTZ", "DATE", "BOOL"), or nil when the driver can't report
// them. Callers hoist this out of their row loop and pass it to
// scanRowAsStrings so temporal values can be rendered per their real type
// instead of guessing from the Go value alone.
func databaseTypeNames(rows *sql.Rows) []string {
	cts, err := rows.ColumnTypes()
	if err != nil {
		return nil
	}
	names := make([]string, len(cts))
	for i, ct := range cts {
		names[i] = ct.DatabaseTypeName()
	}
	return names
}

func scanRowAsStrings(rows *sql.Rows, colCount int, dbTypes []string) []string {
	raw, ptrs := acquireScanBuffers(colCount)
	defer releaseScanBuffers(raw, ptrs)
	_ = rows.Scan(ptrs...)

	result := make([]string, colCount)
	for i, v := range raw {
		if v == nil {
			result[i] = ""
			continue
		}
		dbType := ""
		if i < len(dbTypes) {
			dbType = dbTypes[i]
		}
		result[i] = scanValueToString(v, dbType)
	}
	return result
}

var scanRawPool = sync.Pool{
	New: func() any { return make([]interface{}, 0, 32) },
}

var scanPtrPool = sync.Pool{
	New: func() any { return make([]interface{}, 0, 32) },
}

func acquireScanBuffers(colCount int) ([]interface{}, []interface{}) {
	raw := scanRawPool.Get().([]interface{})
	ptrs := scanPtrPool.Get().([]interface{})

	if cap(raw) < colCount {
		raw = make([]interface{}, colCount)
	} else {
		raw = raw[:colCount]
		for i := range raw {
			raw[i] = nil
		}
	}

	if cap(ptrs) < colCount {
		ptrs = make([]interface{}, colCount)
	} else {
		ptrs = ptrs[:colCount]
	}

	for i := range raw {
		ptrs[i] = &raw[i]
	}
	return raw, ptrs
}

func releaseScanBuffers(raw []interface{}, ptrs []interface{}) {
	for i := range raw {
		raw[i] = nil
	}
	for i := range ptrs {
		ptrs[i] = nil
	}
	scanRawPool.Put(raw[:0])
	scanPtrPool.Put(ptrs[:0])
}

func scanValueToString(v interface{}, dbType string) string {
	switch tv := v.(type) {
	case []byte:
		if len(tv) == 16 {
			return formatSQLServerUUID(tv)
		}
		if utf8.Valid(tv) {
			return string(tv)
		}
		return "data:application/octet-stream;base64," + base64.StdEncoding.EncodeToString(tv)
	case time.Time:
		return formatTemporalValue(tv, dbType)
	case string:
		return tv
	case int:
		return strconv.Itoa(tv)
	case int8:
		return strconv.FormatInt(int64(tv), 10)
	case int16:
		return strconv.FormatInt(int64(tv), 10)
	case int32:
		return strconv.FormatInt(int64(tv), 10)
	case int64:
		return strconv.FormatInt(tv, 10)
	case uint:
		return strconv.FormatUint(uint64(tv), 10)
	case uint8:
		return strconv.FormatUint(uint64(tv), 10)
	case uint16:
		return strconv.FormatUint(uint64(tv), 10)
	case uint32:
		return strconv.FormatUint(uint64(tv), 10)
	case uint64:
		return strconv.FormatUint(tv, 10)
	case float32:
		return strconv.FormatFloat(float64(tv), 'g', -1, 32)
	case float64:
		return strconv.FormatFloat(tv, 'g', -1, 64)
	case bool:
		return strconv.FormatBool(tv)
	default:
		return fmt.Sprint(v)
	}
}

// formatTemporalValue renders a time.Time the way desktop SQL clients do:
// a canonical "2006-01-02 15:04:05[.fffffffff][ -0700]" string with no
// duplicated zone (Go's default time.Time.String() emits both a numeric
// offset AND the zone abbreviation, e.g. "... +0700 +07", which then leaks
// verbatim into copy/paste and generated SQL).
//
// dbType is the driver's column type name; it decides whether an offset is
// meaningful. Timezone-aware types (timestamptz, datetimeoffset, timetz)
// keep the offset; plain DATE/TIME/TIMESTAMP do not. When dbType is empty
// (callers that don't thread column metadata) we fall back to the value's
// own zone: a non-zero offset is treated as timezone-aware.
func formatTemporalValue(t time.Time, dbType string) string {
	upper := strings.ToUpper(strings.TrimSpace(dbType))

	switch upper {
	case "DATE":
		return t.Format("2006-01-02")
	case "TIME", "TIME WITHOUT TIME ZONE":
		return t.Format("15:04:05.999999999")
	case "TIMETZ", "TIME WITH TIME ZONE":
		return t.Format("15:04:05.999999999 -0700")
	}

	tzAware := upper == "TIMESTAMPTZ" ||
		upper == "TIMESTAMP WITH TIME ZONE" ||
		upper == "DATETIMEOFFSET"
	if upper == "" {
		if _, offset := t.Zone(); offset != 0 {
			tzAware = true
		}
	}

	if tzAware {
		return t.Format("2006-01-02 15:04:05.999999999 -0700")
	}
	return t.Format("2006-01-02 15:04:05.999999999")
}

func formatSQLServerUUID(b []byte) string {
	if len(b) != 16 {
		return string(b)
	}

	ordered := [16]byte{
		b[3], b[2], b[1], b[0],
		b[5], b[4],
		b[7], b[6],
		b[8], b[9],
		b[10], b[11], b[12], b[13], b[14], b[15],
	}

	dst := make([]byte, 36)
	hex.Encode(dst[0:8], ordered[0:4])
	dst[8] = '-'
	hex.Encode(dst[9:13], ordered[4:6])
	dst[13] = '-'
	hex.Encode(dst[14:18], ordered[6:8])
	dst[18] = '-'
	hex.Encode(dst[19:23], ordered[8:10])
	dst[23] = '-'
	hex.Encode(dst[24:36], ordered[10:16])
	return string(dst)
}
