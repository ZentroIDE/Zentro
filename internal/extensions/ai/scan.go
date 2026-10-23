// SPDX-License-Identifier: GPL-3.0-only

package ai

import (
	"encoding/json"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

// Match is one sensitive shape found before a request leaves the machine.
// Sample is masked. Where and Context are set by ScanSource only: which part
// of the request held it, and the text around it, so the person can see on
// their own screen what was found and decide. Neither ever leaves the machine.
type Match struct {
	Type    string `json:"type"`
	Sample  string `json:"sample"`
	Where   string `json:"where,omitempty"`
	Context string `json:"context,omitempty"`
}

// ScanText finds email, phone, card, JWT, and credential shapes.
// It does not decide that a value is public. Callers hold the send.
func ScanText(text string) []Match {
	return scanWith(text, "")
}

// ScanSource scans one named part of a request ("your message", "earlier
// messages in this chat", ...) and adds that name and the text around each
// match, for the hold notice.
func ScanSource(text, where string) []Match {
	return scanWith(text, where)
}

// matchContext is how many bytes of text are kept on each side of a match.
const matchContext = 40

func scanWith(text, where string) []Match {
	if strings.TrimSpace(text) == "" {
		return nil
	}
	var out []Match
	seen := map[string]struct{}{}
	add := func(kind, raw string) {
		sample := maskSample(raw)
		key := kind + "\x00" + sample
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		match := Match{Type: kind, Sample: sample}
		if where != "" {
			match.Where = where
			match.Context = contextAround(text, raw)
		}
		out = append(out, match)
	}
	scanPattern(text, add, "email", isEmailStart)
	scanPhones(text, add)
	scanJWTs(text, add)
	scanCards(text, add)
	scanCredentials(text, add)
	return out
}

// ScanJSONStrings finds the same shapes as ScanText, but only inside JSON
// string values -- never a key, a number, a bool, or null. A tool's envelope
// commonly carries numbers (estRows, totalBytes, elapsedMs) and digit-only
// hashes that read as a phone number or a card to ScanText, which scans raw
// text without knowing which parts are structure; walking the parsed value
// and visiting only strings avoids that, while still catching a sensitive
// shape genuinely written out as text in a string value.
//
// raw that is not valid JSON returns nil: treating it as one big string
// would bring back the exact problem this function exists to avoid.
func ScanJSONStrings(raw []byte) []Match {
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil
	}
	var out []Match
	seen := map[string]struct{}{}
	walkJSONStrings(value, func(s string) {
		for _, m := range ScanText(s) {
			key := m.Type + "\x00" + m.Sample
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			out = append(out, m)
		}
	})
	return out
}

// walkJSONStrings visits every string value in a tree decoded by
// encoding/json into any (map[string]any, []any, string, float64, bool, or
// nil). Map keys are never visited: a field named "password" describes
// shape, not a leaked secret by itself.
func walkJSONStrings(value any, visit func(string)) {
	switch v := value.(type) {
	case string:
		visit(v)
	case map[string]any:
		for _, item := range v {
			walkJSONStrings(item, visit)
		}
	case []any:
		for _, item := range v {
			walkJSONStrings(item, visit)
		}
	}
}

func maskSample(value string) string {
	trimmed := strings.TrimSpace(value)
	if len(trimmed) <= 6 {
		return "[redacted]"
	}
	return trimmed[:3] + "..." + trimmed[len(trimmed)-2:]
}

func scanPattern(text string, add func(string, string), kind string, start func(string, int) int) {
	for i := 0; i < len(text); {
		n := start(text, i)
		if n <= 0 {
			i++
			continue
		}
		add(kind, text[i:i+n])
		i += n
	}
}

func isEmailStart(text string, i int) int {
	if i > 0 && isIdent(rune(text[i-1])) {
		return 0
	}
	at := strings.IndexByte(text[i:], '@')
	if at <= 0 {
		return 0
	}
	local := text[i : i+at]
	if strings.ContainsAny(local, " \t\r\n") {
		return 0
	}
	rest := text[i+at+1:]
	dot := strings.IndexByte(rest, '.')
	if dot <= 0 {
		return 0
	}
	end := i + at + 1 + dot + 1
	for end < len(text) && isIdent(rune(text[end])) {
		end++
	}
	if end-(i+at+1+dot+1) < 2 {
		return 0
	}
	return end - i
}

func scanPhones(text string, add func(string, string)) {
	i := 0
	for i < len(text) {
		if text[i] != '+' && (text[i] < '0' || text[i] > '9') {
			i++
			continue
		}
		if i > 0 && isIdent(rune(text[i-1])) {
			i++
			continue
		}
		j := i
		digits := 0
		end := i
		for j < len(text) {
			r := rune(text[j])
			if unicode.IsDigit(r) {
				digits++
				j++
				end = j
				continue
			}
			if r == ' ' || r == '-' || r == '(' || r == ')' || r == '.' {
				j++
				continue
			}
			break
		}
		if digits >= 8 && digits <= 15 && end > i && (end == len(text) || !isIdent(rune(text[end]))) && !looksLikeAmountOrDate(text[i:end]) {
			add("phone", text[i:end])
			i = end
			continue
		}
		i++
	}
}

