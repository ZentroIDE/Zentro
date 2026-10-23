// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"zentro/internal/core"
	"zentro/internal/db"
	driverport "zentro/internal/driver"
	"zentro/internal/extensions/ai"
	"zentro/internal/models"
)

var aiEstimateImpactTool = aiTool{
	spec: ai.ToolSpec{
		Name:        "estimate_impact",
		Description: "Count how many rows a single-table UPDATE or DELETE would affect, without changing any data. Joins, CTEs, and placeholders are rejected.",
		Parameters: json.RawMessage(`{"type":"object","properties":{` +
			`"env":{"type":"string","description":"An environment key, for example dev or sta. Required."},` +
			`"sql":{"type":"string","description":"Exactly one single-table UPDATE or DELETE."},` +
			`"max_count":{"type":"integer","minimum":1,"description":"Stop counting after this many rows. Defaults to 1000000."},` +
			`"sample_keys":{"type":"integer","minimum":0,"maximum":20,"description":"How many primary-key samples to return, masked. Defaults to 0."}` +
			`},"required":["env","sql"],"additionalProperties":false}`),
	},
	group:   aiGroupReadData,
	envArgs: []string{"env"},
	label:   func(json.RawMessage) string { return "Estimate write impact" },
	live:    estimateImpactTool,
}

type aiImpactClassificationDTO struct {
	Verdict string                `json:"verdict"`
	Reasons []aiClassifyReasonDTO `json:"reasons"`
}

type aiImpactDTO struct {
	Classification   aiImpactClassificationDTO `json:"classification"`
	AffectedRows     int64                     `json:"affectedRows"`
	Capped           bool                      `json:"capped"`
	TableEstRows     *int64                    `json:"tableEstRows"`
	Share            *float64                  `json:"share"`
	NoWhere          bool                      `json:"noWhere"`
	TriggersOnTarget []aiTriggerDTO            `json:"triggersOnTarget"`
	HasCascade       bool                      `json:"hasCascade"`
	KeySamples       *[][]string               `json:"keySamples,omitempty"`
}

