// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"encoding/json"
	"strconv"
	"strings"
	"testing"
	"time"
)

// fakeClock lets a test move the limiter's clock without sleeping.
type fakeClock struct{ t time.Time }

func (c *fakeClock) now() time.Time          { return c.t }
func (c *fakeClock) advance(d time.Duration) { c.t = c.t.Add(d) }

func newLimiterWithClock(t *testing.T) (*aiRateLimiter, *fakeClock) {
	t.Helper()
	clock := &fakeClock{t: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)}
	limiter := newAIRateLimiter()
	limiter.now = clock.now
	return limiter, clock
}

func TestRateLimiterAllowsUpToTheGlobalLimitThenRefusesCall121(t *testing.T) {
	limiter, _ := newLimiterWithClock(t)
	for i := 1; i <= aiRateLimitGlobal; i++ {
		if ok, scope, _ := limiter.allow(aiGroupMetadata); !ok {
			t.Fatalf("call %d was refused (scope %q), want allowed", i, scope)
		}
	}
	ok, scope, retryAfter := limiter.allow(aiGroupMetadata)
	if ok || scope != "mcp" {
		t.Fatalf("call %d: got ok=%v scope=%q, want refused by the mcp ceiling", aiRateLimitGlobal+1, ok, scope)
	}
	if retryAfter < 1 || retryAfter > 60 {
		t.Fatalf("retryAfter out of range: %d", retryAfter)
	}
}

func TestRateLimiterResetsOnceTheWindowEnds(t *testing.T) {
	limiter, clock := newLimiterWithClock(t)
	for i := 0; i < aiRateLimitGlobal; i++ {
		if ok, _, _ := limiter.allow(aiGroupMetadata); !ok {
			t.Fatalf("call %d was refused before the window was full", i)
		}
	}
	if ok, _, _ := limiter.allow(aiGroupMetadata); ok {
		t.Fatal("the limit did not refuse the extra call")
	}
	clock.advance(aiRateLimitWindow - time.Second)
	if ok, _, _ := limiter.allow(aiGroupMetadata); ok {
		t.Fatal("a call just inside the old window was allowed")
	}
	clock.advance(2 * time.Second)
	if ok, _, _ := limiter.allow(aiGroupMetadata); !ok {
		t.Fatal("a call after the window ended was still refused")
	}
}

func TestRateLimiterLimitsChangesSeparatelyAndTighter(t *testing.T) {
	limiter, _ := newLimiterWithClock(t)
	for i := 1; i <= aiRateLimitChanges; i++ {
		if ok, scope, _ := limiter.allow(aiGroupChanges); !ok {
			t.Fatalf("changes call %d was refused (scope %q)", i, scope)
		}
	}
	ok, scope, _ := limiter.allow(aiGroupChanges)
	if ok || scope != "changes" {
		t.Fatalf("changes call %d: got ok=%v scope=%q, want refused by the changes ceiling", aiRateLimitChanges+1, ok, scope)
	}
	// The global ceiling (120) is nowhere close, so a non-changes tool still
	// runs; changes and the rest of the agent are not the same budget only in
	// the sense that changes has its own tighter ceiling on top.
	if ok, _, _ := limiter.allow(aiGroupMetadata); !ok {
		t.Fatal("a metadata call was refused while changes alone was over its own limit")
	}
}

func TestRateLimiterChangesCallsAlsoCountTowardTheGlobalCeiling(t *testing.T) {
	limiter, _ := newLimiterWithClock(t)
	for i := 0; i < aiRateLimitChanges; i++ {
		if ok, _, _ := limiter.allow(aiGroupChanges); !ok {
			t.Fatalf("changes call %d was refused", i)
		}
	}
	// 10 changes calls spent; 110 more metadata calls reach the global 120.
	for i := 0; i < aiRateLimitGlobal-aiRateLimitChanges; i++ {
		if ok, _, _ := limiter.allow(aiGroupMetadata); !ok {
			t.Fatalf("metadata call %d was refused before the global ceiling", i)
		}
	}
	if ok, scope, _ := limiter.allow(aiGroupMetadata); ok || scope != "mcp" {
		t.Fatalf("the 121st call overall was not refused by the global ceiling: ok=%v scope=%q", ok, scope)
	}
}

func TestMcpLimiterIsLazyAndSharedAcrossCalls(t *testing.T) {
	svc := toolService(t, "http://127.0.0.1:1")
	first := svc.mcpLimiter()
	second := svc.mcpLimiter()
	if first != second {
		t.Fatal("mcpLimiter made a new limiter on the second call")
	}
}

func TestMCPRefusesTheHundredTwentyFirstCallWithARetryableEnvelope(t *testing.T) {
	svc, status := startTestMCP(t, "dev")
	clock := &fakeClock{t: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)}
	svc.mcpLimiter().now = clock.now

	call := func(id int) (int, mcpReply) {
		body := `{"jsonrpc":"2.0","id":` + strconv.Itoa(id) + `,"method":"tools/call","params":{"name":"classify_sql","arguments":{"sql":"select 1"}}}`
		return callMCP(t, status, "test-token", body, nil)
	}
	for i := 1; i <= aiRateLimitGlobal; i++ {
		if _, reply := call(i); strings.Contains(string(reply.Result), `"isError":true`) {
			t.Fatalf("call %d was refused: %s", i, reply.Result)
		}
	}
	_, reply := call(aiRateLimitGlobal + 1)
	var out mcpToolResult
	if err := json.Unmarshal(reply.Result, &out); err != nil {
		t.Fatal(err)
	}
	if !out.IsError {
		t.Fatalf("call %d was not refused: %+v", aiRateLimitGlobal+1, out)
	}
	env := decodeEnvelope(t, out.Content[0].Text)
	if env.Error == nil || env.Error.Code != aiCodeRateLimited || !env.Error.Retryable {
		t.Fatalf("the refusal is not a retryable RATE_LIMITED envelope: %s", out.Content[0].Text)
	}
	if !strings.Contains(env.Error.Hint, "seconds") {
		t.Fatalf("the hint does not name a wait time: %q", env.Error.Hint)
	}
}
