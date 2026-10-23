// SPDX-License-Identifier: GPL-3.0-only

package models

import "time"

// QueryResult chứa kết quả của một câu lệnh SQL.
// Không serialize ra JSON — chỉ dùng in-memory.
type QueryResult struct {
	Columns    []string        // tên các cột (chỉ có khi IsSelect=true)
	Rows       [][]interface{} // dữ liệu (chỉ có khi IsSelect=true)
	Affected   int64           // số rows bị ảnh hưởng (INSERT/UPDATE/DELETE)
	Duration   time.Duration   // thời gian thực thi
	Err        error           // lỗi nếu có
	IsSelect   bool            // true nếu là SELECT/WITH/SHOW/EXPLAIN
	TableName  string          // tên bảng parse được từ query
	PrimaryKey []string        // danh sách cột khoá chính của bảng đó
}
