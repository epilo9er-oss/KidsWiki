import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
    CONTRIBUTOR_TRUST_POLICY,
    evaluateContributorTrust,
    recordContributorTrustEvent,
    resetContributorTrustSchemaCacheForTests,
    qualifiesForTrustedContributor,
} from '../src/utils/contributorTrust.ts';

const day = 86400;
const now = 200 * day;

function metrics(overrides = {}) {
    return {
        approved: 3,
        rejected: 0,
        distinctDocuments: 2,
        distinctContributionDays: 3,
        problematicRecent: 0,
        severeRecent: 0,
        ...overrides,
    };
}

class TestD1Statement {
    constructor(db, sql, values = []) {
        this.db = db;
        this.sql = sql;
        this.values = values;
    }

    bind(...values) {
        return new TestD1Statement(this.db, this.sql, values);
    }

    async first() {
        return this.db.prepare(this.sql).get(...this.values) ?? null;
    }

    async run() {
        const result = this.db.prepare(this.sql).run(...this.values);
        return { meta: { changes: Number(result.changes) } };
    }
}

class TestD1 {
    constructor(db) {
        this.db = db;
    }

    prepare(sql) {
        return new TestD1Statement(this.db, sql);
    }

    async batch(statements) {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        return results;
    }
}

test('승인 수·문서 수·서로 다른 기여일·승인률을 모두 충족해야 신뢰 기여자가 된다', () => {
    assert.equal(qualifiesForTrustedContributor(metrics()), true);
    assert.equal(qualifiesForTrustedContributor(metrics({ approved: 2 })), false);
    assert.equal(qualifiesForTrustedContributor(metrics({ distinctDocuments: 1 })), false);
    assert.equal(qualifiesForTrustedContributor(metrics({ distinctContributionDays: 2 })), false);
    assert.equal(qualifiesForTrustedContributor(metrics({ rejected: 1 })), false);
    assert.equal(qualifiesForTrustedContributor(metrics({ approved: 4, rejected: 1 })), true);
});

test('승인 기여일은 관리자 처리일이 아니라 한국 표준시의 제출일로 센다', async () => {
    resetContributorTrustSchemaCacheForTests();
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec('CREATE TABLE users (id TEXT PRIMARY KEY)');
    sqlite.prepare('INSERT INTO users (id) VALUES (?)').run('user-1');
    const db = new TestD1(sqlite);
    const submissions = [
        Date.parse('2026-01-01T14:30:00Z') / 1000, // 1월 1일 23:30 KST
        Date.parse('2026-01-01T15:30:00Z') / 1000, // 1월 2일 00:30 KST
        Date.parse('2026-01-02T15:30:00Z') / 1000, // 1월 3일 00:30 KST
    ];

    let lastUpdate;
    for (const [index, occurredAt] of submissions.entries()) {
        lastUpdate = await recordContributorTrustEvent(db, {
            userId: 'user-1',
            eventType: 'approved',
            sourceType: 'pending_edit',
            sourceId: String(index + 1),
            documentKey: index === 0 ? '문서-A' : '문서-B',
            occurredAt,
        });
    }

    assert.equal(lastUpdate.summary.distinct_contribution_days, 3);
    assert.equal(lastUpdate.transition, 'promoted');
});

test('자동 모드는 기준 충족 시 승격하고 재승격 대기 중에는 승격하지 않는다', () => {
    assert.equal(evaluateContributorTrust({
        currentStatus: 'standard', mode: 'auto', cooldownUntil: 0, metrics: metrics(), now,
    }), 'trusted');
    assert.equal(evaluateContributorTrust({
        currentStatus: 'standard', mode: 'auto', cooldownUntil: now + day, metrics: metrics(), now,
    }), 'standard');
});

test('최근 문제 기여 두 건 또는 심각한 문제 한 건이면 자동 강등한다', () => {
    assert.equal(evaluateContributorTrust({
        currentStatus: 'trusted', mode: 'auto', cooldownUntil: 0,
        metrics: metrics({ problematicRecent: CONTRIBUTOR_TRUST_POLICY.problematicEventsForDemotion }), now,
    }), 'standard');
    assert.equal(evaluateContributorTrust({
        currentStatus: 'trusted', mode: 'auto', cooldownUntil: 0,
        metrics: metrics({ severeRecent: 1 }), now,
    }), 'standard');
    assert.equal(evaluateContributorTrust({
        currentStatus: 'standard', mode: 'auto', cooldownUntil: 0,
        metrics: metrics({ problematicRecent: CONTRIBUTOR_TRUST_POLICY.problematicEventsForDemotion }), now,
    }), 'standard');
});

test('관리자 고정 모드는 자동 평가보다 우선한다', () => {
    assert.equal(evaluateContributorTrust({
        currentStatus: 'standard', mode: 'trusted', cooldownUntil: 0,
        metrics: metrics({ approved: 0, rejected: 0 }), now,
    }), 'trusted');
    assert.equal(evaluateContributorTrust({
        currentStatus: 'trusted', mode: 'standard', cooldownUntil: 0,
        metrics: metrics(), now,
    }), 'standard');
});