func scanJWTs(text string, add func(string, string)) {
	const prefix = "eyJ"
	from := 0
	for {
		idx := strings.Index(text[from:], prefix)
		if idx < 0 {
			return
		}
		at := from + idx
		parts := 0
		j := at
		for parts < 3 && j < len(text) {
			k := j
			for k < len(text) && isJWTChar(text[k]) {
				k++
			}
			if k == j {
				break
			}
			parts++
			j = k
			if parts < 3 {
				if j >= len(text) || text[j] != '.' {
					break
				}
				j++
			}
		}
		if parts == 3 {
			add("jwt", text[at:j])
			from = j
			continue
		}
		from = at + len(prefix)
	}
}

func isJWTChar(b byte) bool {
	return (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z') || (b >= '0' && b <= '9') || b == '_' || b == '-'
}

func scanCards(text string, add func(string, string)) {
	i := 0
	for i < len(text) {
		if text[i] < '0' || text[i] > '9' || (i > 0 && isIdent(rune(text[i-1]))) {
			i++
			continue
		}
		j := i
		digits := make([]int, 0, 19)
		for j < len(text) {
			if text[j] >= '0' && text[j] <= '9' {
				digits = append(digits, int(text[j]-'0'))
				j++
				continue
			}
			if text[j] == ' ' || text[j] == '-' {
				j++
				continue
			}
			break
		}
		if len(digits) >= 13 && len(digits) <= 19 && luhn(digits) {
			add("credit_card", text[i:j])
			i = j
			continue
		}
		i++
	}
}

func luhn(digits []int) bool {
	sum := 0
	double := false
	for i := len(digits) - 1; i >= 0; i-- {
		d := digits[i]
		if double {
			d *= 2
			if d > 9 {
				d -= 9
			}
		}
		sum += d
		double = !double
	}
	return sum%10 == 0
}

func scanCredentials(text string, add func(string, string)) {
	lower := strings.ToLower(text)
	from := 0
	for {
		pwd := keywordAt(lower, from, "password")
		short := keywordAt(lower, from, "pwd")
		at := pwd
		word := "password"
		if short >= 0 && (at < 0 || short < at) {
			at = short
			word = "pwd"
		}
		if at < 0 {
			break
		}
		j := at + len(word)
		for j < len(text) && unicode.IsSpace(rune(text[j])) {
			j++
		}
		if j >= len(text) || text[j] != '=' {
			from = at + len(word)
			continue
		}
		end := skipSecretToken(text, j+1)
		add("credential", text[at:end])
		from = end
	}
	from = 0
	lower = strings.ToLower(text)
	for {
		scheme := strings.Index(lower[from:], "://")
		if scheme < 0 {
			return
		}
		at := from + scheme
		rest := text[at+3:]
		colon := strings.IndexByte(rest, ':')
		atSign := strings.IndexByte(rest, '@')
		if colon >= 0 && atSign > colon {
			start := at
			for start > 0 && isSchemeChar(text[start-1]) {
				start--
			}
			add("connection_string", text[start:at+3+atSign+1])
		}
		from = at + 3
	}
}

// contextAround returns raw with up to matchContext bytes on each side, on one
// line, with an ellipsis where it was cut.
func contextAround(text, raw string) string {
	at := strings.Index(text, raw)
	if at < 0 {
		return raw
	}
	start, end := at-matchContext, at+len(raw)+matchContext
	prefix, suffix := "…", "…"
	if start <= 0 {
		start, prefix = 0, ""
	}
	if end >= len(text) {
		end, suffix = len(text), ""
	}
	for start > 0 && !utf8.RuneStart(text[start]) {
		start--
	}
	for end < len(text) && !utf8.RuneStart(text[end]) {
		end++
	}
	return prefix + strings.Join(strings.Fields(text[start:end]), " ") + suffix
}

// looksLikeAmountOrDate reports a number run that is a decimal number
// (47911.699999, 1 234 567.99) or a date (2026-10-14, 14.10.2026), which the phone scan
// would otherwise read as a phone number because of its digit count.
func looksLikeAmountOrDate(run string) bool {
	run = strings.TrimSpace(run)
	// One dot and nothing else between the digits is a decimal number, such
	// as a float sum 47911.699999; a phone with dots uses more than one.
	if strings.Count(run, ".") == 1 && !strings.ContainsAny(run, " -()") {
		return true
	}
	if dot := strings.LastIndexByte(run, '.'); dot >= 0 && strings.Count(run, ".") == 1 {
		if tail := run[dot+1:]; len(tail) >= 1 && len(tail) <= 2 && allDigits(tail) {
			return true
		}
	}
	return isoDate.MatchString(run) || dottedDate.MatchString(run)
}

var (
	isoDate    = regexp.MustCompile(`^[0-9]{4}-[0-9]{2}-[0-9]{2}`)
	dottedDate = regexp.MustCompile(`^[0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{4}$`)
)

func allDigits(s string) bool {
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return s != ""
}
