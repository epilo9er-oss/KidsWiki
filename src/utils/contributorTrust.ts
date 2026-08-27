export const CONTRIBUTOR_TRUST_POLICY = Object.freeze({
    minApprovedEdits: 3,
    minDistinctDocuments: 2,
    minDistinctContributionDays: 3,
    minApprovalRate: 0.8,
    problematicWindowDays: 90,
    problematicEventsForDemotion: 2,
    repromotionCooldownDays: 30,
});

export type ContributorTrustStatus = 'standard' | 'trusted';
export type ContributorTrustMode = 'auto' | 'trusted' | 'standard';
export type ContributorTrustEventType = 'approved' | 'rejected' | 'problematic' | 'severe';
export type ContributorTrustTransition = 'promoted' | 'demoted' | null;

export interface ContributorTrustMetrics {
    approved: number;
    rejected: number;
    distinctDocuments: number;
    distinctContributionDays: number;
    problematicRecent: number;
    severeRecent: number;
}

interface ContributorTrustRow {
    status: ContributorTrustStatus;
    mode: ContributorTrustMode;
    cycle_started_at: number;
    cooldown_until: number;
    trusted_since: number | null;
}

export interface ContributorTrustSummary {
    status: ContributorTrustStatus;
    mode: ContributorTrustMode;
    trusted: boolean;
    trusted_since: number | null;
    cycle_started_at: number;
    cooldown_until: number;
    approved: number;
    rejected: number;
    distinct_documents: number;
    distinct_contribution_days: number;
    approval_rate: number;
    problematic_recent: number;
    policy: typeof CONTRIBUTOR_TRUST_POLICY;
}

export interface ContributorTrustUpdate {
    summary: ContributorTrustSummary;
    transition: ContributorTrustTransition;
}

const DAY_SECONDS = 86400;

export function contributorTrustApprovalRate(metrics: ContributorTrustMetrics): number {
    const decisions = metrics.approved + metrics.rejected;
    return decisions > 0 ? metrics.approved / decisions : 0;
}

export function qualifiesForTrustedContributor(metrics: ContributorTrustMetrics): boolean {
    return metrics.approved >= CONTRIBUTOR_TRUST_POLICY.minApprovedEdits
        && metrics.distinctDocuments >= CONTRIBUTOR_TRUST_POLICY.minDistinctDocuments
        && metrics.distinctContributionDays >= CONTRIBUTOR_TRUST_POLICY.minDistinctContributionDays
        && contributorTrustApprovalRate(metrics) >= CONTRIBUTOR_TRUST_POLICY.minApprovalRate;
}

/** 자동 모드의 다음 상태를 계산한다. I/O가 없는 정책 함수라 테스트의 단일 표면으로 쓴다. */
export function evaluateContributorTrust(args: {
    currentStatus: ContributorTrustStatus;
    mode: ContributorTrustMode;
    cooldownUntil: number;
    metrics: ContributorTrustMetrics;
    now: number;
}): ContributorTrustStatus {
    if (args.mode === 'trusted') return 'trusted';
    if (args.mode === 'standard') return 'standard';

    if (args.metrics.severeRecent > 0
        || args.metrics.problematicRecent >= CONTRIBUTOR_TRUST_POLICY.problematicEventsForDemotion) {
        return 'standard';
    }

    if (args.currentStatus === 'trusted') {
        return 'trusted';
    }

    if (args.now < args.cooldownUntil) return 'standard';
    return qualifiesForTrustedContributor(args.metrics) ? 'trusted' : 'standard';
}

let schemaReady = false;
let schemaInflight: Promise<void> | null = null;

export function resetContributorTrustSchemaCacheForTests() {
    schemaReady = false;
    schemaInflight = null;
}

