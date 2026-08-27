import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getPublicTopicContributionOverview,
    getPublicUserContributions,
} from '../src/utils/contributionStats.ts';

function fakeDb(responses) {
    const queries = [];
    const bindings = [];
    return {
        queries,
        bindings,
        db: {
            prepare(sql) {
                const response = responses[queries.length] || {};
                queries.push(sql);
                return {
                    bind(...values) {
                        bindings.push(values);
                        return {
                            all: async () => ({ results: response.results || [] }),
                            first: async () => response.first || null,
                        };
                    },
                };
            },
        },
    };
}

function assertPublicOnly(query) {
    assert.match(query, /p\.is_private = 0/);
    assert.match(query, /p\.deleted_at IS NULL/);
    assert.match(query, /r\.is_virtual = 0/);
    assert.match(query, /r\.deleted_at IS NULL/);
    assert.match(query, /r\.purged_at IS NULL/);
}

test('public contribution profiles exclude hidden revisions and normalize D1 counts', async () => {
    const { db, queries, bindings } = fakeDb([
        { results: [{ revision_id: 3, summary: '근거 추가', created_at: 30, slug: '이유식' }] },
        { first: { total: '3' } },
        { results: [{ category: '이유식', document_count: '2', edit_count: '3', last_contributed_at: '30' }] },
    ]);

    const result = await getPublicUserContributions(db, 'user-1', 20, 0);

    assert.equal(result.total, 3);
    assert.deepEqual(result.topic_contributions, [{
        category: '이유식',
        document_count: 2,
        edit_count: 3,
        last_contributed_at: 30,
    }]);
    queries.forEach(assertPublicOnly);
    assert.deepEqual(bindings, [['user-1', 20, 0], ['user-1'], ['user-1']]);
});

test('admin contribution overview uses the same public-only rules', async () => {
    const { db, queries, bindings } = fakeDb([{ results: [{
        category: '수면',
        document_count: '4',
        contributor_count: '2',
        edit_count: '7',
        last_contributed_at: '40',
    }] }]);

    const result = await getPublicTopicContributionOverview(db, 10);

    assert.deepEqual(result, [{
        category: '수면',
        document_count: 4,
        contributor_count: 2,
        edit_count: 7,
        last_contributed_at: 40,
    }]);
    assertPublicOnly(queries[0]);
    assert.match(queries[0], /u\.role <> 'deleted'/);
    assert.deepEqual(bindings, [[10]]);
});
