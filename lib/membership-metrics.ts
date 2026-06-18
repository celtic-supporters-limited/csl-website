// Single source of truth for membership metrics computation.
// Used by: CSV upload API route, cron snapshot route, and the reporting dashboard.

// ── Plan name recognition ─────────────────────────────────────────────────────

const KNOWN_PLAN_PATTERNS: RegExp[] = [
  /^Monthly \d+$/,          // new platform: Monthly 10, Monthly 25, Monthly 30, etc.
  /^Annual \d+$/,            // new platform: Annual 300, Annual 600, etc.
  /^Lifetime Member$/,       // new platform
  /^PWYW Monthly$/,          // WordPress legacy
  /^PWYW - Annual$/,         // WordPress legacy
  /^PWYW$/,                  // WordPress legacy (bare)
  /^Monthly 20$/,            // WordPress legacy
  /^Lifetime Membership$/,   // WordPress legacy
];

export const LIFETIME_PLAN_NAMES = new Set([
  "Lifetime Member",
  "Lifetime Membership",
]);

export const MEMBERSHIP_TARGET = 5000;

export function isKnownPlan(name: string): boolean {
  return KNOWN_PLAN_PATTERNS.some((r) => r.test(name));
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type SourceMetrics = {
  active: number;
  payment_failed: number;
  cancelled: number;
  expired: number;
  pending: number;
  spam: number;                // WordPress-only: accounts with bot-pattern names, excluded from all other counts
  other: number;
  by_plan: Record<string, number>;
  mrr_pence: number;           // excludes lifetime members; annual amounts divided by 12
  unknown_plans: string[];     // plan names not matching KNOWN_PLAN_PATTERNS
};

export type MigrationMetrics = {
  migrated: number;                // Supabase row + stripe_subscription_id present
  migration_in_progress: number;   // Supabase row, no stripe_subscription_id
  not_yet_migrated: number;        // WordPress-only (legacy, de-duped)
  total: number;
};

export type DataQualityFlags = {
  payment_failed_count: number;
  no_auth_account_count: number;  // members with user_id IS NULL
  wp_pending_count: number;       // WordPress pending rows (never completed payment — real people only)
  wp_spam_count: number;          // WordPress bot/spam accounts (excluded from all other counts)
  unknown_plan_count: number;
};

export type MembershipSnapshot = {
  supabase: SourceMetrics;
  wordpress_legacy: SourceMetrics | null;
  combined: {
    active_total: number;
    target: number;
    progress_pct: number;
  };
  migration: MigrationMetrics | null;
  data_quality: DataQualityFlags;
  wp_as_of_date: string | null;
  stripe: {
    total_collected_pence: number;
    earliest_charge_date: string | null;
  } | null;
};

// ── Supabase metrics ──────────────────────────────────────────────────────────

export type SupabaseMemberRow = {
  email: string;
  status: string | null;
  plan_name: string | null;
  amount_pence: number | null;
  membership_tier: string | null;
  stripe_subscription_id: string | null;
  user_id: string | null;
};

export function computeSupabaseMetrics(rows: SupabaseMemberRow[]): {
  metrics: SourceMetrics;
  migration: Omit<MigrationMetrics, "not_yet_migrated" | "total">;
  dataQuality: Pick<DataQualityFlags, "payment_failed_count" | "no_auth_account_count">;
} {
  const metrics: SourceMetrics = {
    active: 0, payment_failed: 0, cancelled: 0, expired: 0, pending: 0, spam: 0, other: 0,
    by_plan: {}, mrr_pence: 0, unknown_plans: [],
  };
  let migrated = 0;
  let migrationInProgress = 0;
  let noAuth = 0;

  for (const row of rows) {
    const s = (row.status ?? "").toLowerCase();

    if (s === "active" || s === "trialing")              metrics.active++;
    else if (s === "payment_failed" || s === "past_due") metrics.payment_failed++;
    else if (s === "cancelled" || s === "canceled")      metrics.cancelled++;
    else if (s === "expired")                            metrics.expired++;
    else if (s === "pending" || s === "incomplete")      metrics.pending++;
    else                                                 metrics.other++;

    // Only count plan breakdown and MRR for active members
    if (s === "active" || s === "trialing") {
      const plan = row.plan_name ?? "Unknown";
      metrics.by_plan[plan] = (metrics.by_plan[plan] ?? 0) + 1;
      if (!isKnownPlan(plan) && !metrics.unknown_plans.includes(plan)) {
        metrics.unknown_plans.push(plan);
      }
    }

    if ((s === "active" || s === "trialing") && !LIFETIME_PLAN_NAMES.has(row.plan_name ?? "Unknown")) {
      const tier = row.membership_tier ?? "";
      const amountPence = row.amount_pence ?? 0;
      metrics.mrr_pence += tier === "annual"
        ? Math.round(amountPence / 12)
        : amountPence;
    }

    if (row.stripe_subscription_id) migrated++;
    else migrationInProgress++;

    if (!row.user_id) noAuth++;
  }

  return {
    metrics,
    migration: { migrated, migration_in_progress: migrationInProgress },
    dataQuality: {
      payment_failed_count: metrics.payment_failed,
      no_auth_account_count: noAuth,
    },
  };
}

// ── WordPress CSV parsing ─────────────────────────────────────────────────────

// Bot accounts registered via automated scripts have randomised 8-12 lowercase-alpha
// strings as both first and last names. Real members always have normal-cased names
// with at least some non-alpha characters or mixed case, or names shorter than 8 chars.
function isGibberishName(first: string, last: string): boolean {
  const gibberish = (s: string) => /^[a-z]{8,12}$/.test(s);
  return gibberish(first) && gibberish(last);
}

export type WordPressRow = {
  email: string;
  status: string;
  plan_name: string;
  billing_amount: number;
  billing_unit: string;  // 'month' | 'year'
  is_spam: boolean;
};

function parseCsvRow(line: string): string[] {
  const cols: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      cols.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cols.push(current);
  return cols;
}

export function parseWordPressCsv(csvText: string): WordPressRow[] {
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const header = parseCsvRow(lines[0]);
  const idx = (col: string) => header.indexOf(col);

  const emailIdx     = idx("user_email");
  const statusIdx    = idx("subscription_status");
  const nameIdx      = idx("subscription_name");
  const amountIdx    = idx("subscription_billing_amount");
  const unitIdx      = idx("subscription_billing_duration_unit");
  const firstNameIdx = idx("user_firstname");
  const lastNameIdx  = idx("user_lastname");

  if (emailIdx === -1 || statusIdx === -1) return [];

  return lines.slice(1).flatMap((line) => {
    const cols = parseCsvRow(line);
    const email = (cols[emailIdx] ?? "").toLowerCase().trim();
    if (!email) return [];
    const firstName = (cols[firstNameIdx] ?? "").trim();
    const lastName  = (cols[lastNameIdx]  ?? "").trim();
    return [{
      email,
      status:         (cols[statusIdx] ?? "").toLowerCase().trim(),
      plan_name:      cols[nameIdx]   ?? "Unknown",
      billing_amount: parseFloat(cols[amountIdx] ?? "0") || 0,
      billing_unit:   (cols[unitIdx]  ?? "month").toLowerCase(),
      is_spam:        isGibberishName(firstName, lastName),
    }];
  });
}

// ── WordPress aggregate computation ──────────────────────────────────────────

export function computeWordPressMetrics(
  rows: WordPressRow[],
  supabaseEmails: Set<string>,
): { metrics: SourceMetrics; wpPendingCount: number; legacyCount: number; spamCount: number } {
  const metrics: SourceMetrics = {
    active: 0, payment_failed: 0, cancelled: 0, expired: 0, pending: 0, spam: 0, other: 0,
    by_plan: {}, mrr_pence: 0, unknown_plans: [],
  };
  let wpPendingCount = 0;

  // De-dup: skip emails already in Supabase — migrated members take precedence
  const legacyRows = rows.filter((r) => !supabaseEmails.has(r.email));

  for (const row of legacyRows) {
    // Spam accounts are counted separately and excluded from all meaningful metrics
    if (row.is_spam) {
      metrics.spam++;
      continue;
    }

    const s = row.status;
    if (s === "active" || s === "expiring")         metrics.active++;   // expiring = cancelled renewal but still within paid period
    else if (s === "canceled" || s === "cancelled") metrics.cancelled++;
    else if (s === "expired")                       metrics.expired++;
    else if (s === "pending") { metrics.pending++; wpPendingCount++; }
    else                                            metrics.other++;

    // Only count plan breakdown and MRR for active members (including expiring)
    if (s === "active" || s === "expiring") {
      const plan = row.plan_name;
      metrics.by_plan[plan] = (metrics.by_plan[plan] ?? 0) + 1;
      if (!isKnownPlan(plan) && !metrics.unknown_plans.includes(plan)) {
        metrics.unknown_plans.push(plan);
      }
    }

    if ((s === "active" || s === "expiring") && !LIFETIME_PLAN_NAMES.has(row.plan_name)) {
      const amountPence = Math.round(row.billing_amount * 100);
      metrics.mrr_pence += row.billing_unit === "year"
        ? Math.round(amountPence / 12)
        : amountPence;
    }
  }

  // Spam rows are in legacyRows but excluded from all meaningful counts — subtract them
  return { metrics, wpPendingCount, legacyCount: legacyRows.length - metrics.spam, spamCount: metrics.spam };
}

// ── Combine into a full snapshot ──────────────────────────────────────────────

export function buildSnapshot({
  supabaseRows,
  wpRows,
  supabaseEmails,
  wpAsOfDate,
  stripeData = null,
}: {
  supabaseRows: SupabaseMemberRow[];
  wpRows: WordPressRow[] | null;
  supabaseEmails: Set<string>;
  wpAsOfDate: string | null;
  stripeData?: { total_collected_pence: number; earliest_charge_date: string | null } | null;
}): MembershipSnapshot {
  const { metrics: sbMetrics, migration, dataQuality } = computeSupabaseMetrics(supabaseRows);

  let wpMetrics: SourceMetrics | null = null;
  let wpPendingCount = 0;
  let legacyCount = 0;

  let spamCount = 0;
  if (wpRows) {
    const wp = computeWordPressMetrics(wpRows, supabaseEmails);
    wpMetrics      = wp.metrics;
    wpPendingCount = wp.wpPendingCount;
    legacyCount    = wp.legacyCount;
    spamCount      = wp.spamCount;
  }

  const activeCombined = sbMetrics.active + (wpMetrics?.active ?? 0);
  const unknownPlanCount =
    sbMetrics.unknown_plans.length + (wpMetrics?.unknown_plans.length ?? 0);

  return {
    supabase: sbMetrics,
    wordpress_legacy: wpMetrics,
    combined: {
      active_total: activeCombined,
      target: MEMBERSHIP_TARGET,
      progress_pct: Math.round((activeCombined / MEMBERSHIP_TARGET) * 1000) / 10,
    },
    migration: {
      ...migration,
      not_yet_migrated: legacyCount,
      total: migration.migrated + migration.migration_in_progress + legacyCount,
    },
    data_quality: {
      ...dataQuality,
      wp_pending_count: wpPendingCount,
      wp_spam_count: spamCount,
      unknown_plan_count: unknownPlanCount,
    },
    wp_as_of_date: wpAsOfDate,
    stripe: stripeData,
  };
}