export async function ensureContributorTrustSchema(db: D1Database): Promise<void> {
    if (schemaReady) return;
    if (schemaInflight) return schemaInflight;
    schemaInflight = db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS contributor_trust (
            user_id TEXT NOT NULL PRIMARY KEY,
            status TEXT NOT NULL DEFAULT 'standard' CHECK(status IN ('standard', 'trusted')),
            mode TEXT NOT NULL DEFAULT 'auto' CHECK(mode IN ('auto', 'trusted', 'standard')),
            cycle_started_at INTEGER NOT NULL DEFAULT 0,
            cooldown_until INTEGER NOT NULL DEFAULT 0,
            trusted_since INTEGER,
            updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS contributor_trust_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            event_type TEXT NOT NULL CHECK(event_type IN ('approved', 'rejected', 'problematic', 'severe')),
            source_type TEXT NOT NULL,
            source_id TEXT NOT NULL,
            document_key TEXT,
            actor_id TEXT,
            reason TEXT,
            created_at INTEGER NOT NULL DEFAULT (unixepoch()),
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(user_id, event_type, source_type, source_id)
        )`),
        db.prepare('CREATE INDEX IF NOT EXISTS idx_contributor_trust_events_user_created ON contributor_trust_events(user_id, created_at DESC)'),
    ]).then(() => {
        schemaReady = true;
    }).catch((error) => {
        schemaInflight = null;
        throw error;
    }).finally(() => {
        schemaInflight = null;
    });
    return schemaInflight;
}

function defaultTrustRow(): ContributorTrustRow {
    return {
        status: 'standard',
        mode: 'auto',
        cycle_started_at: 0,
        cooldown_until: 0,
        trusted_since: null,
    };
}

async function ensureTrustRow(db: D1Database, userId: string): Promise<void> {
    await db.prepare('INSERT OR IGNORE INTO contributor_trust (user_id) VALUES (?)').bind(userId).run();
}

async function loadTrustRow(db: D1Database, userId: string): Promise<ContributorTrustRow> {
    const row = await db.prepare(
        `SELECT status, mode, cycle_started_at, cooldown_until, trusted_since
         FROM contributor_trust WHERE user_id = ?`
    ).bind(userId).first<ContributorTrustRow>();
    return row || defaultTrustRow();
}

async function loadTrustMetrics(
    db: D1Database,
    userId: string,
    cycleStartedAt: number,
    now: number,
): Promise<ContributorTrustMetrics> {
    const problematicCutoff = now - CONTRIBUTOR_TRUST_POLICY.problematicWindowDays * DAY_SECONDS;
    const row = await db.prepare(
        `SELECT
            SUM(CASE WHEN event_type = 'approved' THEN 1 ELSE 0 END) AS approved,
            SUM(CASE WHEN event_type = 'rejected' THEN 1 ELSE 0 END) AS rejected,
            COUNT(DISTINCT CASE WHEN event_type = 'approved' THEN document_key END) AS distinct_documents,
            COUNT(DISTINCT CASE WHEN event_type = 'approved'
                THEN strftime('%Y-%m-%d', created_at, 'unixepoch', '+9 hours') END) AS distinct_contribution_days,
            SUM(CASE WHEN event_type = 'problematic' AND created_at >= ? THEN 1 ELSE 0 END) AS problematic_recent,
            SUM(CASE WHEN event_type = 'severe' AND created_at >= ? THEN 1 ELSE 0 END) AS severe_recent
         FROM contributor_trust_events
         WHERE user_id = ? AND created_at >= ?`
    ).bind(problematicCutoff, problematicCutoff, userId, cycleStartedAt).first<{
        approved: number | string | null;
        rejected: number | string | null;
        distinct_documents: number | string | null;
        distinct_contribution_days: number | string | null;
        problematic_recent: number | string | null;
        severe_recent: number | string | null;
    }>();

    return {
        approved: Number(row?.approved || 0),
        rejected: Number(row?.rejected || 0),
        distinctDocuments: Number(row?.distinct_documents || 0),
        distinctContributionDays: Number(row?.distinct_contribution_days || 0),
        problematicRecent: Number(row?.problematic_recent || 0),
        severeRecent: Number(row?.severe_recent || 0),
    };
}

function toSummary(row: ContributorTrustRow, metrics: ContributorTrustMetrics): ContributorTrustSummary {
    return {
        status: row.status,
        mode: row.mode,
        trusted: row.status === 'trusted',
        trusted_since: row.trusted_since,
        cycle_started_at: row.cycle_started_at,
        cooldown_until: row.cooldown_until,
        approved: metrics.approved,
        rejected: metrics.rejected,
        distinct_documents: metrics.distinctDocuments,
        distinct_contribution_days: metrics.distinctContributionDays,
        approval_rate: contributorTrustApprovalRate(metrics),
        problematic_recent: metrics.problematicRecent + metrics.severeRecent,
        policy: CONTRIBUTOR_TRUST_POLICY,
    };
}

export async function getContributorTrustSummary(
    db: D1Database,
    userId: string,
    now = Math.floor(Date.now() / 1000),
): Promise<ContributorTrustSummary> {
    await ensureContributorTrustSchema(db);
    const row = await loadTrustRow(db, userId);
    const metrics = await loadTrustMetrics(db, userId, row.cycle_started_at, now);
    return toSummary(row, metrics);
}

export async function isTrustedContributor(db: D1Database, userId: string): Promise<boolean> {
    await ensureContributorTrustSchema(db);
    const row = await db.prepare('SELECT status FROM contributor_trust WHERE user_id = ?')
        .bind(userId).first<{ status: ContributorTrustStatus }>();
    return row?.status === 'trusted';
}

export async function recalculateContributorTrust(
    db: D1Database,
    userId: string,
    now = Math.floor(Date.now() / 1000),
): Promise<ContributorTrustUpdate> {
    await ensureContributorTrustSchema(db);
    await ensureTrustRow(db, userId);
    const before = await loadTrustRow(db, userId);
    const metrics = await loadTrustMetrics(db, userId, before.cycle_started_at, now);
    const nextStatus = evaluateContributorTrust({
        currentStatus: before.status,
        mode: before.mode,
        cooldownUntil: before.cooldown_until,
        metrics,
        now,
    });

    let transition: ContributorTrustTransition = null;
    if (nextStatus !== before.status) {
        transition = nextStatus === 'trusted' ? 'promoted' : 'demoted';
        if (nextStatus === 'trusted') {
            await db.prepare(
                `UPDATE contributor_trust
                 SET status = 'trusted', trusted_since = ?, updated_at = ?
                 WHERE user_id = ?`
            ).bind(now, now, userId).run();
        } else {
            const cooldownUntil = now + CONTRIBUTOR_TRUST_POLICY.repromotionCooldownDays * DAY_SECONDS;
            await db.prepare(
                `UPDATE contributor_trust
                 SET status = 'standard', cycle_started_at = ?, cooldown_until = ?,
                     trusted_since = NULL, updated_at = ?
                 WHERE user_id = ?`
            ).bind(now, cooldownUntil, now, userId).run();
        }
    }

    return {
        summary: await getContributorTrustSummary(db, userId, now),
        transition,
    };
}

export async function recordContributorTrustEvent(
    db: D1Database,
    event: {
        userId: string;
        eventType: ContributorTrustEventType;
        sourceType: string;
        sourceId: string;
        documentKey?: string | null;
        actorId?: string | null;
        reason?: string | null;
        occurredAt?: number;
    },
): Promise<ContributorTrustUpdate> {
    await ensureContributorTrustSchema(db);
    const now = Math.floor(Date.now() / 1000);
    const occurredAt = event.occurredAt ?? now;
    await ensureTrustRow(db, event.userId);
    await db.prepare(
        `INSERT OR IGNORE INTO contributor_trust_events
            (user_id, event_type, source_type, source_id, document_key, actor_id, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
        event.userId,
        event.eventType,
        event.sourceType,
        event.sourceId,
        event.documentKey ?? null,
        event.actorId ?? null,
        event.reason?.trim().slice(0, 500) || null,
        occurredAt,
    ).run();
    return recalculateContributorTrust(db, event.userId, now);
}

