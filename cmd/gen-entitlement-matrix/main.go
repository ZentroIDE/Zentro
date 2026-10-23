// Command gen-entitlement-matrix prints the registered license features as
// JSON, sorted by ID. scripts/gen-entitlement-matrix.mjs turns that into the
// frontend's entitlementMatrix.ts, so the Go registry stays the only place a
// feature is declared.
package main

import (
	"encoding/json"
	"os"
	"sort"

	"zentro/internal/extensions/license"
)

type feature struct {
	ID      string `json:"id"`
	MinTier string `json:"minTier"`
}

func main() {
	defs := license.RegisteredFeatures()
	out := make([]feature, 0, len(defs))
	for _, def := range defs {
		out = append(out, feature{ID: string(def.ID), MinTier: string(def.MinTier)})
	}
	// Registration order depends on init() order across packages; sorting
	// keeps the generated file identical however features are registered.
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })

	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	if err := enc.Encode(out); err != nil {
		os.Stderr.WriteString(err.Error() + "\n")
		os.Exit(1)
	}
}
