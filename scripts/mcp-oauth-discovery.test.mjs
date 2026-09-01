import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';
import { createServer } from 'vite';

test('GET /api/mcp does not masquerade as OAuth protected-resource metadata', async () => {
    const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });

    try {
        const { default: mcpRoutes } = await server.ssrLoadModule('/src/routes/mcp.ts');
        const app = new Hono();
        app.route('/api/mcp', mcpRoutes);

        const response = await app.request('/api/mcp', {}, { MCP_MODE: 'full' });

        assert.equal(response.status, 405);
        assert.equal(response.headers.get('allow'), 'POST, OPTIONS');
    } finally {
        await server.close();
    }
});
