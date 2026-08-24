import assert from 'node:assert/strict';
import test from 'node:test';
import { isRagSearchEnabled, ragSearchBody } from '../src/utils/rag.ts';

test('direct AI Search binding is queried and duplicate page chunks are collapsed', async () => {
    let request;
    const env = {
        RAG_SEARCH_ENABLED: 'true',
        AI_SEARCH: {
            async search(input) {
                request = input;
                return {
                    search_query: '어린이 놀이',
                    chunks: [
                        { id: '1', type: 'text', score: 0.6, text: '첫 청크', item: { key: '%ED%82%A4%EC%A6%88%EC%9C%84%ED%82%A4.md' } },
                        { id: '2', type: 'text', score: 0.9, text: '더 좋은 청크', item: { key: '%ED%82%A4%EC%A6%88%EC%9C%84%ED%82%A4.md' } },
                    ],
                };
            },
        },
    };

    assert.equal(isRagSearchEnabled(env), true);
    assert.deepEqual(await ragSearchBody(env, '  어린이 놀이  ', 100), [
        { slug: '키즈위키', score: 0.9, snippet: '더 좋은 청크' },
    ]);
    assert.deepEqual(request, {
        query: '어린이 놀이',
        ai_search_options: {
            retrieval: { max_num_results: 50 },
            query_rewrite: { enabled: false },
        },
    });
});
