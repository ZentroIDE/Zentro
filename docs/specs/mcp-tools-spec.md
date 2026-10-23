# Zentro MCP Tools — Spec

Oct 7, 2026 · @Alex Nguyen

## 1. Mục tiêu, phạm vi và giả định

Spec này định nghĩa 21 tool MCP mới và 4 nâng cấp cho tool hiện có, để AI hỗ trợ user Zentro hằng ngày mà không bao giờ có đường ghi trực tiếp vào database.

**Trong phạm vi**

- Đọc và kiểm tra (schema, plan, diff, thống kê), đo ảnh hưởng của thay đổi, quy trình thay đổi có người duyệt, migration và điểm khôi phục, audit.
- Cả 21 tool ở gói Free. Mỗi tool có cột nhóm quyền, nên sau này gắn gói Pro không phải sửa thiết kế.

**Ngoài phạm vi**

- Tool chạy `INSERT`, `UPDATE`, `DELETE` hoặc DDL trực tiếp qua MCP.
- Đọc password, quản lý user và role của database, export bảng lớn.
- Parse đầy đủ cú pháp SQL (xây cây cú pháp). Mọi phân tích SQL trong spec dùng bộ tách token cộng với catalog và database làm trọng tài (mục 2, "Phân tích SQL không dùng parser"). Câu lệnh nằm ngoài các dạng đó bị từ chối rõ ràng bằng `SQL_UNSUPPORTED`, không đoán.
- Đếm dòng cho `UPDATE ... FROM`, `DELETE ... USING` và câu lệnh ghi có CTE đứng trước. Các dạng này cần parser, xem "Khi nào nên thêm parser" ở mục 10.

**Giả định mặc định** (sửa thẳng trong doc nếu sai)

- Postgres là driver tham chiếu. Khả năng của MySQL, SQL Server, SQLite nằm ở mục 9.
- Zentro không có SQL parser. Tool nào cần hiểu cấu trúc câu lệnh chỉ nhận một tập dạng hẹp và từ chối phần còn lại (fail closed). Thà từ chối một câu hợp lệ còn hơn phân tích sai một câu nguy hiểm.
- Zentro chưa có audit log cho lệnh gọi MCP. Mục 8 định nghĩa mức tối thiểu cần dựng.
- Duyệt thay đổi trên Prod bắt gõ lại tên environment và chờ 3 giây trước khi nút xác nhận sáng lên.
- Proposal lưu cục bộ và hết hạn theo TTL: Dev 15 phút, Staging 10 phút, Prod 5 phút. Hết hạn thì không thể duyệt.
- Tên environment dùng đúng như Zentro hiện có: `dev`, `sta`, `pro`.

## 2. Quy ước chung

Mọi tool dưới đây tuân theo cùng một bộ quy ước về tên, tham số, kết quả, lỗi và quyền, để AI và code client xử lý đồng nhất.

**Đặt tên và tham số**

- Tên `snake_case`, động từ đứng đầu: `get_`, `list_`, `find_`, `validate_`, `estimate_`, `check_`, `generate_`, `create_`, `propose_`.
- `env` nhận `dev`, `sta` hoặc `pro`. Tool chỉ đọc catalog có thể bỏ trống để dùng environment đang mở. Tool chạm vào dữ liệu hoặc tạo thay đổi bắt buộc truyền `env`, thiếu thì trả `ENV_REQUIRED`.
- `schema` tùy chọn, mặc định là schema đang active.
- Tên object (table, view) dùng đúng chuỗi `search_schema` trả về.

**Kết quả thành công**

```json
{
  "ok": true,
  "data": { },
  "meta": {
    "project": "GS", "env": "dev", "driver": "postgres",
    "database": "postgres", "schema": "public",
    "truncated": false, "elapsedMs": 12
  },
  "warnings": [ ]
}
```

**Kết quả lỗi**

```json
{
  "ok": false,
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "Nhóm quyền read_data đang tắt.",
    "hint": "Bật trong Settings > MCP.",
    "retryable": false
  }
}
```

| Mã lỗi | Khi nào |
| --- | --- |
| `PERMISSION_DENIED` | Nhóm quyền của tool đang tắt, hoặc đang gọi vào `pro` khi chưa bật công tắc Production. |
| `ENV_REQUIRED` / `ENV_NOT_FOUND` | Thiếu `env`, hoặc project không có environment đó. |
| `NOT_CONNECTED` | Connection của environment chưa kết nối được. |
| `OBJECT_NOT_FOUND` | Table, view, routine, id không tồn tại. |
| `SQL_PARSE_ERROR` | Database báo lỗi cú pháp hoặc tên không tồn tại khi kiểm tra (`PREPARE`), hoặc token không cân bằng (nháy, ngoặc). |
| `SQL_NOT_ALLOWED` | SQL nằm trong deny list cứng, không có đường duyệt (xem mục 6). |
| `SQL_UNSUPPORTED` | SQL có thể hợp lệ nhưng nằm ngoài các dạng Zentro phân tích được an toàn khi không có parser. Kèm `reason` (ví dụ `has_cte`, `has_join`, `multi_statement`, `has_placeholder`, `ambiguous_table`) và `hint` cách viết lại hoặc tool khác nên dùng. Khác `SQL_NOT_ALLOWED`: câu lệnh không bị cấm, chỉ là tool này không xử lý được. |
| `INVALID_ARGUMENT` | Tham số thiếu, sai kiểu hoặc rỗng khi bắt buộc. `message` nói tham số nào. Khác `SQL_PARSE_ERROR`, vốn nói về nội dung SQL. |
| `POLICY_BLOCKED` | Vi phạm safety policy của environment (strictness, row cap, timeout). |
| `UNSUPPORTED_DRIVER` | Tool chưa hỗ trợ driver này (xem mục 9). |
| `TIMEOUT` / `ROW_CAP_EXCEEDED` | Quá giới hạn thời gian hoặc số dòng. |
| `PROPOSAL_EXPIRED` / `PROPOSAL_STALE` | Proposal hết hạn, hoặc ngữ cảnh đã đổi so với lúc đề xuất. |
| `INVALID_STATE` | Thao tác không hợp lệ với trạng thái hiện tại, ví dụ rút lại proposal đã được duyệt. |
| `RATE_LIMITED` | Vượt giới hạn tần suất. `retryable: true`. |
| `INTERNAL` | Lỗi của Zentro. Ghi log, không lộ stack trace. |

**Hệ thống quyền**

Mỗi tool thuộc đúng một nhóm quyền. User bật tắt từng nhóm trong Settings, giống cách `object_text` và `connection_details` đang hoạt động.

| Nhóm quyền | Mặc định | Tool |
| --- | --- | --- |
| `metadata` | Bật | Mọi tool chỉ đọc catalog hoặc phân tích SQL: `validate_sql`, `explain_plan`, `diff_schema`, `find_dependencies`, `get_table_stats`, `list_indexes`, `check_migration_safety`, `generate_migration`, cùng các tool hiện có |
| `object_text` | Tắt | `get_definition` (đã có) |
| `connection_details` | Tắt | Host, port, user trong `list_connections` (đã có) |
| `read_data` | Tắt | Tool chạy câu lệnh trên dữ liệu thật nhưng chỉ trả số đếm, không trả giá trị dòng: `estimate_impact`, `preview_cascade`, `dry_run` |
| `data_rows` (Data mode) | Tắt mặc định, mọi gói | Tool trả giá trị dòng: `run_readonly_query`, và `keySamples` của `estimate_impact`. Tối đa 10 dòng mỗi lần gọi. Không bao giờ cung cấp cho agent ngoài qua MCP. Trong chat, vòng gửi dòng tới model cloud hoặc dòng đọc từ production luôn chờ user duyệt (ADR 0017) |
| `changes` | Tắt | `propose_change`, `get_change_status`, `cancel_change`, `list_changes`, `create_restore_point`, `list_restore_points`, `preview_rollback` |
| `audit` | Tắt | `get_audit_log` |

Chat trong app chỉ gửi bộ tool lõi kèm `more_tools`/`use_tool` để nạp phần còn lại theo gói; agent ngoài qua MCP vẫn thấy đủ danh sách (ADR 0016, cập nhật 2026-10-14). `validate_sql` và `explain_plan` nhận placeholder dạng `:name`.

Nhóm `context` còn có ba tool bộ nhớ theo connection: `remember` (lưu một ghi chú tối đa 300 ký tự, chỉ ý nghĩa, không giá trị dòng; mỗi connection tối đa 40 ghi chú), `forget` (xoá theo id) và `list_notes`. Ghi chú được gửi kèm mỗi câu hỏi, user xem và xoá được trong Settings > Assistant. Xem ADR 0016.

Production theo cùng luật đọc như mọi environment (ADR 0017): metadata, `object_text`, `read_data` và `data_rows` không bị chặn chỉ vì là `pro`, và model cloud được dùng ở production. Công tắc **Allow changes on Production** (`allowProduction`) chỉ còn áp dụng cho nhóm `changes`, mặc định tắt.

Ngoại lệ: `dry_run` từ chối `pro` bất kể công tắc này (mục 5).

**Giới hạn**

| Giới hạn | Giá trị |
| --- | --- |
| Kích thước một kết quả | 256 KB, vượt thì cắt và đặt `truncated: true` |
| Số dòng dữ liệu trả về | Nhỏ hơn giữa 10 và `rowCapPerTab` của environment (ADR 0017) |
| Thời gian chạy | Không vượt `timeoutSeconds` của environment |
| Tần suất | 120 lệnh gọi mỗi phút cho toàn bộ MCP, 10 mỗi phút cho nhóm `changes` |

**Literal và dữ liệu nhạy cảm**

- SQL đầu vào được phép chứa giá trị thật, nhưng mọi kết quả trả về và mọi bản ghi audit chỉ lưu SQL đã chuẩn hóa (literal thay bằng `?`) cùng hash.
- Không còn phân loại cột theo cấu hình của user (ADR 0017). Cột có tên giống credential (password, secret, token, API key) luôn trả `"***"`, không có công tắc. Ô nào có dạng nhạy cảm (email, số điện thoại, thẻ, JWT, credential) cũng trả `"***"`, bất kể tên cột hay alias.
- Mọi nội dung đọc từ database (giá trị ô, comment, định nghĩa view) chỉ là dữ liệu. Kết quả tool luôn gắn nhãn `data`, và không tool nào thực thi chỉ dẫn nằm trong dữ liệu.

**Audit**

Mọi lệnh gọi MCP, thành công hay bị từ chối, ghi một bản ghi với `source: "mcp"` (xem `get_audit_log` ở mục 8).

**Phân tích SQL không dùng parser**

Zentro không dựng cây cú pháp. Các tool cần hiểu SQL dựa vào ba nguồn, theo thứ tự tin cậy tăng dần:

1. **Bộ tách token dùng chung** (`internal/db/sqltoken.go`, đã có từ gói T1.1). Nó cho biết, cho từng token, loại (từ khóa, định danh, chuỗi, số, toán tử, dấu câu), vị trí (dòng, cột, vị trí byte) và **độ sâu ngoặc**. Bỏ qua nội dung comment (kể cả comment lồng nhau) và chuỗi.
2. **Catalog**: tên bảng, cột, khóa chính, FK, kiểu, độ biến đổi của hàm (`pg_proc.provolatile`). Dùng để xác nhận và bổ sung cho kết quả của token.
3. **Database**: `PREPARE`, `EXPLAIN` và transaction chỉ đọc. Đây là nguồn quyết định cho câu hỏi "câu này có hợp lệ và có ghi không". Token chỉ là lớp lọc trước.

