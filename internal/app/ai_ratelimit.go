// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"sync"
	"time"
)

// Rate limiting for the MCP server (spec section 2, "Giới hạn"): 120 tool
// calls per minute across the whole server, and a tighter 10 per minute for
// the changes group alone, since that group is the only write-adjacent one.
// A fixed window, not a sliding one: a limit's count resets to zero
// aiRateLimitWindow after the first call that started its current window,
// not on a clock boundary. This is the simplest shape that satisfies the
// plan's own test ("call 121 is refused; once the window ends, calls work
// again") and needs no background sweep.
const (
	aiRateLimitWindow  = time.Minute
	aiRateLimitGlobal  = 120
	aiRateLimitChanges = 10
)

// aiRateLimiter is one server's limiter: the global window plus the changes
// window. The clock is a field, not time.Now directly, so a test can move it
// without sleeping.
type aiRateLimiter struct {
	mu      sync.Mutex
	now     func() time.Time
	all     rateWindow
	changes rateWindow
}

type rateWindow struct {
	start time.Time
	count int
}

func newAIRateLimiter() *aiRateLimiter {
	return &aiRateLimiter{now: time.Now}
}

// fits reports whether one more call is allowed in this window right now. It
// rolls the window over first when the time since its start has reached
// aiRateLimitWindow; a check alone never counts as a call. On false,
// retryAfter is the whole seconds left before the window rolls over, never
// less than one.
func (w *rateWindow) fits(now time.Time, limit int) (ok bool, retryAfter int) {
	if w.start.IsZero() || now.Sub(w.start) >= aiRateLimitWindow {
		w.start = now
		w.count = 0
	}
	if w.count < limit {
		return true, 0
	}
	left := aiRateLimitWindow - now.Sub(w.start)
	secs := int(left / time.Second)
	if left%time.Second > 0 {
		secs++
	}
	if secs < 1 {
		secs = 1
	}
	return false, secs
}

func (w *rateWindow) record() { w.count++ }

// allow checks the global window, and the changes window too when group is
// aiGroupChanges, then records the call in whichever windows it passed.
// scope names which window refused the call ("mcp" or "changes"), empty when
// allowed.
func (l *aiRateLimiter) allow(group aiPermissionGroup) (ok bool, scope string, retryAfter int) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()

	if fits, retry := l.all.fits(now, aiRateLimitGlobal); !fits {
		return false, "mcp", retry
	}
	if group == aiGroupChanges {
		if fits, retry := l.changes.fits(now, aiRateLimitChanges); !fits {
			return false, "changes", retry
		}
	}
	l.all.record()
	if group == aiGroupChanges {
		l.changes.record()
	}
	return true, "", 0
}

// mcpLimiter returns this service's MCP rate limiter, creating it on first
// use. A test that calls callMCPTool directly, without StartMCPServer, still
// gets a working (if freshly empty) limiter instead of a nil one.
func (s *AIService) mcpLimiter() *aiRateLimiter {
	s.mcp.mu.Lock()
	defer s.mcp.mu.Unlock()
	if s.mcp.limiter == nil {
		s.mcp.limiter = newAIRateLimiter()
	}
	return s.mcp.limiter
}

// rateLimitMessage names which ceiling refused the call.
func rateLimitMessage(scope string) string {
	if scope == "changes" {
		return "too many calls that propose a change this minute"
	}
	return "too many calls to the MCP server this minute"
}