export async function setContributorTrustMode(
    db: D1Database,
    userId: string,
    mode: ContributorTrustMode,
    now = Math.floor(Date.now() / 1000),
): Promise<ContributorTrustUpdate> {
    await ensureContributorTrustSchema(db);
    await ensureTrustRow(db, userId);

    if (mode === 'trusted') {
        await db.prepare(
            `UPDATE contributor_trust
             SET mode = 'trusted', status = 'trusted', trusted_since = COALESCE(trusted_since, ?), updated_at = ?
             WHERE user_id = ?`
        ).bind(now, now, userId).run();
    } else if (mode === 'standard') {
        const cooldownUntil = now + CONTRIBUTOR_TRUST_POLICY.repromotionCooldownDays * DAY_SECONDS;
        await db.prepare(
            `UPDATE contributor_trust
             SET mode = 'standard', status = 'standard', cycle_started_at = ?, cooldown_until = ?,
                 trusted_since = NULL, updated_at = ?
             WHERE user_id = ?`
        ).bind(now, cooldownUntil, now, userId).run();
    } else {
        await db.prepare(
            `UPDATE contributor_trust SET mode = 'auto', status = 'standard', trusted_since = NULL, updated_at = ?
             WHERE user_id = ?`
        ).bind(now, userId).run();
    }

    return recalculateContributorTrust(db, userId, now);
}