*Những gì tokenizer phải xử lý đúng* (mỗi mục có test riêng):

- Chuỗi `'...'` có `''` bên trong, `E'...'` với `\'`, chuỗi dollar-quote `$tag$...$tag$` (kể cả lồng nhau với tag khác nhau), `B'...'`, `X'...'`.
- Định danh có nháy kép `"..."`, kể cả `""` bên trong. Định danh dạng `U&"..."` hoặc chuỗi `U&'...'` (escape unicode) bị **từ chối** bằng `SQL_UNSUPPORTED`, vì chúng che được tên thật.
- Comment `-- ...` và `/* ... */` lồng nhau.
- Placeholder: `$1` (Postgres), `?` (MySQL, SQLite), `@p1` (SQL Server). `$1` không bị nhầm với mở đầu dollar-quote.
- Tên đủ điều kiện `schema.table`, `"schema"."table"`, `ONLY`, và so khớp không phân biệt hoa thường theo quy tắc của driver.

*Các dữ kiện mà token cho được* (và các tool dùng chúng):

| Dữ kiện | Cách tính | Dùng ở |
| --- | --- | --- |
| Tách câu lệnh | `;` ở độ sâu 0, ngoài chuỗi và comment | Mọi tool nhận `sql` |
| Loại câu lệnh | Từ khóa đầu. Câu bắt đầu bằng `WITH`: **nếu có `INSERT`, `UPDATE`, `DELETE` hoặc `MERGE` ở bất kỳ độ sâu nào** (trong thân CTE hoặc ở độ sâu 0 sau danh sách CTE) thì đó là câu ghi, lấy loại ghi nguy hiểm nhất (thứ tự: update, delete, alter, drop, truncate, merge, replace, insert, create). Chỉ khi không có câu ghi nào mới là `select`. `FOR UPDATE` của một `SELECT` không phải câu ghi | `classify_sql`, `validate_sql`, `explain_plan` |
| Có `WHERE` | Có token `WHERE` ở **độ sâu 0** của chính câu lệnh. `WHERE` nằm trong subquery hoặc CTE không tính | `classify_sql`, `estimate_impact` |
| Bảng đích của `UPDATE` và `DELETE` | Token định danh (có thể đủ điều kiện) ngay sau `UPDATE [ONLY]` hoặc `DELETE FROM [ONLY]`, kèm alias tùy chọn. Phải khớp một bảng trong catalog | `estimate_impact`, `preview_cascade` |
| Mệnh đề `WHERE` | Đoạn token từ `WHERE` ở độ sâu 0 đến `RETURNING` ở độ sâu 0 hoặc hết câu lệnh. **Sao nguyên văn từ SQL gốc** bằng vị trí byte của token đầu và cuối (`ClauseSpanAfterTopLevel`), không ghép lại từ token | `estimate_impact`, `preview_cascade` |
| Lời gọi hàm | Định danh (bỏ nháy, bỏ tiền tố schema, hạ chữ thường) đứng ngay trước `(` | Deny list hàm |
| Literal | Token chuỗi và số | Chuẩn hóa thành `?` ở kết quả và audit |

*Chuẩn hóa literal*: thay mọi token chuỗi và số bằng `?`, giữ nguyên định danh có nháy kép, placeholder và từ khóa, gộp khoảng trắng. Cùng một hàm (`NormalizeLiterals`) dùng cho `sqlNormalized`, `sqlPreview`, `rawPlan` và `predicate` của index. `RedactSQLLiterals` hiện có che cả định danh có nháy kép và không che số, nên không dùng được cho việc này.

*Quy tắc chung khi không chắc*:

- Token không nhận ra hoặc cấu trúc ngoài các dạng được liệt kê: từ chối bằng `SQL_UNSUPPORTED` kèm `reason`.
- **Phân tích rủi ro nội bộ không được yếu đi khi tokenizer báo lỗi.** `Tokenize` công khai trả `ErrUnsupportedToken` cho `U&` để tool MCP từ chối. Nhưng các hàm phân loại rủi ro ghi (write-safety) phải tiếp tục bằng chế độ quét khoan dung (coi `U&` là từ thường) để vẫn nhận ra từ khóa ghi ở mọi vị trí, và kết quả không bao giờ thấp hơn mức mà bản cũ cho. Tuyệt đối không dùng danh sách token bị cắt ngang để kết luận một câu là chỉ đọc.
- Deny list so khớp theo token ở bất kỳ vị trí nào, không cần đứng cạnh `(`. Trùng nhầm được chấp nhận (ví dụ cột tên `lo_import`), bỏ sót thì không.
- Mọi kết luận "câu này chỉ đọc" hay "câu này không ghi" cuối cùng dựa vào transaction chỉ đọc của database, không dựa vào token.

*Dạng câu lệnh hỗ trợ cho việc đếm* (`estimate_impact`, `preview_cascade`): đúng một câu `UPDATE` hoặc `DELETE` theo dạng

```
UPDATE [ONLY] bảng [[AS] alias] SET ... [WHERE ...] [RETURNING ...]
DELETE FROM [ONLY] bảng [[AS] alias] [WHERE ...] [RETURNING ...]
```

Không có `WITH` đứng trước, không có `FROM` hay `USING` ở độ sâu 0 sau tên bảng (tức không join). Subquery nằm trong `SET` hoặc `WHERE` được chấp nhận, vì Zentro chỉ sao nguyên mệnh đề `WHERE`. Không có placeholder (`$1`, `?`, `@p1`) trong câu lệnh: hai tool này không nhận `params`, vì tách `WHERE` ra khỏi `SET` sẽ làm lệch số thứ tự placeholder. Giá trị truyền thẳng vào SQL (spec cho phép, vì kết quả và audit đều chuẩn hóa literal). Ngoài dạng này trả `SQL_UNSUPPORTED`, với `reason: has_placeholder` cho trường hợp placeholder.

## 3. Nhóm A: đọc và kiểm tra

Bảy tool này giúp AI viết SQL đúng, hiểu schema và đánh giá hiệu năng. Chỉ `run_readonly_query` chạm vào dữ liệu thật.

### validate\_sql

Nhóm `metadata` · mọi environment · Postgres kiểm tra đầy đủ cho DML, DDL chỉ ở mức token (mục 9)

Kiểm tra một đoạn SQL có hợp lệ với schema hiện tại không, mà không thực thi.

| Tham số | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `sql` | string | Có | Một hoặc nhiều câu lệnh |
| `env` | enum | Không | Mặc định là environment đang mở |
| `schema` | string | Không | Mặc định là schema đang active |

Kết quả `data`:

- `valid`: true chỉ khi mọi câu lệnh hợp lệ.
- `statements[]`: `n`, `kind` (select, insert, update, delete, ddl, other), `valid`, `errors[]` gồm `message`, `line`, `col`.
- `unknownObjects[]`: `kind`, `name`, `didYouMean[]`, gợi ý theo độ giống tên trong catalog.
- `checkedBy`: `database` hoặc `tokens`.

Hành vi:

- Lỗi cú pháp và tên không tồn tại là dữ liệu (`valid: false`), không phải lỗi tool, để AI sửa lại ngay.
- Postgres, với SELECT, INSERT, UPDATE, DELETE: chạy `PREPARE` trong transaction rồi `ROLLBACK`, kèm `SET LOCAL lock_timeout = '1s'`. Database tự kiểm tra tên cột, kiểu dữ liệu và phép toán. `checkedBy` là `database`.
- Dòng và cột của lỗi lấy từ vị trí ký tự mà database báo (`Position` của lỗi Postgres), đổi sang dòng và cột bằng cách đếm trên văn bản gốc. Không cần parser.
- `unknownObjects` cho DML lấy từ mã lỗi của database (bảng hoặc cột không tồn tại) cộng tên trong thông báo lỗi, rồi tra gần đúng trong catalog. Database dừng ở lỗi đầu tiên của mỗi câu lệnh, nên `errors[]` của câu đó có tối đa một phần tử. Sửa xong gọi lại để thấy lỗi kế tiếp.
- DDL không `PREPARE` được và Zentro không có parser, nên chỉ kiểm tra ở mức token: tách câu lệnh, ngoặc và nháy cân bằng, từ khóa đầu thuộc tập DDL đã biết, và tên bảng đứng sau `TABLE`, `INDEX ... ON`, `REFERENCES` có trong catalog hoặc được tạo bởi chính script. `checkedBy` là `tokens`, `warnings` nói rõ không kiểm tra được cú pháp sau từ khóa đầu, kiểu dữ liệu và biểu thức, và gợi ý dùng `dry_run` ở `dev` hoặc `sta` để kiểm chứng DDL.
- Không câu lệnh nào được thực thi.

### explain\_plan

Nhóm `metadata` · mọi environment · Postgres đầy đủ

Trả về plan ước tính của một câu lệnh, không thực thi.

| Tham số | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `sql` | string | Có | Đúng một câu lệnh |
| `env` | enum | Không | Mặc định là environment đang mở |
| `schema` | string | Không | Mặc định là schema đang active |
| `format` | enum | Không | `summary` (mặc định) hoặc `raw` |

Kết quả `data`:

- `totalCost`, `estRows`, `topNode`.
- `tablesTouched[]`: `table`, `access` (seq\_scan, index\_scan, index\_only, bitmap), `index`, `estRows`, `statsAge` tính từ lần analyze gần nhất.
- `flags[]`: `type`, `table`, `severity`, `detail`. Ba loại ban đầu: `seq_scan_large` (seq scan có filter trên bảng ước tính trên 10.000 dòng), `nested_loop_large` (vòng ngoài ước tính trên 1.000 dòng), `stale_stats` (chưa analyze bao giờ). Ngưỡng là mặc định, cấu hình được.
- `rawPlan`: chỉ có khi `format` là `raw`. Các chuỗi trong plan (như `Filter`, `Index Cond`) đi qua bộ chuẩn hóa literal, xử lý trên chuỗi, không cần parser.

Hành vi:

- Postgres: `EXPLAIN (FORMAT JSON)` không `ANALYZE`, trong transaction rồi `ROLLBACK`.
- SQL không được tự bắt đầu bằng `EXPLAIN`: Zentro tự thêm `EXPLAIN (FORMAT JSON)`. Từ khóa đầu là `EXPLAIN` thì từ chối `SQL_NOT_ALLOWED`, vì option `ANALYZE` thực thi câu lệnh. Việc này kiểm bằng token, không cần parser.
- Chấp nhận SELECT, INSERT, UPDATE, DELETE, MERGE, VALUES, mỗi lần một câu lệnh. Loại câu lệnh xác định theo từ khóa đầu (xem "Phân tích SQL không dùng parser"). Nhiều câu lệnh thì trả `SQL_UNSUPPORTED` với `reason: multi_statement`.
- `flags` là heuristic dựa trên ước tính, không phải số đo thật. Kết quả nói rõ điều này trong `warnings`.

### diff\_schema

Nhóm `metadata` · đọc hai environment cùng lúc · Postgres đầy đủ

So sánh schema giữa hai environment của project. Chỉ đọc catalog, không đọc dữ liệu.

| Tham số | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `from_env` | enum | Có | Bên gốc |
| `to_env` | enum | Có | Bên đích |
| `kinds` | array | Không | Gồm table, view, routine, index, constraint. Mặc định là tất cả |
| `detail` | enum | Không | `summary` (mặc định) hoặc `full` |
| `ignore_column_order` | bool | Không | Mặc định true |

Kết quả `data`:

- `summary`: số object `onlyInFrom`, `onlyInTo`, `changed`.
- `objects[]`: `kind`, `name`, `status` (only\_in\_from, only\_in\_to, changed). Khi `detail` là `full` có thêm `changes[]` gồm `what` (column\_added, column\_removed, type\_changed, nullability\_changed, default\_changed, index\_missing, constraint\_changed, body\_changed), `column`, `from`, `to`.
- `comparedAt`.

Hành vi:

- Cả hai environment phải kết nối được. Nếu một bên không, trả `NOT_CONNECTED` kèm tên bên lỗi.
- View và routine so sánh bằng hash của phần thân. Nội dung chỉ trả về khi nhóm `object_text` bật. Còn lại chỉ có `body_changed`, không kèm text.
- Bỏ qua schema hệ thống. Tối đa 500 object mỗi kết quả, vượt thì `truncated: true` và dùng `kinds` để thu hẹp.
- Đọc catalog của `pro` chỉ cần nhóm `metadata`, không cần công tắc Production.
- Kết quả là đầu vào của `generate_migration` (mục 7).

### find\_dependencies

Nhóm `metadata` · Postgres đầy đủ

Cho biết cái gì phụ thuộc vào một object hoặc một cột, để biết đổi hay xóa nó sẽ làm vỡ gì.

| Tham số | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `object` | string | Có | Table, view hoặc routine |
| `column` | string | Không | Chỉ xét phụ thuộc vào cột này |
| `direction` | enum | Không | `dependents` (mặc định), `dependencies` hoặc `both` |
| `depth` | int | Không | Mặc định 2, tối đa 5 |
| `env`, `schema` |  | Không | Như quy ước chung |

Kết quả `data`:

- `nodes[]`: `kind` (table, view, routine, trigger, index, constraint, sequence), `name`.
- `edges[]`: `from`, `to`, `via` (fk, view, trigger, index, default, ownership).
- `summary`: số phụ thuộc theo từng `kind`.
- `possiblyDependent[]`: routine mà tên object xuất hiện trong thân nhưng catalog không ghi nhận, kèm `confidence: "name_match"`.

Hành vi:

- Postgres dựng đồ thị từ `pg_depend`, `pg_constraint`, `pg_rewrite`, `pg_trigger`.
- Tham chiếu bên trong thân hàm PL/pgSQL không có trong `pg_depend`, nên chỉ phát hiện bằng khớp tên. Kết quả đó luôn nằm ở `possiblyDependent`, không bao giờ ở `edges`, và `warnings` nói rõ giới hạn này.
- Khớp tên chạy bên trong Zentro, trên token của thân routine: so khớp định danh (bỏ nháy, không phân biệt hoa thường), bỏ qua tên nằm trong chuỗi và comment. Không cần parser. Tool không trả thân routine, nên không cần nhóm `object_text`.
- Lỗi: `OBJECT_NOT_FOUND` kèm `didYouMean`.

### get\_table\_stats

Nhóm `metadata` · Postgres đầy đủ

Trả về kích thước và thống kê của một bảng từ catalog, không quét bảng.

| Tham số | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `table` | string | Có | Tên như `search_schema` trả về |
| `with_columns` | bool | Không | Mặc định false |
| `env`, `schema` |  | Không | Như quy ước chung |

Kết quả `data`:

- `estRows` (null nếu bảng chưa analyze), `exact: false`, `totalBytes`, `tableBytes`, `indexBytes`, `toastBytes`.
- `lastVacuum`, `lastAutovacuum`, `lastAnalyze`, `lastAutoanalyze`, `estDeadTuples`.
- `seqScans`, `idxScans`, `statsSince`.
- `partitioned`, `partitionCount`.
- `columns[]` khi `with_columns` là true: `name`, `nullFraction`, `nDistinct`, `avgWidth`.

Hành vi:

- Số dòng là ước tính từ `reltuples`, không phải `COUNT(*)`.
- Không bao giờ trả `most_common_vals`, `histogram_bounds` hay bất kỳ giá trị mẫu nào từ `pg_stats`, vì đó là dữ liệu thật.
- Bộ đếm scan tính từ `statsSince`. AI cần xem mốc này trước khi kết luận một index "không được dùng".

### list\_indexes

Nhóm `metadata` · Postgres đầy đủ

Liệt kê index và phát hiện bốn vấn đề phổ biến. Tool chỉ gợi ý, không tạo hay xóa index.

| Tham số | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `table` | string | Không | Bỏ trống thì quét cả schema |
| `checks` | array | Không | Gồm `missing_fk_index`, `duplicate`, `unused`, `invalid`. Mặc định là tất cả |
| `env`, `schema` |  | Không | Như quy ước chung |

Kết quả `data`:

- `indexes[]`: `table`, `name`, `columns`, `unique`, `primary`, `method`, `predicate` (điều kiện của index một phần, đã chuẩn hóa literal), `sizeBytes`, `scans`.
- `issues[]`: `type`, `table`, `index`, `columns`, `severity`, `detail`.
- `statsSince`.

Quy tắc phát hiện:

| Loại | Điều kiện |
| --- | --- |
| `missing_fk_index` | Cột FK không phải cột đầu của index nào trên bảng tham chiếu. Severity tăng theo `estRows` của bảng. |
| `duplicate` | Trùng danh sách cột, thứ tự, predicate và operator class. |
| `unused` | `scans` bằng 0, không phải primary key, unique hay index phục vụ constraint. Nếu `statsSince` cách hiện tại dưới 7 ngày thì hạ xuống `info`. |
| `invalid` | Index ở trạng thái invalid, thường do `CREATE INDEX CONCURRENTLY` thất bại. |

### run\_readonly\_query

Nhóm `data_rows` (Data mode) · `env` bắt buộc · Postgres đầy đủ · không cung cấp qua MCP

Chạy một câu SELECT trên dữ liệu thật để AI kiểm chứng giả thuyết. Đây là tool duy nhất của nhóm A chạm vào dữ liệu.

| Tham số | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `env` | enum | Có | `dev`, `sta` hoặc `pro` (`pro` cần công tắc Production) |
| `sql` | string | Có | Đúng một câu lệnh |
| `params` | array | Không | Giá trị cho `$1` đến `$n` |
| `max_rows` | int | Không | Mặc định 10, tối đa 10 (mục 2) |
| `timeout_seconds` | int | Không | Mặc định 15, tối đa theo `timeoutSeconds` của environment |

Chấp nhận: đúng một câu lệnh có từ khóa đầu là `SELECT`, `WITH` hoặc `VALUES`.

Bộ lọc token (lớp 1), áp trên token ngoài chuỗi và comment, theo nguyên tắc "không chắc thì từ chối". Từ chối bằng `SQL_NOT_ALLOWED` và gợi ý dùng `propose_change` khi có bất kỳ điều nào sau đây:

- Có token từ khóa `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `COPY`, `CALL`, `DO`, `EXECUTE`, `INTO` hoặc `TRUNCATE`, ở bất kỳ độ sâu nào. Cách này gộp hai trường hợp spec cũ cần phân biệt bằng cú pháp: CTE ghi (`WITH x AS (DELETE ...)`) và `SELECT ... INTO`. Tên cột trùng từ khóa phải được đặt trong nháy kép.
- `FOR` đi liền sau bởi `UPDATE`, `SHARE`, `NO` hoặc `KEY` (khóa dòng).
- Token định danh nằm trong deny list hàm, so khớp sau khi bỏ nháy, bỏ tiền tố schema và hạ chữ thường: `pg_read_file`, `pg_read_binary_file`, `lo_*`, `dblink*`, `set_config`, `pg_terminate_backend`, `pg_cancel_backend`, `pg_advisory_*`, `pg_reload_conf`. Khớp ở bất kỳ vị trí nào, không cần có `(` theo sau.
- Có định danh hoặc chuỗi dạng `U&` (escape unicode), vì che được tên hàm thật.

Từ chối bằng `SQL_UNSUPPORTED`: nhiều câu lệnh, và token mà tokenizer không nhận ra.

Bộ lọc token chỉ là lớp 1. Nó có thể từ chối nhầm câu hợp lệ, nhưng không được cho lọt câu ghi vì cùng một lý do: lớp quyết định là transaction chỉ đọc của database (bước 3 bên dưới). Một ngoại lệ mà transaction chỉ đọc **không** chặn là hàm gọi ra ngoài database, như `dblink` ghi sang database khác. Vì vậy deny list hàm phải đủ chặt, và nếu `pg_extension` của database có `dblink`, `postgres_fdw` hoặc `file_fdw` thì `warnings` nhắc user cân nhắc tắt `read_data` cho connection đó.

Cách thực thi trên Postgres, nhiều lớp:

1. Chạy bộ lọc token ở trên và `classify_sql` (chỉ để ghi nhãn rủi ro vào audit). Không qua bộ lọc thì từ chối.
2. Dùng connection riêng, không dùng chung connection của editor.
3. `BEGIN READ ONLY`, rồi `SET LOCAL statement_timeout`, `lock_timeout = '1s'`, `idle_in_transaction_session_timeout`.
4. Luôn `ROLLBACK`, kể cả khi thành công.

Vì transaction chỉ đọc, hàm do user định nghĩa mà cố ghi sẽ báo lỗi, kể cả `nextval()`.

Kết quả `data`: `columns[]` (`name`, `type`), `rows`, `rowCount`, `truncated`, `maskedColumns[]`, `elapsedMs`.

Hành vi:

- Masking luôn bật và không có cấu hình: cột giống credential và ô có dạng nhạy cảm trả `"***"`. Trong chat, vòng mang các dòng này tới model cloud, hoặc dòng đọc từ production, chờ user duyệt và thấy đúng các dòng sẽ gửi (ADR 0017).
- Mỗi ô tối đa 1 KB, vượt thì cắt. Giá trị nhị phân trả dạng `<bytea 2.3 KB>`.
- Zentro lấy `max_rows + 1` dòng để biết có bị cắt hay không, rồi đặt `truncated`.
- Audit chỉ lưu SQL đã chuẩn hóa, số dòng và thời gian. Không lưu dữ liệu dòng.
- Lỗi: `PERMISSION_DENIED`, `SQL_NOT_ALLOWED`, `POLICY_BLOCKED`, `TIMEOUT`, `NOT_CONNECTED`.

## 4. Nâng cấp tool hiện có

Bốn tool đang có chỉ thêm tham số tùy chọn và trường kết quả mới, nên mọi lệnh gọi cũ vẫn chạy như trước. Các trường hiện có giữ nguyên.

### classify\_sql

Nhóm `metadata` · vẫn không chạy SQL và không chạm vào database

Tham số mới:

- `env` (enum, tùy chọn): phân loại theo safety policy của environment đó, gồm `strictness` và cờ production. Bỏ trống thì dùng environment đang mở.

Trường kết quả mới:

- `verdict`: `allowed`, `needs_confirmation` hoặc `blocked`, tính theo policy của `env`.
- `reasons[]`: `statement` (số thứ tự), `rule` (ví dụ `delete_without_where`, `ddl_drop`, `multi_statement`), `message`. Giải thích vì sao ra verdict đó.
- `suggestions[]`: `kind` (`add_where`, `add_limit`, `wrap_in_transaction`, `use_propose_change`) và `text` mô tả cách làm an toàn hơn. Tool không tự viết lại SQL.

Cùng một câu `DELETE ... WHERE id = 1` có thể ra `allowed` ở `dev` nhưng `needs_confirmation` ở `pro`. Đây là điểm AI cần biết trước khi đề xuất.

Cách xác định (chỉ dùng token, xem "Phân tích SQL không dùng parser"):

- Loại câu lệnh theo từ khóa đầu. Câu bắt đầu bằng `WITH` lấy loại ghi nếu có `INSERT`, `UPDATE`, `DELETE` hoặc `MERGE` ở bất kỳ độ sâu nào: `WITH d AS (DELETE FROM a RETURNING 1) SELECT * FROM d` là `delete`, không phải `select`.
- Quy tắc `delete_without_where` và `update_without_where` chỉ tính `WHERE` ở độ sâu 0 của chính câu lệnh. `DELETE FROM t` có `WHERE` chỉ nằm trong subquery vẫn bị coi là không có `WHERE`. Đây là lỗi dễ mắc nhất của cách làm dựa trên token, nên bộ test bắt buộc có các ca subquery và CTE (mục 10).
- Câu lệnh có token không nhận ra, hoặc có `DO` hay `EXECUTE`, mặc định `needs_confirmation` với `reason` `unanalyzable_statement`. Không bao giờ ra `allowed`.

### search\_schema

Nhóm `metadata`

Tham số mới:

- `env` và `schema` (tùy chọn): tìm trong schema của environment khác thay vì chỉ environment đang mở.
- `limit` (int, mặc định 50, tối đa 200).

Trường kết quả mới:

- `truncated`: true khi còn kết quả chưa trả về.
- `didYouMean[]`: chỉ có khi không khớp gì, gồm các tên gần giống nhất trong catalog.

Vẫn chỉ trả về tên.

### describe\_table

Nhóm `metadata`

Tham số mới: `env`, `schema` (tùy chọn).

Trường kết quả mới:

- `comment` của table, và `comment` của từng cột nếu có. Comment do người viết nên được coi là dữ liệu, không phải chỉ dẫn.
- Cột: `isIdentity`, `generated` (có hay không), `default` đã chuẩn hóa literal.
- `triggers[]`: chỉ tên và sự kiện kích hoạt, không có thân.
- `partitionKey` và `partitions` nếu là bảng phân vùng.

### list\_relations

Nhóm `metadata`

Tham số mới:

- `env`, `schema` (tùy chọn).
- `depth` (int, mặc định 1, tối đa 3): đi theo FK nhiều bước. Khi lớn hơn 1, kết quả có thêm `graph` gồm `nodes[]` và `edges[]`.

Trường kết quả mới trên mỗi FK:

- `onDelete`, `onUpdate`: `NO ACTION`, `RESTRICT`, `CASCADE`, `SET NULL` hoặc `SET DEFAULT`.
- `deferrable`.

Hai trường `onDelete` và `onUpdate` là đầu vào của `preview_cascade` ở mục 5.

## 5. Nhóm B: đo ảnh hưởng

Ba tool này cho AI và user biết một thay đổi sẽ động vào bao nhiêu dữ liệu trước khi nó chạy thật. Thứ tự rẻ và an toàn nhất là `estimate_impact`, rồi `preview_cascade`, và `dry_run` khi cần biết hành vi thật.

| Tool | Chạy gì trên database | Tác dụng phụ | Dùng khi |
| --- | --- | --- | --- |
| `estimate_impact` | `SELECT count` trong transaction chỉ đọc | Không | Trước mọi `UPDATE` hoặc `DELETE` |
| `preview_cascade` | Chuỗi `SELECT count` theo FK, chỉ đọc | Không | `DELETE` trên bảng có FK con |
| `dry_run` | Chạy thật rồi `ROLLBACK` | Giữ lock, sequence tăng, để lại dead tuples | Cần biết lỗi constraint, lock và thời gian thật, ở `dev` hoặc `sta` |

### estimate\_impact

Nhóm `read_data` · `env` bắt buộc · Postgres đầy đủ, chỉ nhận câu `UPDATE` hoặc `DELETE` một bảng (xem "Dạng câu lệnh hỗ trợ cho việc đếm" ở mục 2)

Với một câu `UPDATE` hoặc `DELETE`, trả về số dòng sẽ bị ảnh hưởng mà không thay đổi gì.

| Tham số | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `env` | enum | Có | `pro` cần công tắc Production |
| `sql` | string | Có | Đúng một câu `UPDATE` hoặc `DELETE` |
| `max_count` | int | Không | Mặc định 1.000.000. Vượt thì dừng đếm và đặt `capped: true` |
| `sample_keys` | int | Không | Số khóa chính mẫu trả về. Mặc định 0, tối đa 10, đi qua masking. Cần Data mode; không có Data mode hoặc gọi qua MCP thì luôn là 0 kèm cảnh báo |

Kết quả `data`:

- `classification`: `verdict` và `reasons[]`, lấy từ `classify_sql` theo `env`.
- `affectedRows`, `capped`, `tableEstRows`, `share` (tỉ lệ ước tính giữa hai số trên), `noWhere`.
- `triggersOnTarget[]`: trigger đang bật trên bảng đích và khớp loại câu lệnh. Đây là trigger có thể chạy, không phải trigger chắc chắn chạy.
- `hasCascade`: true nếu có FK con dùng `CASCADE`, `SET NULL` hoặc `SET DEFAULT`. Khi true, kèm gợi ý gọi `preview_cascade`.
- `keySamples[]`: chỉ khi `sample_keys` lớn hơn 0.

Cách làm:

- Zentro tách bảng đích và mệnh đề `WHERE` bằng token (độ sâu ngoặc 0), rồi dựng `SELECT count(*) FROM <bảng đích> [alias] WHERE <mệnh đề WHERE sao nguyên văn từ SQL gốc>`. Tên bảng phải khớp catalog và được viết lại từ catalog, không lấy từ chuỗi người dùng. Phần `WHERE` được sao nguyên, nên subquery bên trong nó vẫn đếm đúng mà không cần hiểu cấu trúc của nó.
- Dạng ngoài phạm vi trả `SQL_UNSUPPORTED`: có `WITH` đứng trước (`has_cte`), có `FROM` hoặc `USING` sau tên bảng (`has_join`), `MERGE`, nhiều câu lệnh, không xác định được bảng đích (`ambiguous_table`), có placeholder (`has_placeholder`). Kèm `hint`: viết lại phần join thành `WHERE id IN (SELECT ...)`, hoặc dùng `dry_run` ở `dev` hoặc `sta`. Mệnh đề `RETURNING` bị cắt bỏ, không ảnh hưởng số đếm.
- Câu `SELECT count(*)` được dựng ra đi qua bộ lọc token của `run_readonly_query` trước khi chạy, và chạy trong transaction chỉ đọc với `statement_timeout`, `lock_timeout`, rồi `ROLLBACK`. Câu gốc không bao giờ được thực thi. Một `WHERE` có hàm ghi ra ngoài (như `dblink`) bị chặn cùng một deny list.
- Câu lệnh không có `WHERE` vẫn được đếm, trả `noWhere: true` và `affectedRows` bằng cả bảng (tới `max_count`).
- Bảng phân vùng được đếm qua bảng cha, không cần `tableoid` hay `ctid` vì không có join.
- `tableEstRows` lấy từ catalog như `get_table_stats`, nên `share` chỉ là ước tính.
- `keySamples`: `SELECT <cột khóa chính> FROM <bảng đích> WHERE <...> LIMIT n`, khóa chính lấy từ catalog, qua masking. Bảng không có khóa chính thì trả `keySamples: null` kèm cảnh báo.
- Lỗi: `SQL_NOT_ALLOWED` nếu không phải `UPDATE` hoặc `DELETE`, `SQL_UNSUPPORTED` cho dạng ngoài phạm vi, `TIMEOUT`, `PERMISSION_DENIED`.

### preview\_cascade

Nhóm `read_data` · `env` bắt buộc · Postgres đầy đủ, chỉ nhận câu `DELETE` một bảng không placeholder (cùng dạng với `estimate_impact`)

Với một câu `DELETE`, đi theo các FK để đếm dòng ở bảng con sẽ bị xóa, bị set null hoặc set default, và chỉ ra FK nào sẽ chặn lệnh xóa.

| Tham số | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `env` | enum | Có | `pro` cần công tắc Production |
| `sql` | string | Có | Đúng một câu `DELETE` |
| `depth` | int | Không | Mặc định 3, tối đa 5 |
| `max_count` | int | Không | Như `estimate_impact` |

Kết quả `data`:

- `root`: `table`, `affectedRows`.
- `effects[]`: `table`, `fk`, `action` (`delete`, `set_null`, `set_default`), `rows`, `depth`, `capped`.
- `blockers[]`: `table`, `fk`, `rows`, `action` (`restrict` hoặc `no_action`). Có phần tử nào thì lệnh `DELETE` sẽ thất bại.
- `summary`: tổng số dòng bị xóa (gốc cộng cascade), số bảng bị ảnh hưởng.

Cách làm:

- Dựng đồ thị FK từ `list_relations`. Với mỗi FK con, một câu `SELECT count` đếm dòng con khớp với tập khóa của các dòng sắp bị xóa. Tập khóa được diễn đạt lại bằng subquery trên mệnh đề `WHERE` gốc (tách và sao nguyên bằng token như `estimate_impact`), không lưu danh sách khóa: `SELECT count(*) FROM <con> WHERE (<cột FK>) IN (SELECT <cột khóa cha> FROM <cha> WHERE <WHERE gốc>)`. FK nhiều cột dùng so sánh dạng hàng. Mức cascade sâu hơn lồng thêm một subquery cho mỗi bậc. Tên bảng và cột lấy từ catalog, không lấy từ chuỗi người dùng. Mỗi câu `SELECT count` đi qua bộ lọc token của `run_readonly_query`.
- `CASCADE` thì đếm rồi đệ quy xuống bảng con của bảng đó. `SET NULL` và `SET DEFAULT` thì đếm rồi dừng. `RESTRICT` và `NO ACTION` thì đếm dòng con đang tồn tại để lập `blockers`.
- Chạy trong transaction chỉ đọc, mỗi bước chịu `statement_timeout` của environment.
- `warnings` nhắc các điểm tool không biết: FK có thể hoãn (`deferrable`), hiệu ứng của trigger và rule trên bảng con, và FK không có index ở bảng con làm bước đếm chậm (liên hệ `missing_fk_index` của `list_indexes`).
- Kết quả đúng tại thời điểm gọi. Dữ liệu có thể đổi trước khi lệnh thật chạy.

### dry\_run

Nhóm `read_data` · `env` bắt buộc · Postgres và SQLite đầy đủ, driver khác hạn chế (mục 9)

Chạy thật câu lệnh trong một transaction rồi `ROLLBACK`, để lộ lỗi constraint, lock và thời gian thật.

| Tham số | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `env` | enum | Có | Chỉ `dev` và `sta` trong phiên bản đầu |
| `sql` | string | Có | Một hoặc nhiều câu `INSERT`, `UPDATE`, `DELETE`. DDL chỉ được ở `dev` và `sta` |
| `timeout_seconds` | int | Không | Mặc định 15, tối đa theo environment |
| `lock_timeout_ms` | int | Không | Mặc định 1000 |

Ngoại lệ về Production: `dry_run` từ chối `pro` bằng `PERMISSION_DENIED` bất kể công tắc Production, kèm gợi ý dùng `estimate_impact`. Lý do: giữ lock hàng, để lại dead tuples, và trigger có thể gọi ra hệ thống ngoài mà `ROLLBACK` không hoàn lại.

Kết quả `data`:

- `statements[]`: `n`, `kind`, `status` (`ok`, `error`, `skipped`), `rowsAffected`, `elapsedMs`, `error` gồm `sqlstate`, `constraint`, `message`.
- `locksHeld[]`: `relation`, `mode`, đọc từ `pg_locks` ngay trước khi rollback.
- `triggersOnTarget[]`: như `estimate_impact`.
- `caveats[]`: các tác dụng phụ không hoàn lại được, ví dụ `sequence_advanced` khi `INSERT` vào bảng có serial hoặc identity.
- `rolledBack`: luôn true khi trả về thành công.

Cách làm:

- Dùng connection riêng. `BEGIN`, `SET LOCAL statement_timeout`, `lock_timeout`, `idle_in_transaction_session_timeout`.
- Chạy lần lượt từng câu. Lỗi constraint là dữ liệu của kết quả (`status: "error"`), không phải lỗi tool. Các câu sau lỗi đầu tiên có `status: "skipped"` vì transaction đã hỏng.
- Trước khi rollback chạy `SET CONSTRAINTS ALL IMMEDIATE` để lộ lỗi của FK hoãn.
- `ROLLBACK` luôn nằm trong khối `finally`. Nếu không xác nhận được rollback, đóng connection để database tự hủy transaction và trả `INTERNAL` kèm cảnh báo.
- Chạy `classify_sql` trước. Verdict `blocked` theo policy của environment thì trả `POLICY_BLOCKED`, không thực thi.

## 6. Nhóm C: quy trình thay đổi có duyệt

Đây là đường ghi duy nhất của AI: AI đề xuất, người duyệt trong app, Zentro thực thi. MCP không bao giờ tự thực thi một thay đổi.

**Nguyên tắc**

- AI chỉ có hai việc: tạo proposal và rút lại proposal của chính nó. Duyệt, từ chối và thực thi luôn nằm trong giao diện Zentro, do user thao tác.
- Không có tham số hay cờ nào cho phép bỏ qua bước duyệt, kể cả ở `dev`.
- Proposal thuộc project đang mở. Không có project nào đang mở thì mọi tool trong nhóm trả `NOT_CONNECTED`.
- Proposal hết hạn theo TTL: `dev` 15 phút, `sta` 10 phút, `pro` 5 phút. Hết hạn thì không duyệt được nữa.
- Mỗi proposal chỉ thực thi tối đa một lần. Sửa SQL nghĩa là tạo proposal mới.

### propose\_change

Nhóm `changes` · `env` bắt buộc · mọi driver (khả năng khôi phục khác nhau, mục 9)

Tạo một proposal ở trạng thái `pending` và báo cho user trong app. Không thực thi gì.

| Tham số | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `env` | enum | Có | Bắt buộc truyền rõ, không mặc định theo environment đang mở. `pro` cần công tắc Production |
| `sql` | string | Có | Một hoặc nhiều câu, tối đa 20 câu và 50 KB. Placeholder theo driver: `$1` (Postgres), `?` (MySQL, SQLite), `@p1` (SQL Server) |
| `params` | array | Không | Giá trị cho placeholder. Phần tử `null` nghĩa là user tự nhập ở màn hình duyệt. Giá trị nhạy cảm nên để `null` |
| `title` | string | Không | Tối đa 80 ký tự, hiển thị trong hàng đợi duyệt |
| `rationale` | string | Không | Tối đa 500 ký tự, lý do do AI viết |
| `explanation` | object | Có | Lời giải thích cho người duyệt: `summary` (tối đa 400 ký tự), `affected_objects[]` (tối đa 20), `expected_effect` (tối đa 500), `risks[]` (ít nhất 1, tối đa 10, mỗi mục tối đa 300), `irreversible` (bool), `rollback_plan` (tối đa 400). Thiếu hoặc rỗng thì `INVALID_ARGUMENT` và không tạo proposal. Đi qua cùng bộ quét dạng nhạy cảm như kết quả tool |

Kiểm tra đồng bộ khi gọi, theo thứ tự. Bước nào thất bại thì không tạo proposal:

1. **Deny list cứng** (`SQL_NOT_ALLOWED`, không có đường duyệt), kiểm bằng token ở từng câu lệnh, không cần parser:
   - Cặp từ khóa đầu: `DROP DATABASE`, `GRANT`, `REVOKE`, `ALTER SYSTEM`, `CREATE EXTENSION`, `SET ROLE`, `SET SESSION AUTHORIZATION`.
   - `CREATE`, `ALTER` hoặc `DROP` mà token `ROLE` hoặc `USER` xuất hiện ngay sau (kể cả sau `IF EXISTS`).
   - Mọi câu lệnh bắt đầu bằng `COPY`. Từ chối cả `COPY ... FROM STDIN`, vì phân biệt `PROGRAM` và file bằng token dễ sai và MCP không có đường truyền dữ liệu qua stdin.
   - Các hàm trong deny list hàm của `run_readonly_query`, so khớp theo token ở bất kỳ vị trí nào.

   Vì có người duyệt SQL cuối cùng, mức độ chặt của token ở đây có thể nghiêng về từ chối nhầm hơn là bỏ sót, nhưng deny list vẫn phải chạy trước khi tạo proposal.
2. **`validate_sql`**: không hợp lệ thì trả `SQL_PARSE_ERROR` kèm danh sách lỗi. DML được database kiểm tra thật. DDL chỉ qua kiểm tra token (`checkedBy: "tokens"`), nên `analysis` ghi chú DDL chưa được database xác nhận và người duyệt thấy dòng đó trên màn hình duyệt.
3. **`classify_sql` theo `env`**: verdict `blocked` thì trả `POLICY_BLOCKED`. Verdict `needs_confirmation` thì tạo proposal với `requiresTypedConfirm: true`.
4. **Giới hạn**: tối đa 5 proposal `pending` cùng lúc trong project, vượt thì `RATE_LIMITED`.
5. **Trùng lặp**: cùng `env` và cùng hash SQL với một proposal đang `pending` thì trả lại proposal đó, `deduplicated: true`.

Kết quả `data`:

- `id`, `state` (`pending`), `expiresAt`, `title`.
- `statements[]`: `n`, `kind`, `risk`, `rules[]` do `classify_sql` tính.
- `verdict`, `requiresTypedConfirm`, `cooldownSeconds` (3 với `pro`, 0 với môi trường khác).
- Zentro lưu `explanation` của AI và `checks[]` do chính Zentro đo, hai phần tách biệt trên màn hình duyệt ("Do AI viết, chưa kiểm chứng" và "Zentro đã kiểm tra"). Mỗi check có `name` (`where_clause`, `destructive`, `row_count`, `cascade`, `migration_safety`), `status` (`ok`, `warn`, `unavailable`) và `detail`. Check không chạy được ghi `unavailable` kèm lý do, không bị bỏ. `checks` không có trong kết quả trả cho AI, chỉ hiển thị cho người duyệt. Chi tiết: ADR 0016.
- `analysis`: kết quả `estimate_impact`, `preview_cascade`, `check_migration_safety` mà Zentro tự tính cho màn hình duyệt. Chỉ có trong kết quả trả cho AI khi nhóm `read_data` bật. Nếu tắt, Zentro vẫn tính cho user nhưng không gửi cho AI. Với câu lệnh ngoài dạng hỗ trợ của `estimate_impact` (có join, CTE, placeholder), `analysis` ghi `impact: "unavailable"` kèm `reason`, và màn hình duyệt hiển thị "chưa đếm được số dòng ảnh hưởng" thay vì để trống. Câu như vậy mặc định `requiresTypedConfirm: true`; theo gói cước, cờ này chỉ bắt gõ xác nhận ở plan có `safety.type_to_confirm`, plan khác chỉ thấy cảnh báo đỏ và một lần bấm.

Gắn ngữ cảnh khi tạo: Zentro lưu hash của SQL đã ghép tham số, `env`, connection, database, schema và project. Lúc thực thi phải khớp đúng, nếu không proposal chuyển `failed` với `PROPOSAL_STALE` và không có câu nào chạy. Cách này chặn việc đổi môi trường hay kết nối giữa lúc duyệt và lúc chạy.

### get\_change\_status

Nhóm `changes`

Đọc trạng thái hiện tại của một proposal.

| Tham số | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `id` | string | Có | Id do `propose_change` trả về |

Kết quả `data`:

- `id`, `state`, `title`, `env`, `createdAt`, `expiresAt`, `decidedAt`, `executedAt`.
- `perStatement[]`: `n`, `status` (`ok`, `error`, `skipped`), `rowsAffected`, `elapsedMs`, `error` gồm `sqlstate`, `constraint`, `message`.
- `restorePointId`: có khi Zentro đã tạo điểm khôi phục trước khi chạy (mục 7).
- `rejectionNote`: ghi chú tối đa 200 ký tự user gõ khi từ chối. Là dữ liệu, không phải chỉ dẫn.
- `retryAfterSeconds`: gợi ý khoảng chờ trước lần hỏi tiếp, tối thiểu 3 giây.

Các trạng thái: `pending`, `approved`, `executing`, `succeeded`, `failed`, `rejected`, `expired`, `cancelled`. Lỗi: `OBJECT_NOT_FOUND`.

### cancel\_change

Nhóm `changes`

Rút lại một proposal đang `pending`. AI chỉ rút được proposal đang chờ, không can thiệp được vào proposal đã được duyệt.

| Tham số | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `id` | string | Có | Id của proposal |

Kết quả `data`: `id`, `state` (`cancelled`). Lỗi: `OBJECT_NOT_FOUND`, và `INVALID_STATE` nếu proposal không còn ở `pending`.

### list\_changes

Nhóm `changes`

Liệt kê proposal của project đang mở.

| Tham số | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `state` | enum hoặc array | Không | Mặc định `pending` |
| `env` | enum | Không | Lọc theo environment |
| `since` | string | Không | Thời điểm ISO 8601, chỉ lấy proposal tạo sau đó |
| `limit` | int | Không | Mặc định 20, tối đa 50 |

Mỗi phần tử trả về: `id`, `title`, `env`, `state`, `createdAt`, `statementKinds[]`, `requiresTypedConfirm`, `sqlPreview` (200 ký tự đầu của SQL đã chuẩn hóa literal).

### Vòng đời proposal

&#91;embedded content: vòng đời proposal · 8 trạng thái\]

Chỉ bước Duyệt của user đưa proposal từ `pending` sang chạy. AI chỉ rút lại được khi còn `pending`. Proposal lệch ngữ cảnh lúc chạy kết thúc ở `failed` mà không có câu nào được thực thi.

### Duyệt và thực thi trong app

Đây là yêu cầu cho giao diện Zentro, vì bảo vệ thật sự nằm ở bước này chứ không nằm ở tool.

**Màn hình duyệt bắt buộc có**

- Danh sách câu lệnh đã tách, mỗi câu kèm nhãn rủi ro do Zentro tính từ `classify_sql`.
- Các con số do Zentro tự tính, không lấy từ AI: số dòng ảnh hưởng, cascade và blockers, trigger có thể chạy, cảnh báo lock hoặc rewrite bảng nếu là DDL.
- `title` và `rationale` của AI hiển thị cỡ nhỏ, gắn nhãn "do AI viết, chưa kiểm chứng".
- Ô nhập cho mọi tham số `null`.
- Đúng hai nút: Duyệt, và Từ chối kèm ghi chú tùy chọn. Duyệt hoặc từ chối cả proposal, không duyệt một phần, vì các câu lệnh thường phụ thuộc nhau.

**Mức ma sát tăng theo rủi ro**

| Environment | Hiển thị thêm | Xác nhận |
| --- | --- | --- |
| `dev` | Danh sách câu lệnh và nhãn rủi ro | Một lần bấm Duyệt |
| `sta` | Thêm số dòng ảnh hưởng và cascade | Một lần bấm Duyệt |
| `pro` | Như `sta`, cộng cảnh báo lock và rewrite với DDL | Gõ lại tên environment, chờ 3 giây rồi nút Duyệt mới sáng |

Ở mọi environment, proposal có `requiresTypedConfirm: true` đều bắt gõ xác nhận. Khối `DO` và SQL động (`EXECUTE`) mà Zentro không phân tích hết được coi là rủi ro cao nhất, luôn rơi vào trường hợp này.

**Thực thi sau khi duyệt**

- Chạy trong một transaction duy nhất khi driver hỗ trợ DDL trong transaction (Postgres, SQLite, SQL Server). Một câu lỗi thì rollback toàn bộ và proposal chuyển `failed`.
- Với MySQL, DDL tự commit nên không rollback được. Zentro bắt buộc tạo thành công một restore point trước khi nút Duyệt hoạt động (mục 7).
- Ở `sta` và `pro`, proposal có DDL tự tạo restore point mức schema trước khi chạy. Id trả về trong `restorePointId`.
- Safety policy của environment (strictness, timeout) vẫn áp dụng như khi user tự chạy. Duyệt không có nghĩa là qua mặt policy.
- Không tự thử lại khi lỗi.
- Kết quả từng câu và người duyệt được ghi vào audit với `source: "mcp"`.

### Ràng buộc bảo mật

| Rủi ro | Biện pháp |
| --- | --- |
| AI mô tả một đằng, SQL làm một nẻo | Màn hình duyệt nhấn mạnh thông tin Zentro tự tính. `rationale` chỉ hiện cỡ nhỏ, có nhãn chưa kiểm chứng. |
| Prompt injection qua dữ liệu, comment hay định nghĩa view | AI không có đường ghi trực tiếp. Deny list cứng, tối đa 5 proposal `pending`, mọi nội dung đọc từ database gắn nhãn dữ liệu. |
| Đổi environment hay connection giữa lúc duyệt và lúc chạy | Hash SQL, `env`, connection, database, schema và project được gắn lúc tạo. Lệch thì `PROPOSAL_STALE`, không chạy. |
| Duyệt theo thói quen | Ma sát tăng theo environment. Ở `pro` phải gõ tên environment và chờ 3 giây. |
| Chạy lại proposal cũ | Mỗi proposal chạy tối đa một lần, TTL ngắn. |
| Dùng proposal để lách policy | Policy của environment áp dụng lúc thực thi. |
| Nhiều proposal để làm user mệt | Tối đa 5 proposal `pending` và 10 lệnh gọi nhóm `changes` mỗi phút. |
| Một câu nguy hiểm núp trong SQL nhiều câu | Tách và hiển thị từng câu, duyệt cả proposal. |

## 7. Nhóm D: migration và khôi phục

Năm tool này giúp thay đổi schema không làm sập production: kiểm tra tác động của DDL, sinh script giữa các environment, và lưu điểm khôi phục. Không tool nào trong nhóm ghi vào database. Mọi script chỉ chạy qua `propose_change` hoặc nút trong app.

### check\_migration\_safety

Nhóm `metadata` · Postgres đầy đủ, MySQL một phần (mục 9)

Phân tích DDL xem có khóa bảng lâu, viết lại bảng hay làm hỏng ứng dụng đang chạy không, dựa trên kích thước thật của bảng ở environment được chọn.

| Tham số | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `sql` | string | Có | Một hoặc nhiều câu DDL |
| `env` | enum | Không | Lấy kích thước bảng và phiên bản server từ environment này. Nên truyền `pro` để thấy kích thước thật |
| `schema` | string | Không | Mặc định là schema đang active |

Kết quả `data`:

- `serverVersion` và `maxSeverity` (`info`, `warning`, `critical`).
- `statements[]`: `n`, `kind`, `tables[]` (`name`, `estRows`, `totalBytes`), `rules[]`.
- Mỗi phần tử của `rules[]`: `id`, `severity`, `message`, `lock` (chế độ lock cao nhất), `rewritesTable`, `alternative` (cách làm an toàn hơn, viết bằng lời).
- `unanalyzed[]`: câu lệnh nằm ngoài catalog quy tắc, mức `info`.

Kết quả phụ thuộc phiên bản server, vì Zentro đọc `server_version_num` từ connection. Ví dụ `ADD COLUMN` với DEFAULT hằng chỉ cập nhật siêu dữ liệu từ Postgres 11, trước đó là viết lại cả bảng.

Cách nhận diện (token cộng catalog, không có parser):

Tool không hiểu toàn bộ cú pháp DDL. Nó có một bộ nhận mẫu cho một tập hẹp câu lệnh, dựa trên token ở độ sâu 0, và đưa phần còn lại vào `unanalyzed[]`:

- `ALTER TABLE [IF EXISTS] [ONLY] <bảng> <hành động>[, <hành động>...]`: tách hành động tại dấu phẩy ở độ sâu 0, mỗi hành động nhận theo các từ khóa đầu: `ADD [COLUMN]`, `ALTER [COLUMN] ... TYPE`, `ALTER [COLUMN] ... SET NOT NULL`, `ADD CONSTRAINT ... (FOREIGN KEY | CHECK | UNIQUE | PRIMARY KEY)`, `DROP [COLUMN]`, `RENAME`.
- `CREATE [UNIQUE] INDEX [CONCURRENTLY] ...`, `DROP TABLE`, `TRUNCATE`, `SET lock_timeout`.
- Hành động hoặc câu lệnh khác, và mọi câu có `DO` hoặc `EXECUTE`: vào `unanalyzed[]`. Với `DO` và `EXECUTE`, `maxSeverity` tối thiểu là `warning`, vì Zentro không biết khối đó làm gì.

Các quyết định cần thêm thông tin, và cách trả lời khi không có parser:

- **DEFAULT hằng hay không** (`add_column_volatile_default`): lấy các token sau `DEFAULT` đến hết hành động. Biểu thức chỉ gồm literal, `NULL`, ép kiểu `::`, và từ khóa thời gian ổn định như `CURRENT_TIMESTAMP` thì coi là hằng. Có lời gọi hàm thì tra `pg_proc.provolatile` theo tên (lấy mức biến động cao nhất trong các overload): hàm `volatile` thì áp quy tắc. Biểu thức có định danh không giải được, subquery hoặc hàm không tìm thấy trong catalog thì coi là không xác định và áp quy tắc ở mức thận trọng, `message` ghi rõ "không xác định được DEFAULT có phải hằng hay không".
- **Đổi kiểu cột có chỉ đổi siêu dữ liệu không** (`alter_column_type_rewrite`): kiểu cũ lấy từ catalog, kiểu mới là các token sau `TYPE` đến `USING` hoặc hết hành động. Chỉ nhận một danh sách an toàn: nới `varchar(n)` lên `varchar(m)` với m không nhỏ hơn n, hoặc đổi sang `text`, và không có `USING`. Mọi trường hợp khác coi là viết lại bảng. Kết quả đúng hoặc thận trọng, không bao giờ lạc quan.
- **Có `NOT VALID` hay `CONCURRENTLY` hay không**: so khớp token.
- **`SET NOT NULL` có bỏ qua quét nhờ CHECK hay không**: chỉ tra catalog xem bảng đã có CHECK hợp lệ nào dạng `col IS NOT NULL`. Không tìm thấy thì coi là phải quét.

Nguyên tắc: khi token không đủ để kết luận, tool chọn kết quả cảnh báo nhiều hơn, và ghi rõ trong `message` là không xác định được. Một cảnh báo thừa tốn vài giây của người đọc, một cảnh báo thiếu có thể làm khóa bảng production.

Đầu vào có cấu trúc: `generate_migration` và `preview_rollback` tạo ra danh sách thao tác có cấu trúc từ catalog (thêm cột, đổi kiểu, tạo index...). Chúng gọi cùng bộ quy tắc trực tiếp trên danh sách đó, không sinh SQL rồi nhận diện lại. Chỉ lời gọi MCP `check_migration_safety` với `sql` do AI hoặc user viết mới đi qua bộ nhận mẫu token.

Bộ quy tắc ban đầu cho Postgres:

| Quy tắc | Phát hiện | Tác động | Cách an toàn hơn |
| --- | --- | --- | --- |
| `add_column_volatile_default` | `ADD COLUMN` có DEFAULT không hằng (như `random()`, `clock_timestamp()`) | `ACCESS EXCLUSIVE`, viết lại cả bảng | Thêm cột cho phép NULL, backfill theo lô, rồi đặt DEFAULT |
| `add_not_null_column_no_default` | `ADD COLUMN ... NOT NULL` không DEFAULT | Lỗi nếu bảng đã có dòng | Thêm cột nullable, backfill, rồi `SET NOT NULL` |
| `set_not_null_scan` | `SET NOT NULL` | `ACCESS EXCLUSIVE` kèm quét cả bảng. Từ Postgres 12 bỏ qua quét nếu đã có CHECK hợp lệ chứng minh không NULL | `ADD CONSTRAINT ... CHECK ... NOT VALID`, `VALIDATE CONSTRAINT`, rồi `SET NOT NULL` |
| `alter_column_type_rewrite` | `ALTER COLUMN TYPE` không thuộc nhóm chỉ đổi siêu dữ liệu (nới `varchar(n)` hoặc đổi sang `text` thì an toàn) | `ACCESS EXCLUSIVE`, viết lại bảng và index | Thêm cột mới, backfill, đổi tên qua hai lần triển khai |
| `create_index_blocking` | `CREATE INDEX` không `CONCURRENTLY` | Lock `SHARE`, chặn ghi suốt thời gian xây index | `CREATE INDEX CONCURRENTLY` |
| `add_constraint_validating` | `ADD FOREIGN KEY` hoặc `ADD CHECK` không `NOT VALID` | Quét cả bảng khi đang giữ lock mạnh | `NOT VALID`, rồi `VALIDATE CONSTRAINT` |
| `add_unique_blocking` | `ADD CONSTRAINT UNIQUE` hoặc `PRIMARY KEY` | Giữ lock mạnh trong lúc xây index | `CREATE UNIQUE INDEX CONCURRENTLY`, rồi `ADD CONSTRAINT ... USING INDEX` |
| `drop_column_data_loss` | `DROP COLUMN` | Mất dữ liệu. Ứng dụng bản cũ đang chạy có thể lỗi | Ngừng dùng cột trong code trước, xóa ở lần triển khai sau |
| `rename_breaks_clients` | `RENAME COLUMN` hoặc `RENAME TO` | Ứng dụng bản cũ lỗi ngay | Thêm tên mới, chuyển dần, rồi xóa tên cũ |
| `drop_table_or_truncate` | `DROP TABLE`, `TRUNCATE` | Mất dữ liệu | Đổi tên sang tên tạm trước, xóa sau một thời gian |
| `missing_lock_timeout` | Có lệnh cần lock mạnh mà script không có `SET lock_timeout` | Lệnh DDL xếp hàng chờ lock và chặn mọi truy vấn đứng sau nó | Đặt `SET lock_timeout` ở đầu script |
| `concurrently_in_transaction` | `CREATE INDEX CONCURRENTLY` nằm chung proposal nhiều câu | Lỗi, vì lệnh này không chạy được trong transaction | Tách thành proposal riêng chỉ một câu lệnh |

Mức độ nghiêm trọng:

- Các quy tắc từ `add_column_volatile_default` đến `add_unique_blocking`, trừ `add_not_null_column_no_default`, mặc định là `warning`. Bảng ước tính dưới 10.000 dòng hạ xuống `info`. Bảng từ 1.000.000 dòng trở lên nâng lên `critical`. Ngưỡng cấu hình được.
- `add_not_null_column_no_default` là `critical` nếu bảng đã có dòng, vì câu lệnh chắc chắn lỗi.
- `drop_column_data_loss`, `drop_table_or_truncate` và `concurrently_in_transaction` luôn là `critical`. `rename_breaks_clients` và `missing_lock_timeout` luôn là `warning`. Các quy tắc này không đổi theo kích thước bảng.
- Tool chỉ phân tích. Không câu lệnh nào được chạy.

### generate\_migration

Nhóm `metadata` · Postgres đầy đủ

Sinh script đưa schema của `to_env` về giống `from_env`, kèm script ngược và đánh giá an toàn. Không thực thi gì.

| Tham số | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `from_env` | enum | Có | Environment có schema mong muốn |
| `to_env` | enum | Có | Environment cần cập nhật. Script được áp lên environment này |
| `kinds` | array | Không | Gồm table, index, constraint, view. Mặc định là tất cả |
| `objects` | array | Không | Giới hạn theo tên object |
| `include_drops` | bool | Không | Có sinh lệnh `DROP` cho object chỉ có ở `to_env` hay không. Mặc định false |

Kết quả `data`:

- `up`: `sql` và `statements[]` gồm `n`, `sql`, `objects[]`, `verdict` (theo `classify_sql` của `to_env`).
- `down`: `sql`, `complete` (bool), `irreversible[]`.
- `safety`: kết quả của `check_migration_safety` cho `up`, tính trên kích thước bảng của `to_env`.
- `unsupportedDiffs[]`: khác biệt tool không sinh được script, kèm `reason` (`routine`, `trigger`, `enum_type`, `extension`, `object_text_off`).
- `warnings[]`.

Hành vi:

- Dựa trên `diff_schema` và sắp xếp theo phụ thuộc: tạo bảng cha trước bảng con, xóa theo thứ tự ngược lại.
- Không phát hiện đổi tên. Cột đổi tên hiện ra là một cột mất và một cột mới. Mặc định `include_drops` là false nên script chỉ thêm cột mới, không làm mất dữ liệu. Tool thêm cảnh báo `possible_rename` khi hai cột cùng bảng, cùng kiểu, mỗi cột chỉ có ở một phía.
- `safety` được tính trên danh sách thao tác có cấu trúc dùng để sinh `up`, không phải trên chuỗi SQL, nên không phụ thuộc bộ nhận mẫu token.
- `down` đảo từng thao tác: thêm cột với xóa cột, tạo index với xóa index. Thao tác mất dữ liệu (xóa cột, xóa bảng, thu hẹp kiểu) không đảo được nên nằm trong `irreversible[]` và `down.complete` là false.
- Phạm vi bản đầu: table, column, index, constraint, view. View cần nhóm `object_text` bật, nếu tắt thì view nằm trong `unsupportedDiffs` với lý do `object_text_off`. Routine, trigger, enum, extension chỉ được báo, chưa sinh script.
- Literal trong biểu thức `DEFAULT` và `CHECK` là một phần định nghĩa schema nên được giữ nguyên trong script.
- Script là văn bản. Muốn chạy phải đi qua `propose_change`, chú ý quy tắc `concurrently_in_transaction`. Kết quả tối đa 256 KB. Vượt thì `truncated: true` và dùng `objects` để chia nhỏ.

### create\_restore\_point

Nhóm `changes` · `env` bắt buộc · Postgres và SQLite đầy đủ

Lưu ảnh chụp schema của một environment vào kho cục bộ của Zentro. Không ghi gì vào database.

| Tham số | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `env` | enum | Có | `pro` cần công tắc Production |
| `label` | string | Không | Tối đa 80 ký tự |
| `schema` | string | Không | Mặc định là schema đang active |

Kết quả `data`: `id`, `env`, `label`, `createdAt`, `scope` (`schema`), `objectCounts` (`tables`, `views`, `indexes`, `constraints`, `routines`), `schemaHash`, `sizeBytes`.

Hành vi:

- Chỉ đọc catalog. Ảnh chụp gồm cả thân view và routine, lưu cục bộ và không rời máy. Thân đó không trả về cho AI trừ khi nhóm `object_text` bật.
- Restore point mức dữ liệu (sao chép dữ liệu của một số bảng) phải ghi vào database nên **không** tạo được qua MCP. Chỉ user tạo trong app, hoặc Zentro tự tạo khi một proposal được duyệt (mục 6).
- Giữ tối đa 20 điểm mỗi environment. Vượt thì xóa điểm cũ nhất, trừ điểm gắn với proposal trong 30 ngày gần nhất.
- Lỗi: `PERMISSION_DENIED`, `NOT_CONNECTED`.

### list\_restore\_points

Nhóm `changes`

Liệt kê các điểm khôi phục đã lưu.

| Tham số | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `env` | enum | Không | Lọc theo environment |
| `limit` | int | Không | Mặc định 20, tối đa 50 |

Mỗi phần tử trả về: `id`, `env`, `label`, `createdAt`, `source` (`mcp`, `user` hoặc `proposal`), `proposalId` (khi `source` là `proposal`), `scope` (`schema` hoặc `data`), `dataTables[]` (tên bảng có dữ liệu trong điểm, khi `scope` là `data`), `objectCounts`, `sizeBytes`.

### preview\_rollback

Nhóm `changes` · không thực thi

Cho biết khôi phục một restore point sẽ thay đổi gì ở environment của điểm đó.

| Tham số | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `id` | string | Có | Id của restore point |

Kết quả `data`:

- `diff`: cùng dạng với `diff_schema`, với `from` là ảnh chụp và `to` là schema hiện tại.
- `script`: SQL đưa schema hiện tại về ảnh chụp, sinh như `generate_migration` với `include_drops` bằng true.
- `safety`: kết quả `check_migration_safety` cho `script`, tính trên kích thước bảng hiện tại.
- `dataLoss[]`: object bị xóa bởi `script`. Dữ liệu tạo ra sau thời điểm chụp ở các object này sẽ mất.
- `dataNotRestored[]`: object hoặc cột có trong ảnh chụp nhưng đã bị xóa sau đó. `script` tạo lại chúng rỗng, trừ bảng nằm trong `dataRestorable[]`.
- `dataRestorable[]`: bảng có dữ liệu trong điểm khi `scope` là `data`.

Hành vi:

- Không thực thi. User chạy khôi phục bằng nút trong app, qua cùng màn hình duyệt và cùng mức ma sát như proposal ở environment đó. AI có thể đưa `script` vào `propose_change`.
- Lỗi: `OBJECT_NOT_FOUND`, `NOT_CONNECTED`, `UNSUPPORTED_DRIVER`.

## 8. Nhóm E: audit và dữ liệu nhạy cảm

Hai tool này làm nền cho phần còn lại: audit cho biết ai đã làm gì, phân loại dữ liệu cho biết cột nào không được lộ ra khỏi máy.

### get\_audit\_log

Nhóm `audit` · không phụ thuộc driver

Đọc nhật ký các thao tác nguy hiểm và mọi lệnh gọi MCP của project, để biết thao tác nào đến từ UI hay từ AI, ở environment nào, và đã qua xác nhận chưa.

| Tham số | Kiểu | Bắt buộc | Mô tả |
| --- | --- | --- | --- |
| `env` | enum | Không | Lọc theo environment |
| `source` | enum | Không | `ui`, `mcp` hoặc `any` (mặc định) |
| `outcome` | array | Không | Gồm `ok`, `error`, `denied`, `rejected`, `expired` |
| `since`, `until` | string | Không | Thời điểm ISO 8601 |
| `limit` | int | Không | Mặc định 50, tối đa 200 |
| `cursor` | string | Không | Lấy từ `nextCursor` của lần trước |

Kết quả `data`:

- `entries[]`: `id`, `at`, `env`, `source`, `actor` (`user` hoặc `mcp:<tên client>`), `action` (tên tool với `mcp`, hoặc `run_query`, `run_script` với `ui`), `verdict`, `confirmed`, `outcome`, `rowsAffected`, `elapsedMs`, `sqlNormalized`, `sqlHash`, `proposalId`, `restorePointId`.
- `nextCursor`.
- `chainValid`: kết quả kiểm tra chuỗi hash của nhật ký.

Yêu cầu về kho nhật ký (Zentro chưa có, cần dựng mới):

- Kho cục bộ chỉ thêm, không sửa: một file SQLite trong thư mục dữ liệu của app. Mỗi bản ghi chứa hash nối với bản ghi trước. Cách này phát hiện sửa nhầm hoặc xóa nhầm, không chống được người có quyền trên máy.
- Ghi từ UI: mọi câu lệnh có verdict `needs_confirmation` hoặc `blocked`, mọi DDL, mọi thao tác ghi ở `pro`. Không ghi các câu `SELECT` thường, vì khối lượng lớn và ít giá trị.
- Ghi từ MCP: mọi lệnh gọi, kể cả bị từ chối.
- Không bao giờ ghi: dữ liệu dòng, giá trị literal, giá trị tham số, password. Chỉ lưu SQL đã chuẩn hóa và hash.
- Giữ 90 ngày hoặc 50.000 bản ghi, tùy ngưỡng nào đến trước. Bản ghi cũ hơn bị xóa theo lô. Cấu hình được.

### get\_data\_classification (đã bỏ)

Bỏ theo ADR 0017. Phân loại cột theo tên là phép đoán và không bảo đảm được việc che dữ liệu (alias, biểu thức, `row_to_json`). Thay vào đó: không gửi giá trị dòng trừ khi bật Data mode, mỗi lần gửi được user xem trước, cột giống credential và ô có dạng nhạy cảm luôn bị che.

## 9. Hỗ trợ theo driver

Postgres hỗ trợ đầy đủ mọi tool. Ba driver còn lại thiếu một số khả năng do khác biệt của chính database, và bảng dưới ghi rõ chỗ nào thiếu.

| Tool | Postgres | MySQL | SQL Server | SQLite |
| --- | --- | --- | --- | --- |
| `validate_sql` | Đầy đủ cho DML, DDL ở mức token | DML qua `PREPARE`, DDL ở mức token | Một phần (token) | Đầy đủ |
| `explain_plan` | Đầy đủ | Đầy đủ (`EXPLAIN FORMAT=JSON`) | Một phần (`SHOWPLAN_XML`) | Một phần (không có chi phí và số dòng) |
| `diff_schema` | Đầy đủ | Đầy đủ | Một phần (table, column, index, constraint) | Một phần (table, column, index, view) |
| `find_dependencies` | Đầy đủ | Một phần (FK, view, không có routine) | Đầy đủ | Một phần (FK, view, trigger) |
| `get_table_stats` | Đầy đủ | Một phần (ít thống kê cột) | Một phần | Một phần (chỉ có thống kê cột nếu đã `ANALYZE`) |
| `list_indexes` | Đầy đủ | Đầy đủ (`unused` cần `performance_schema`) | Đầy đủ | Một phần (không có `unused`) |
| `run_readonly_query` | Đầy đủ | Đầy đủ (`READ ONLY`) | Một phần (cần tài khoản chỉ đọc) | Đầy đủ (`query_only`) |
| `estimate_impact` | Đầy đủ (một bảng) | Đầy đủ (một bảng) | Một phần (một bảng, không có transaction chỉ đọc) | Đầy đủ (một bảng) |
| `preview_cascade` | Đầy đủ (một bảng) | Đầy đủ (InnoDB, một bảng) | Một phần | Đầy đủ khi `foreign_keys` bật |
| `dry_run` | Đầy đủ | Một phần (DML trên InnoDB, từ chối DDL) | Một phần | Đầy đủ |
| `propose_change` và 3 tool đi kèm | Đầy đủ | Đầy đủ, DDL không rollback | Đầy đủ | Đầy đủ |
| `check_migration_safety` | Đầy đủ | Một phần (quy tắc riêng cho `ALGORITHM` và `LOCK`) | Chưa | Chưa |
| `generate_migration` | Đầy đủ | Một phần | Một phần | Chưa |
| `create_restore_point` | Đầy đủ | Đầy đủ (`SHOW CREATE`) | Một phần | Đầy đủ (`sqlite_master`) |
| `list_restore_points` | Đầy đủ | Đầy đủ | Đầy đủ | Đầy đủ |
| `preview_rollback` | Đầy đủ | Một phần | Một phần | Chưa |
| `get_audit_log` | Đầy đủ | Đầy đủ | Đầy đủ | Đầy đủ |

Ý nghĩa các mức:

- **Đầy đủ**: mọi tham số và trường kết quả trong spec đều có.
- **Một phần**: tool chạy, nhưng thiếu một số trường hoặc quy tắc. Trường thiếu trả `null` và `warnings[]` nói rõ thiếu gì.
- **Chưa**: tool trả `UNSUPPORTED_DRIVER` kèm gợi ý, không lỗi âm thầm.

Những khác biệt giữa các database ảnh hưởng thiết kế:

- **DDL trong transaction**: Postgres, SQLite và SQL Server có (SQL Server trừ vài lệnh như `CREATE DATABASE`). MySQL tự commit khi gặp DDL, nên `propose_change` với DDL trên MySQL cần restore point bắt buộc.
- **Transaction chỉ đọc**: Postgres, MySQL và SQLite có. SQL Server không có, vì vậy `run_readonly_query` ở đó chỉ nên bật khi connection dùng tài khoản chỉ đọc.
- **Câu lệnh nhiều bảng**: không có parser nên `estimate_impact` và `preview_cascade` chỉ nhận câu lệnh một bảng ở cả bốn driver. Cú pháp đích khác nhau (`DELETE t FROM t JOIN ...` của MySQL, `UPDATE a SET ... FROM ...` của SQL Server) đều nằm ngoài dạng hỗ trợ và trả `SQL_UNSUPPORTED`. Không cần `ctid`, `rowid` hay khóa chính để đếm dòng đích duy nhất.
- **Tokenizer theo driver**: quy tắc chuỗi và định danh khác nhau: Postgres có dollar-quote và `E'...'`, MySQL có backtick và `\` escape trong chuỗi, SQL Server có `[...]` và `N'...'`, SQLite có cả bốn kiểu nháy. Tokenizer nhận tên driver như `SplitStatementsForDriver`, và mỗi driver có bộ test riêng.
- **Tạo index không chặn ghi**: `CREATE INDEX CONCURRENTLY` chỉ có ở Postgres. MySQL dùng `ALGORITHM` và `LOCK`. SQL Server dùng `ONLINE = ON`, tùy phiên bản và edition.

Bảng này là đánh giá theo khả năng của từng database, chưa kiểm chứng với driver và thư viện Zentro đang dùng. Mỗi ô "Một phần" cần một spike nhỏ trước khi xếp lịch làm.

## 10. Thứ tự triển khai và câu hỏi còn mở

Nên làm theo năm giai đoạn, vì các tool sau phụ thuộc vào nền của các tool trước: `propose_change` cần audit, restore point, `estimate_impact` và `check_migration_safety`, nên nó đến cuối.

| Giai đoạn | Nội dung | Vì sao ở vị trí này | Tiêu chí nghiệm thu (đề xuất) |
| --- | --- | --- | --- |
| 1. Nền tảng | Envelope và mã lỗi chung, hệ thống quyền và công tắc Production, rate limit, **bộ tách token dùng chung và chuẩn hóa literal**, kho audit ghi lệnh gọi MCP | Mọi tool mới đều dựa vào đây, và không có nó thì không tool nào an toàn. Bộ tách token là nền của `classify_sql`, deny list, `estimate_impact` và `check_migration_safety` | Mọi tool, cũ và mới, trả đúng envelope. Tắt một nhóm quyền thì mọi tool của nhóm trả `PERMISSION_DENIED`. Lệnh gọi bị từ chối vẫn có bản ghi audit. Bộ test tokenizer (xem bên dưới) qua 100% |
| 2. Đọc và kiểm tra (Postgres) | `validate_sql`, `explain_plan`, `diff_schema`, `find_dependencies`, `get_table_stats`, `list_indexes`, cùng bốn nâng cấp ở mục 4 | Giá trị cao, rủi ro thấp, chưa chạm dữ liệu thật | Với bộ 20 câu SQL mẫu (10 hợp lệ, 10 sai tên bảng hoặc cột), `validate_sql` bắt đủ 10 lỗi và không báo sai câu nào. `diff_schema` giữa hai database lệch nhau 5 chỗ báo đúng 5. Log của server không có câu lệnh ghi nào. `classify_sql` xếp đúng loại và đúng "có `WHERE`" cho bộ 30 câu có subquery, CTE (kể cả CTE ghi), comment và chuỗi chứa chữ `where` |
| 3. Đo ảnh hưởng và dữ liệu | `get_data_classification`, `run_readonly_query`, `estimate_impact`, `preview_cascade`, `dry_run` (`dev` và `sta`) | Đây là các tool đầu tiên chạm dữ liệu, nên cần masking và quyền ở giai đoạn 1 đã chạy | `run_readonly_query` từ chối 100% câu ghi trong bộ test (INSERT, UPDATE, DELETE, DDL, CTE ghi, hàm trong deny list, hàm do user định nghĩa có ghi). Sau mỗi `dry_run`, đếm lại dòng cho thấy dữ liệu không đổi. Cột `credential` luôn là `***`. `estimate_impact`: trong bộ 30 câu `UPDATE` và `DELETE`, 20 câu thuộc dạng hỗ trợ cho số đếm bằng đúng `SELECT count(*)` viết tay, 10 câu ngoài dạng (CTE, join, placeholder, nhiều câu) đều bị từ chối `SQL_UNSUPPORTED` và không câu nào bị đếm sai. Bộ lọc token của `run_readonly_query` từ chối 100% câu lách bằng comment, nháy kép, tiền tố schema, chữ hoa, dollar-quote và `U&` |
| 4. Thay đổi có duyệt | `propose_change` và ba tool đi kèm, màn hình duyệt, `create_restore_point`, `list_restore_points`, `preview_rollback`, `check_migration_safety`, `generate_migration`, `get_audit_log` | Cần đủ phân tích, audit và khôi phục thì mới an toàn để cho AI đề xuất ghi | Không có đường nào thực thi khi chưa duyệt: gọi mọi tool với mọi tổ hợp tham số vẫn không thấy dữ liệu đổi. Proposal lệch ngữ cảnh trả `PROPOSAL_STALE` và không chạy câu nào. Hết TTL thì chuyển `expired` |
| 5. Các driver còn lại | SQLite, rồi MySQL, rồi SQL Server, theo bảng ở mục 9 | SQLite dễ nhất, SQL Server thiếu nhiều khả năng nhất | Mỗi driver có bảng kết quả test riêng. Mỗi ô "Một phần" trả `warnings[]` nói rõ thiếu gì, ô "Chưa" trả `UNSUPPORTED_DRIVER` |

**Việc cần kiểm chứng kỹ thuật trước khi làm**

- `validate_sql` dựa vào `PREPARE` trong transaction. Cần thử với driver Postgres Zentro đang dùng: mỗi lần một câu lệnh, hành vi lock, và lỗi trả về có đủ dòng và cột.
- Bộ test của tokenizer, chạy cho từng driver: chuỗi có nháy kép lặp, `E'\''`, dollar-quote lồng nhau, comment `/* /* */ */`, định danh có nháy chứa dấu chấm phẩy hoặc từ khóa, `$1` đứng cạnh dollar-quote, `U&"..."`, chuỗi chứa chữ `WHERE` hay `DELETE`, dấu `;` trong chuỗi. Đây là nền của mọi phân tích. Gói T1.1 đã dựng bộ này cho `AnalyzeStatementRisk`.
- Mệnh đề `WHERE` sao nguyên văn có thể chứa hàm có tác dụng phụ hoặc chạy chậm. Câu `SELECT count(*)` được dựng ra đi qua cùng bộ lọc token và transaction chỉ đọc như `run_readonly_query`, cần test với `WHERE` chứa subquery nặng để xác nhận `statement_timeout` chặn đúng.
- Danh sách mức biến động của hàm (`pg_proc.provolatile`) cho `add_column_volatile_default`: cần thử với hàm do user định nghĩa và hàm bị overload.
- Ngưỡng 10.000 và 1.000.000 dòng của `check_migration_safety` là con số đề xuất, cần chỉnh theo bảng thật của bạn.

**Khi nào nên thêm parser**

Spec này cố ý không dùng parser để bản đầu giữ được tiến độ và không kéo thêm phụ thuộc vào bản build. Cân nhắc thêm parser (cho Postgres trước) khi một trong các điều sau xảy ra:

- Tỉ lệ lời gọi `estimate_impact` hoặc `preview_cascade` bị `SQL_UNSUPPORTED` vì `has_join` hoặc `has_cte` vượt khoảng 20% trên dữ liệu audit thật.
- Cần mở rộng `check_migration_safety` ra ngoài bộ quy tắc hiện có, hoặc cần kiểm tra DDL đầy đủ ở `validate_sql`.
- Bộ lọc token của `run_readonly_query` bị lọt một ca lách thật.

Khi đó, parser thay thế bộ nhận mẫu bên trong các tool, không đổi tham số hay kết quả của tool. Mã lỗi `SQL_UNSUPPORTED` là chỗ ngắt nối: nó chỉ biến mất ở những dạng parser mới hiểu được.

**Câu hỏi cần bạn quyết**

1. Zentro đã có cơ chế ghi nhật ký nào chưa? Nếu có, nên mở rộng nó thay vì dựng kho SQLite mới như mục 8.
2. Duyệt ở `pro`: gõ lại tên environment cộng chờ 3 giây có đủ, hay sau này cần thêm người duyệt thứ hai cho team?
3. Proposal lưu cục bộ và sống qua việc đóng app cho tới khi hết TTL (giả định của spec). Giữ như vậy hay mất khi đóng project?
4. `dry_run` bị cấm cứng ở `pro` trong bản đầu. Giữ cấm hẳn, hay mở sau với điều kiện (ví dụ chỉ DML và bảng không có trigger)?
5. `CREATE INDEX CONCURRENTLY` không chạy được trong transaction, mà `propose_change` chạy cả proposal trong một transaction. Đề xuất: proposal chứa đúng một câu lệnh loại này được chạy ngoài transaction và gắn cờ `nonTransactional` trên màn hình duyệt. Đồng ý không?
6. Trên MySQL, restore point mức schema không khôi phục dữ liệu của cột hoặc bảng bị `DROP`. Có muốn bắt buộc restore point mức dữ liệu (user tạo trong app) trước mọi `DROP` và `TRUNCATE` trên MySQL không?
7. Trường `viewMode` trong `get_app_context` hiện có nghĩa gì? Nếu đó là chế độ chỉ xem, nhóm `changes` nên trả lỗi khi `viewMode` bật.
