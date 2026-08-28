import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';
import { createServer } from 'vite';

test('편집 요청 관리자 가드가 뒤에 등록된 공개 API로 새지 않는다', async () => {
    const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });

    try {
        const { default: pendingEditsRoutes } = await server.ssrLoadModule('/src/routes/pending-edits.ts');
        const app = new Hono();
        app.route('/api', pendingEditsRoutes);
        app.get('/api/public-probe', (c) => c.json({ ok: true }));

        assert.equal((await app.request('/api/pending-edits')).status, 403);
        assert.equal((await app.request('/api/pending-edits/count')).status, 403);

        const response = await app.request('/api/public-probe');

        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { ok: true });
    } finally {
        await server.close();
    }
});
