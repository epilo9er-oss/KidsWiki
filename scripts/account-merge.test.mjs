import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { mergeAccounts, resolveCanonicalUserId } from '../src/routes/auth/accountMerge.ts';

class D1Statement {
    constructor(db, sql, values = []) {
        this.db = db;
        this.sql = sql;
        this.values = values;
    }

    bind(...values) {
        return new D1Statement(this.db, this.sql, values);
    }

    async first() {
        return this.db.prepare(this.sql).get(...this.values) ?? null;
    }

    async all() {
        return { results: this.db.prepare(this.sql).all(...this.values) };
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
        return new D1Statement(this.db, sql);
    }

    async batch(statements) {
        this.db.exec('BEGIN');
        try {
            const results = [];
            for (const statement of statements) results.push(await statement.run());
            this.db.exec('COMMIT');
            return results;
        } catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }
}

test('중복 계정은 대표 계정으로 이동되고 예전 ID는 별칭으로 남는다', async () => {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(readFileSync(new URL('../migrations/schema.sql', import.meta.url), 'utf8'));
    const db = new TestD1(sqlite);
    const survivor = '123456789ABCDEFGHJKLMN';
    const absorbed = '23456789ABCDEFGHJKLMNP';

    const insertUser = sqlite.prepare(
        'INSERT INTO users (id, provider, uid, email, name, role) VALUES (?, ?, ?, ?, ?, \'user\')',
    );
    insertUser.run(survivor, 'google', 'google-a', 'a@example.com', 'A');
    insertUser.run(absorbed, 'naver', 'naver-b', 'b@example.com', 'B');
    sqlite.prepare('INSERT INTO user_identities (user_id, provider, provider_uid, provider_email) VALUES (?, ?, ?, ?)')
        .run(survivor, 'google', 'google-a', 'a@example.com');
    sqlite.prepare('INSERT INTO user_identities (user_id, provider, provider_uid, provider_email) VALUES (?, ?, ?, ?)')
        .run(absorbed, 'naver', 'naver-b', 'b@example.com');
    const pageId = Number(sqlite.prepare("INSERT INTO pages (slug, content) VALUES ('병합-테스트', '')").run().lastInsertRowid);
    sqlite.prepare('INSERT INTO revisions (page_id, content, author_id) VALUES (?, ?, ?)').run(pageId, '본문', absorbed);
    sqlite.prepare("INSERT INTO page_watches (user_id, page_id, scope) VALUES (?, ?, 'this')").run(survivor, pageId);
    sqlite.prepare("INSERT INTO page_watches (user_id, page_id, scope) VALUES (?, ?, 'subtree')").run(absorbed, pageId);
    sqlite.prepare("INSERT INTO mcp_drafts (user_id, slug, action) VALUES (?, '다른-초안', 'create')").run(absorbed);
    sqlite.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES ('session-b', ?, 9999999999)").run(absorbed);

    const result = await mergeAccounts(db, survivor, absorbed);

    assert.equal(result.status, 'merged');
    assert.deepEqual(result.revokedSessionIds, ['session-b']);
    assert.equal(sqlite.prepare("SELECT user_id FROM user_identities WHERE provider = 'naver'").get().user_id, survivor);
    assert.equal(sqlite.prepare('SELECT author_id FROM revisions WHERE page_id = ?').get(pageId).author_id, survivor);
    assert.equal(sqlite.prepare('SELECT scope FROM page_watches WHERE user_id = ? AND page_id = ?').get(survivor, pageId).scope, 'subtree');
    assert.equal(sqlite.prepare('SELECT user_id FROM mcp_drafts').get().user_id, survivor);
    assert.equal(sqlite.prepare('SELECT role FROM users WHERE id = ?').get(absorbed).role, 'deleted');
    assert.equal(await resolveCanonicalUserId(db, absorbed), survivor);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?').get(absorbed).count, 0);
});
