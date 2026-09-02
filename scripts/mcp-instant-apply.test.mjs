import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';

test('즉시 반영을 끄면 draft 도구만, 켜면 apply_edit과 revert_page를 노출한다', async () => {
    const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
    try {
        const { getUserToolDefs } = await server.ssrLoadModule('/src/routes/mcp.ts');
        const off = getUserToolDefs(false).map(({ name }) => name);
        const on = getUserToolDefs(true).map(({ name }) => name);

        assert.ok(off.includes('create_or_update_page'));
        assert.ok(off.includes('commit_edit'));
        assert.equal(off.includes('apply_edit'), false);
        assert.equal(off.includes('revert_page'), false);
        assert.ok(on.includes('apply_edit'));
        assert.ok(on.includes('revert_page'));
    } finally {
        await server.close();
    }
});