func estimateImpactTool(ctx context.Context, s *AIService, _ ai.Catalog, args json.RawMessage) (any, error) {
	var in struct {
		Env        string `json:"env"`
		SQL        string `json:"sql"`
		MaxCount   int    `json:"max_count"`
		SampleKeys int    `json:"sample_keys"`
	}
	if err := json.Unmarshal(args, &in); err != nil || strings.TrimSpace(in.SQL) == "" {
		return nil, failTool(aiCodeInvalidArgument, "pass env and the UPDATE or DELETE to count", "")
	}
	target, shapeErr := db.ParseCountTarget("", in.SQL, false)
	if shapeErr != nil {
		return nil, shapeToToolError(shapeErr)
	}

	env, runner, dialect, schema, err := s.openReadRunner(ctx, in.Env, "")
	if err != nil {
		return nil, err
	}
	defer env.Close()
	if dialect == nil {
		return nil, failTool(aiCodeUnsupportedDriver, "this driver cannot quote identifiers", "")
	}

	catalog, err := loadCatalogForEnv(ctx, s, env, schema)
	if err != nil {
		return nil, err
	}
	table, err := matchCountTable(catalog, target)
	if err != nil {
		return nil, err
	}

	maxCount := in.MaxCount
	if maxCount <= 0 {
		maxCount = 1000000
	}
	policy := s.executionPolicy(env.Key)
	timeout := clampTimeout(15, policy)
	countSQL := buildCountSQL(dialect, schema, table, target, maxCount)
	n, err := runGuardedCount(ctx, runner, env, schema, countSQL, timeout, time.Second)
	if err != nil {
		return nil, err
	}
	capped := n > int64(maxCount)
	if capped {
		n = int64(maxCount)
	}

	classified := classifyForEnv(in.SQL, env.Driver, policy)
	out := aiImpactDTO{
		Classification:   aiImpactClassificationDTO{Verdict: classified.Verdict, Reasons: classified.Reasons},
		AffectedRows:     n,
		Capped:           capped,
		NoWhere:          target.NoWhere,
		TriggersOnTarget: []aiTriggerDTO{},
	}

	drv, _ := core.Get(env.Driver)
	if stats, ok := drv.(driverport.TableStatsReader); ok {
		if st, stErr := stats.ReadTableStats(ctx, env.DB, schema, table.Name, false); stErr == nil {
			out.TableEstRows = st.EstRows
			if st.EstRows != nil && *st.EstRows > 0 {
				share := float64(n) / float64(*st.EstRows)
				out.Share = &share
			}
		}
	}
	if details, ok := drv.(driverport.TableDetailsReader); ok {
		if det, dErr := details.ReadTableDetails(ctx, env.DB, schema, table.Name); dErr == nil {
			want := strings.ToUpper(target.Kind)
			for _, trig := range det.Triggers {
				if triggerMatches(trig.Events, want) {
					out.TriggersOnTarget = append(out.TriggersOnTarget, aiTriggerDTO{Name: trig.Name, Timing: trig.Timing, Events: trig.Events, ForEachRow: trig.ForEachRow})
				}
			}
		}
	}
	if fetcher, ok := drv.(driverport.SchemaFetcher); ok {
		if rels, rErr := fetcher.FetchTableRelationships(ctx, env.DB, schema, table.Name); rErr == nil {
			out.HasCascade = incomingCascade(rels, table.Name)
		}
	}

	var warnings []string
	if out.HasCascade {
		warnings = append(warnings, "This table has child foreign keys that cascade, set null, or set default. Call preview_cascade for those counts.")
	}

	if in.SampleKeys > 0 && !s.rowsAllowed(ctx) {
		in.SampleKeys = 0
		warnings = append(warnings, "keySamples needs Data mode and is never sent to an external agent, so none were read.")
	}
	if in.SampleKeys > 0 {
		if in.SampleKeys > aiMaxDataRows {
			in.SampleKeys = aiMaxDataRows
		}
		pks := primaryKeyNames(table)
		if len(pks) == 0 {
			var none [][]string
			out.KeySamples = &none
			warnings = append(warnings, "This table has no primary key, so keySamples is null.")
		} else {
			sampleSQL := buildKeySampleSQL(dialect, schema, table, target, pks, in.SampleKeys)
			if g := db.GuardReadOnly(env.Driver, sampleSQL); g != nil {
				return nil, guardToToolError(g)
			}
			raw, runErr := runner.RunReadOnly(ctx, env.DB, models.MCPReadOnlyQuery{
				SQL: sampleSQL, MaxRows: in.SampleKeys, Timeout: timeout, LockTimeout: time.Second, IdleTimeout: timeout, Schema: schema,
			})
			if runErr != nil {
				return nil, mapRunnerError(runErr)
			}
			masked := maskedColumnsForTable(table.Name, table.Columns)
			samples := maskRows(raw, pks, masked)
			out.KeySamples = &samples
		}
	}

	return aiEnvMetaOverride{
		Data: out, Env: env.Key, Driver: env.Driver, Database: env.Database, Schema: schema, Warnings: warnings,
	}, nil
}

func triggerMatches(events []string, kind string) bool {
	for _, ev := range events {
		if strings.EqualFold(ev, kind) {
			return true
		}
	}
	return false
}

func incomingCascade(rels []models.TableRelationship, parent string) bool {
	for _, rel := range rels {
		if !strings.EqualFold(rel.TargetTable, parent) {
			continue
		}
		switch strings.ToUpper(strings.TrimSpace(rel.OnDelete)) {
		case "CASCADE", "SET NULL", "SET DEFAULT":
			return true
		}
	}
	return false
}

func maskRows(raw models.MCPReadOnlyResult, names []string, masked map[string]bool) [][]string {
	out := make([][]string, 0, len(raw.Rows))
	for _, row := range raw.Rows {
		line := make([]string, len(names))
		for i, name := range names {
			var v any
			if i < len(row) {
				v = row[i]
			}
			line[i] = serializeCell(v, columnIsMasked(name, masked))
		}
		out = append(out, line)
	}
	return out
}
