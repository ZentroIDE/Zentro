// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
)

// computeChainHash is PrevHash concatenated with entry's own JSON (its Hash
// field blanked first, since Hash never covers itself), hashed with SHA-256.
// Both AppendMCPAudit (writing) and VerifyChain (checking) call this, so a
// record can only pass verification by having been produced the same way.
//
// encoding/json marshals a struct's fields in their declared order, which is
// what makes this deterministic -- but it also means SQLAuditEntry's field
// order is now part of the chain's contract. Reordering, renaming, or
// changing the JSON type of an existing field would make every hash written
// before that change unverifiable. Adding a new field is safe only because
// Go appends it after the ones already declared; it must go at the end of
// the struct, never inserted in the middle.
func computeChainHash(prevHash string, entry SQLAuditEntry) (string, error) {
	entry.Hash = ""
	content, err := json.Marshal(entry)
	if err != nil {
		return "", err
	}
	sum := sha256.New()
	sum.Write([]byte(prevHash))
	sum.Write(content)
	return hex.EncodeToString(sum.Sum(nil)), nil
}

// VerifyChain checks the MCP hash chain over every entry this service can
// read (the same tail window ListAudit uses). An entry with no Hash is a UI
// write, or an MCP write from before this packet; it is not part of the
// chain and is skipped, matching "UI writing stays unchanged" for this
// packet. It reports the id of the first entry that fails either check:
// its own content no longer matches its stored Hash, or its PrevHash does
// not match the Hash of the chained entry before it (a sign that a record
// was edited, inserted, or removed).
func (s *SQLAuditLogService) VerifyChain() (brokenID string, valid bool, err error) {
	s.mu.Lock()
	p, pathErr := s.auditFilePath()
	s.mu.Unlock()
	if pathErr != nil {
		return "", false, pathErr
	}

	entries := s.readAllEntriesChronological(p)

	prevHash := ""
	chainStarted := false
	for _, entry := range entries {
		if entry.Hash == "" {
			continue
		}
		if chainStarted && entry.PrevHash != prevHash {
			return entry.ID, false, nil
		}
		want, hashErr := computeChainHash(entry.PrevHash, entry)
		if hashErr != nil || want != entry.Hash {
			return entry.ID, false, nil
		}
		prevHash = entry.Hash
		chainStarted = true
	}
	return "", true, nil
}
