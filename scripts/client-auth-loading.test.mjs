import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createServer } from 'vite';

test('인증 확인 전 헤더는 로그인 상태를 추측해 표시하지 않는다', async () => {
    const html = await readFile(new URL('../public/components/header.html', import.meta.url), 'utf8');
    for (const id of ['navSettings', 'navLogin', 'navUser']) {
        const tag = html.match(new RegExp(`<[^>]+id="${id}"[^>]*>`))?.[0] || '';
        assert.match(tag, /class="[^"]*\bd-none\b[^"]*"/, `${id} must start hidden`);
    }
});

test('loadConfig는 인증을 병렬로 시작하고 동시 checkAuth와 요청을 공유한다', async () => {
    const globalKeys = ['window', 'document', 'localStorage', 'fetch'];
    const originals = Object.fromEntries(globalKeys.map((key) => [
        key,
        Object.getOwnPropertyDescriptor(globalThis, key),
    ]));
    const noop = () => {};
    const root = { setAttribute: noop, removeAttribute: noop, getAttribute: () => null };
    globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
    globalThis.document = {
        documentElement: root,
        body: { ...root, classList: { add: noop, remove: noop, toggle: noop, contains: () => false } },
        readyState: 'loading',
        addEventListener: noop,
        querySelectorAll: () => [],
        querySelector: () => null,
        getElementById: () => null,
        createElement: () => ({
            style: {},
            classList: { add: noop, remove: noop },
            appendChild: noop,
            setAttribute: noop,
            addEventListener: noop,
        }),
    };
    globalThis.window = {
        document: globalThis.document,
        localStorage: globalThis.localStorage,
        location: { origin: 'http://local', pathname: '/mypage', search: '', href: 'http://local/mypage' },
        matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }),
        addEventListener: noop,
        innerWidth: 1200,
    };

    let releaseConfig;
    const configGate = new Promise((resolve) => { releaseConfig = resolve; });
    let releaseMe;
    const meGate = new Promise((resolve) => { releaseMe = resolve; });
    let meCalls = 0;
    let configCalls = 0;
    globalThis.fetch = async (url) => {
        if (url === '/api/config') {
            configCalls += 1;
            await configGate;
            return { ok: false, status: 404 };
        }
        if (url === '/api/me') {
            meCalls += 1;
            await meGate;
            return { ok: false, status: 401 };
        }
        return { ok: false, status: 404 };
    };

    const server = await createServer({
        appType: 'custom',
        optimizeDeps: { noDiscovery: true },
        server: { middlewareMode: true, hmr: false },
    });
    try {
        await server.ssrLoadModule('/src/client/common.ts');
        const first = globalThis.window.loadConfig();
        await new Promise(setImmediate);
        assert.equal(meCalls, 1, '설정 응답을 기다리는 동안에도 인증 확인을 시작해야 한다');
        assert.equal(configCalls, 1);

        const second = globalThis.window.checkAuth();
        const third = globalThis.window.loadConfig();
        await new Promise(setImmediate);
        assert.equal(meCalls, 1);
        assert.equal(configCalls, 1, '동시에 시작된 설정 초기화가 중복 요청을 만들면 안 된다');
        releaseConfig();
        await new Promise(setImmediate);
        assert.equal(meCalls, 1, 'loadConfig의 인증 확인이 중복 요청을 만들면 안 된다');

        releaseMe();
        await Promise.all([first, second, third]);

        await globalThis.window.checkAuth();
        assert.equal(meCalls, 1, '같은 문서 안의 순차 초기화도 인증 스냅샷을 재사용해야 한다');
    } finally {
        await server.close();
        for (const [key, descriptor] of Object.entries(originals)) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        }
    }
});
