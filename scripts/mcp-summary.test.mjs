import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';

test('MCP revision summaries omit the source prefix and keep diff stats', async () => {
    const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });

    try {
        const {
            buildCommitSummary,
            normalizeMcpSummary,
            validateMcpSummaryLength,
        } = await server.ssrLoadModule('/src/routes/admin-mcp.ts');

        assert.equal(normalizeMcpSummary('  오타 수정  '), '오타 수정');
        assert.equal(normalizeMcpSummary('   '), null);
        assert.equal(buildCommitSummary('오타 수정', { added: 5, removed: 2 }), '[+5줄 -2줄] 오타 수정');
        assert.equal(validateMcpSummaryLength('가'.repeat(255)), null);
        assert.match(validateMcpSummaryLength('가'.repeat(256)), /최대 255자/);

        const longSummary = buildCommitSummary('가'.repeat(255), { added: 5, removed: 2 });
        assert.equal(longSummary.length, 255);
        assert.equal(longSummary.startsWith('[MCP]'), false);
    } finally {
        await server.close();
    }
});
