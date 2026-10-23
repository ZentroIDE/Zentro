// SPDX-License-Identifier: GPL-3.0-only

// Mirrors internal/extensions/querystat's StatFilter/StatReport JSON shape by
// hand instead of importing `querystat.*` from the generated
// wailsjs/go/models — that whole namespace only exists in a build with
// GetQueryStats bound (internal/app/pro_querystat_facade.go), which a build
// exported without that file (ADR 0019, #130) won't generate at all.
export interface QueryStatFilter {
    profile: string;
    driver: string;
    window_mins: number;
    limit: number;
}

export interface QueryPattern {
    normalized_sql: string;
    exec_count: number;
    error_count: number;
    avg_ms: number;
    p95_ms: number;
    max_ms: number;
    total_ms: number;
    last_duration_ms: number;
    last_seen_at: string;
}

export interface HourlyBucket {
    hour: string;
    count: number;
    error_count: number;
    avg_ms: number;
}

export interface QueryStatReport {
    total_execs: number;
    error_rate: number;
    avg_duration_ms: number;
    p95_duration_ms: number;
    top_impact: QueryPattern[];
    top_frequent: QueryPattern[];
    hourly_buckets: HourlyBucket[];
    profile_name: string;
    window_mins: number;
}

export interface QueryStatsAdapter {
    getQueryStats?(filter: QueryStatFilter): Promise<QueryStatReport>;
}
