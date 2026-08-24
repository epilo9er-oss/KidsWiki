#!/usr/bin/env node
/**
 * wrangler.toml → wrangler.preview.toml 생성 (브랜치 프리뷰 전용 Worker 설정)
 *
 * 왜 필요한가:
 *   Cloudflare 는 "Durable Object 를 **구현(implement)** 하는 Worker" 에는 프리뷰 URL 을 만들지 않는다.
 *   (https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/ § Limitations)
 *   kidswiki 본체는 AdminJobDO 를 export 하므로 브랜치 프리뷰가 통째로 막힌다.
 *   또한 `wrangler versions upload` 는 DO 클래스 라이프사이클 변경(migrations/exports)을 적용할 수 없다.
 *
 *   그래서 프리뷰는 **DO 가 없는 별도 Worker**(`<name>-preview`)로 올린다.
 *   `src/routes/adminJobs.ts` 가 `env.ADMIN_JOB_DO` 부재를 이미 503 으로 처리하므로 코드 변경은 필요 없다.
 *
 * 왜 `[env.preview]` 가 아니라 파일 생성인가:
 *   wrangler 환경은 바인딩·vars 가 **비상속(non-inheritable)** 이라 D1/R2/KV/AI Search/[vars] 전부를
 *   환경 블록에 재선언해야 한다. 그러면 wrangler.toml 이 통째로 이중화돼 드리프트가 생긴다.
 *   여기서는 원본을 그대로 복사하고 위험한 블록만 걷어내므로 단일 소스가 유지된다.
 *
 * 무엇을 제거·덮어쓰는지와 그 이유는 아래 DROP_TABLES / DROP_KEYS / VAR_OVERRIDES 주석이 단일 소스다.
 * (`name` 만 예외로 여기 적는다 — `<원본 이름>-preview`, 환경변수 PREVIEW_WORKER_NAME 으로 재정의 가능.)
 *
 * 산출물은 .gitignore 대상이며, 배포 직전 항상 재생성한다(npm run preview:deploy).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'wrangler.toml');
const OUT = join(ROOT, 'wrangler.preview.toml');

/**
 * 프리뷰 설정에서 통째로 걷어낼 최상위 테이블 경로(첫 세그먼트 기준).
 *
 * - `durable_objects`/`migrations`/`exports` — DO 를 구현하지 않게 만들어 프리뷰 URL 을 살린다.
 * - `triggers` — 프리뷰가 프로덕션과 **같은 D1 을 공유**하므로, cron 이 붙으면 `src/index.ts` 의
 *   scheduled 핸들러(밴 해제 UPDATE, draft/알림 DELETE)가 프로덕션 데이터에 중복 실행된다.
 * - `routes`/`route` — 프리뷰 Worker 가 프로덕션 커스텀 도메인 라우트를 가로채는 사고 방지.
 * - `queues` — consumers 가 복사되면 큐 메시지는 컨슈머 **하나에게만** 전달되므로 프리뷰 Worker 가
 *   프로덕션 메시지를 가로채 소비한다.
 * - `analytics_engine_datasets` — 데이터셋 이름(`kidswiki`)이 그대로 복사되고
 *   `src/routes/analytics.ts` 가 그 이름을 하드코딩해 조회하므로, 프리뷰 브라우징이 프로덕션
 *   트렌딩·통계를 오염시킨다. `env.ANALYTICS` 는 optional 이고 `src/utils/analytics.ts` 가
 *   미바인딩을 무시하므로 제거해도 안전하다.
 * - `env` — 프리뷰가 `--env` 를 쓰지 않으므로 불필요하고, 환경 블록 안에 숨은 DO/triggers 가
 *   위 규칙(첫 세그먼트가 `env` 라 매칭되지 않음)을 그대로 우회하는 구멍이 된다.
 */
const DROP_TABLES = new Set([
    'durable_objects', 'migrations', 'exports', 'triggers', 'routes', 'route', 'queues',
    'analytics_engine_datasets', 'env',
]);
/**
 * 프리뷰 설정에서 걷어낼 최상위 key = value 항목(아래에서 값을 다시 써 넣는 것 포함).
 * `workers_dev` 는 끈다 — 켜두면 `kidswiki-preview.<서브도메인>.workers.dev` 라는 **상시 공개
 * URL** 이 생기는데, 이건 프리뷰 URL 이 아니라서 Preview URLs 용 Cloudflare Access 로 막히지도 않고
 * 프로덕션 D1/R2/KV 를 그대로 바라본다(`ALLOW_CRAWL="true"` 라 색인되는 중복 오리진이 되기도 한다).
 * 프리뷰 URL 은 `preview_urls = true` 로 계속 동작한다 — 명시값이 workers_dev 기반 기본값을 이긴다.
 */
const DROP_KEYS = new Set(['routes', 'route', 'preview_urls', 'workers_dev']);

/**
 * `[vars]` 안에서 값을 갈아끼울 항목.
 *
 * `ALLOW_CRAWL` — 프리뷰 URL 은 공개이고 noindex 도 붙지 않는다. `"true"` 인 채로 복사되면
 * `src/index.ts` 의 robots.txt·sitemap.xml·canonical 이 전부 **요청 오리진 기준**이라
 * (`new URL(c.req.url).origin`) 브랜치마다 프로덕션 위키와 같은 내용에 자체 sitemap 과
 * 자기참조 canonical 을 가진 색인 가능한 중복 오리진이 하나씩 생겨 프로덕션 SEO 를 갉아먹는다.
 * `"false"` 면 robots.txt 가 `Disallow: /`, sitemap 이 빈 urlset 이 된다.
 */
const VAR_OVERRIDES = new Map([['ALLOW_CRAWL', 'false']]);

/**
 * TOML 한 줄을 훑어 (a) 줄 끝의 멀티라인 문자열 상태와 (b) 문자열·주석 **밖** 대괄호 깊이 변화를 낸다.
 * `CUSTOM_HEADER = """..."""` 같은 멀티라인 값 안의 `[` 를 테이블 헤더로 오인하지 않기 위해 필요하다.
 *
 * @param {string} line
 * @param {'none'|'ml-basic'|'ml-literal'} state 줄 시작 시점의 상태
 * @returns {{ state: 'none'|'ml-basic'|'ml-literal', delta: number }}
 */
function scanLine(line, state) {
    let i = 0;
    let delta = 0;
    while (i < line.length) {
        if (state === 'ml-basic') {
            if (line.startsWith('"""', i)) { state = 'none'; i += 3; }
            else if (line[i] === '\\') { i += 2; }
            else { i += 1; }
            continue;
        }
        if (state === 'ml-literal') {
            if (line.startsWith("'''", i)) { state = 'none'; i += 3; }
            else { i += 1; }
            continue;
        }
        const c = line[i];
        if (c === '#') break; // 줄 끝까지 주석
        if (line.startsWith('"""', i)) { state = 'ml-basic'; i += 3; continue; }
        if (line.startsWith("'''", i)) { state = 'ml-literal'; i += 3; continue; }
        if (c === '"' || c === "'") {
            const quote = c;
            i += 1;
            while (i < line.length && line[i] !== quote) {
                if (quote === '"' && line[i] === '\\') i += 1;
                i += 1;
            }
            i += 1;
            continue;
        }
        if (c === '[') delta += 1;
        else if (c === ']') delta -= 1;
        i += 1;
    }
    return { state, delta };
}

/** `[[durable_objects.bindings]]` → `durable_objects.bindings` 처럼 헤더의 점 경로를 뽑는다. */
function headerPath(line) {
    const m = line.match(/^\s*\[\[?\s*([^\]]*?)\s*\]\]?/);
    if (!m) return '';
    return m[1].split('.').map((s) => s.replace(/^["']|["']$/g, '').trim()).join('.');
}

/** 정규식에 키 이름을 안전하게 끼워 넣기 위한 이스케이프. */
function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `key = ...` 형태면 key 를, 아니면 null 을 낸다. */
function assignedKey(line) {
    const m = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=/);
    return m ? m[1] : null;
}

/**
 * 원본을 preamble(첫 테이블 헤더 이전) + 테이블 블록들로 쪼갠다.
 * 헤더 바로 위에 붙은 주석/빈 줄은 그 블록에 귀속시켜, 블록을 지울 때 설명 주석도 함께 사라지게 한다.
 *
 * 대괄호 깊이를 함께 추적한다. 여러 줄에 걸친 배열의 continuation 줄이 `[` 로 시작하면
 * (예: `foo = [` / `  [1, 2],` / `]`) 그것을 테이블 헤더로 오인해 preamble 이 중간에서
 * 잘리고, 뒤에 붙이는 `preview_urls` 가 배열 **안쪽**에 삽입돼 깨진 TOML 이 나온다.
 */
function splitBlocks(text) {
    const preamble = [];
    const blocks = [];
    let current = null;
    let pending = [];
    let state = 'none';
    let depth = 0;

    for (const line of text.split('\n')) {
        const startState = state;
        const startDepth = depth;
        const scanned = scanLine(line, state);
        state = scanned.state;
        depth = Math.max(0, depth + scanned.delta);

        // 배열 안(깊이>0)에서는 `[` 로 시작하는 줄도 헤더가 아니라 값이다.
        if (startState === 'none' && startDepth === 0 && /^\s*\[/.test(line)) {
            const header = headerPath(line);
            current = { root: header.split('.')[0], path: header, lines: [...pending, line] };
            pending = [];
            blocks.push(current);
            continue;
        }
        if (line.trim() === '' || (startState === 'none' && /^\s*#/.test(line))) {
            pending.push(line);
            continue;
        }
        (current ? current.lines : preamble).push(...pending, line);
        pending = [];
    }
    return { preamble, blocks, trailing: pending };
}

/**
 * preamble 에서 지정 키의 `key = value` 항목을 제거한다.
 * 값이 여러 줄에 걸친 배열(`routes = [\n ... \n]`)이면 대괄호 깊이가 0 으로 돌아올 때까지 함께 지운다.
 */
function stripKeys(lines, keys) {
    const out = [];
    let state = 'none';
    let skipDepth = null;

    for (const line of lines) {
        const startState = state;
        const scanned = scanLine(line, state);
        state = scanned.state;

        if (skipDepth !== null) {
            skipDepth += scanned.delta;
            if (skipDepth <= 0 && state === 'none') skipDepth = null;
            continue;
        }
        const key = startState === 'none' ? assignedKey(line) : null;
        if (key && keys.has(key)) {
            skipDepth = scanned.delta;
            if (skipDepth <= 0 && state === 'none') skipDepth = null;
            continue;
        }
        out.push(line);
    }
    return out;
}

/**
 * preamble 에서 최상위 `name` 키가 있는 줄을 찾는다.
 *
 * preamble 로 범위를 좁히는 이유: 원문 전체를 훑으면 `[[durable_objects.bindings]]` 의
 * `name = "ADMIN_JOB_DO"`(실제 wrangler.toml 에 존재) 를 최상위 name 으로 오인한다.
 * 문자열 상태까지 보는 이유: preamble 안 멀티라인 문자열에 들어 있는 `name = ...` 줄은
 * 값의 일부이므로 건드리면 안 된다(`stripKeys` 와 같은 규칙).
 *
 * @param {string[]} lines
 * @returns {{ index: number, value: string } | null}
 */
function findTopLevelName(lines) {
    let state = 'none';
    for (let i = 0; i < lines.length; i += 1) {
        const startState = state;
        ({ state } = scanLine(lines[i], state));
        if (startState !== 'none') continue;
        const m = lines[i].match(/^\s*name\s*=\s*["']([^"']+)["']/);
        if (m) return { index: i, value: m[1] };
    }
    return null;
}

/**
 * 테이블 블록 안에서 `key = "값"` 의 **값만** 갈아끼운다(없으면 블록 끝에 추가).
 * 인라인 주석을 보존하려고 값 토큰만 바꾸며, 멀티라인 문자열 안의 동명 키는 건드리지 않는다.
 *
 * @param {{ root: string, lines: string[] }} block
 * @param {Map<string, string>} overrides
 */
function overrideKeysInBlock(block, overrides) {
    const remaining = new Map(overrides);
    let state = 'none';

    block.lines = block.lines.map((line) => {
        const startState = state;
        ({ state } = scanLine(line, state));
        if (startState !== 'none') return line;

        for (const [key, value] of remaining) {
            const re = new RegExp(`(^\\s*${escapeRe(key)}\\s*=\\s*)(["'])(.*?)\\2`);
            if (!re.test(line)) continue;
            remaining.delete(key);
            return line.replace(re, (_, lhs, quote) => `${lhs}${quote}${value}${quote}`);
        }
        return line;
    });

    for (const [key, value] of remaining) block.lines.push(`${key} = "${value}"`);
}

/**
 * 산출물의 `[vars]` 안에서 각 override 키가 **정확히 1회, 기대값으로** 존재하는지 확인한다.
 *
 * 치환이 빗나가는 경우(값이 문자열 리터럴이 아니거나, 인라인 `vars = {...}` 형식이거나, 서브테이블에
 * 잘못 들어간 경우)는 조용히 원본 값을 남기거나 키를 중복시킨다. `ALLOW_CRAWL` 이 그대로 `"true"` 로
 * 남으면 이 커밋이 막으려던 색인 문제가 되살아나므로, 어긋나면 산출물을 쓰지 않고 멈춘다.
 *
 * @param {string} text 생성된 TOML
 * @param {Map<string, string>} overrides
 */
function assertVarOverrides(text, overrides) {
    const { preamble, blocks } = splitBlocks(text);
    const varsBlocks = blocks.filter((b) => b.path === 'vars');
    if (varsBlocks.length !== 1) {
        throw new Error(`생성된 설정의 [vars] 테이블이 ${varsBlocks.length} 개입니다(1 개여야 함).`);
    }
    // 최상위 `vars = { ... }` / `vars.<키> = ...` 가 남아 있으면 `[vars]` 테이블과 키가 충돌한다.
    // 파일의 다른 스캐너들과 같은 규칙(문자열 상태 추적 + assignedKey)을 써야 멀티라인 문자열 안의
    // `vars = ...` 를 오탐하지 않고, 점 표기 키를 놓치지도 않는다.
    let state = 'none';
    for (const line of preamble) {
        const startState = state;
        ({ state } = scanLine(line, state));
        if (startState !== 'none') continue;
        const key = assignedKey(line);
        if (key === 'vars' || key?.startsWith('vars.')) {
            throw new Error(
                '최상위 `vars = { ... }` / `vars.<키> = ...` 형식은 지원하지 않습니다. '
                + '[vars] 테이블을 쓰세요.',
            );
        }
    }

    for (const [key, expected] of overrides) {
        // 값 형태를 가리지 않고 **키가 등장한 줄을 전부** 센다. 따옴표 있는 것만 세면
        // `KEY = true` 가 남고 뒤에 `KEY = "false"` 가 덧붙은 중복 키 상태를 놓친다.
        const anyRe = new RegExp(`^\\s*${escapeRe(key)}\\s*=`);
        const valueRe = new RegExp(`^\\s*${escapeRe(key)}\\s*=\\s*(["'])(.*?)\\1\\s*(#.*)?\\s*$`);
        let state = 'none';
        const found = [];

        for (const line of varsBlocks[0].lines) {
            const startState = state;
            ({ state } = scanLine(line, state));
            if (startState !== 'none' || !anyRe.test(line)) continue;
            found.push(line.match(valueRe)?.[2] ?? line.trim());
        }
        if (found.length !== 1 || found[0] !== expected) {
            throw new Error(
                `[vars] 의 ${key} 덮어쓰기가 실패했습니다: ${JSON.stringify(found)} ` +
                `(기대: ["${expected}"] 1 개)`,
            );
        }
    }
}

const BANNER = [
    '# ⚠️ 자동 생성 파일 — 직접 수정하지 마세요.',
    '#',
    '# 생성: node scripts/make-preview-config.mjs (원본: wrangler.toml)',
    '# 용도: 브랜치 프리뷰 전용 Worker. Cloudflare 는 Durable Object 를 구현하는 Worker 에',
    '#       프리뷰 URL 을 만들어 주지 않으므로, DO 없는 별도 Worker 로 프리뷰를 올린다.',
    '#',
    // 하드코딩하면 DROP_TABLES 를 늘릴 때마다 배너가 낡아 사람을 오도한다. 상수에서 생성한다.
    `# 제거된 블록: ${[...DROP_TABLES].join(' / ')}`,
    '# 주의: 이 Worker 는 프로덕션과 **같은 D1·R2·KV** 를 공유한다. 프리뷰에서의 문서 편집은',
    '#       프로덕션 데이터를 실제로 변경한다. 관리자 잡 러너(ADMIN_JOB_DO)는 미바인딩이라 503.',
    '',
].join('\n');

/**
 * wrangler.toml 본문을 프리뷰용 TOML 문자열로 변환한다(순수 함수 — `npm run test:preview-config` 대상).
 * @param {string} source wrangler.toml 원문
 * @param {string} [nameOverride] 프리뷰 Worker 이름. 미지정 시 `<원본 이름>-preview`
 * @returns {{ text: string, previewName: string, dropped: string[] }}
 */
export function buildPreviewConfig(source, nameOverride) {
    const { preamble, blocks, trailing } = splitBlocks(source);

    // 탐색과 치환 모두 **같은 줄 하나**를 대상으로 한다. 인덱스를 재사용하므로 둘이 어긋날 수 없다.
    const head = stripKeys(preamble, DROP_KEYS);
    const found = findTopLevelName(head);
    if (!found) throw new Error('wrangler.toml 에서 최상위 name 을 찾지 못했습니다.');

    const previewName = nameOverride || `${found.value}-preview`;
    // 값만 갈아끼운다. 줄 전체를 대체하면 같은 줄의 인라인 주석과 CRLF 가 사라진다.
    head[found.index] = head[found.index].replace(
        /(name\s*=\s*)(["']).*?\2/,
        (_, lhs, quote) => `${lhs}${quote}${previewName}${quote}`,
    );

    // 이 두 줄은 **반드시 preamble**(첫 테이블 헤더 이전)에 둔다.
    // 파일 끝에 붙이면 TOML 규칙상 최상위가 아니라 직전 테이블의 키로 해석된다.
    head.push('preview_urls = true', 'workers_dev = false');

    const kept = blocks.filter((b) => !DROP_TABLES.has(b.root));
    const dropped = [...new Set(blocks.filter((b) => DROP_TABLES.has(b.root)).map((b) => b.root))];

    // 경로 전체가 정확히 `vars` 인 블록만 대상이다. `root` 로 고르면 `[vars.FEATURE_FLAGS]` 같은
    // 서브테이블이 `[vars]` 보다 앞에 있을 때 그쪽에 값을 써 넣고 진짜 `[vars]` 는 놓친다.
    const varsBlocks = kept.filter((b) => b.path === 'vars');
    if (varsBlocks.length > 1) throw new Error('[vars] 테이블이 여러 번 정의돼 있습니다.');
    if (varsBlocks.length === 1) {
        overrideKeysInBlock(varsBlocks[0], VAR_OVERRIDES);
    } else {
        // `[vars]` 테이블이 없으면 만들어 붙인다. 인라인 `vars = {...}` 형식이었다면 키가 중복돼
        // TOML 파싱이 깨지는데, 조용히 원본 값을 남기는 것보다 시끄럽게 실패하는 편이 낫다.
        kept.push({
            root: 'vars',
            path: 'vars',
            lines: ['', '[vars]', ...[...VAR_OVERRIDES].map(([k, v]) => `${k} = "${v}"`)],
        });
    }

    const body = [...head, ...kept.flatMap((b) => b.lines), ...trailing].join('\n');
    const text = `${BANNER}${body.replace(/\s*$/, '')}\n`;

    // 사후 검증: 치환이 조용히 no-op 되면 previewName 만 맞고 산출물은 원본 이름 그대로가 된다.
    // 그 상태로 배포하면 프로덕션 Worker 를 덮어쓰므로, 보고값과 산출물이 어긋나면 여기서 멈춘다.
    const emitted = findTopLevelName(text.split('\n'));
    if (emitted?.value !== previewName) {
        throw new Error(
            `생성된 설정의 name 이 "${emitted?.value}" 로, 기대값 "${previewName}" 과 다릅니다.`,
        );
    }
    assertVarOverrides(text, VAR_OVERRIDES);
    return { text, previewName, dropped };
}

/**
 * Workers Builds 는 연결된 Worker 이름을 `WRANGLER_CI_OVERRIDE_NAME` 으로 주입하고,
 * wrangler 는 설정의 `name` 이 그와 다르면 **경고만 남기고 CI 쪽 이름으로 덮어쓴다**.
 *
 * 그래서 프로덕션 `kidswiki` Worker 에 연결된 빌드에서 이 설정을 올리면, `kidswiki-preview`
 * 가 아니라 **프로덕션 `kidswiki` 에 버전이 올라간다**. 프로덕션은 DO 를 구현하므로 프리뷰 URL 도
 * 생기지 않고, 바인딩이 빠진 버전이 프로덕션 버전 목록에 쌓인다. 빌드는 성공으로 끝나서
 * 알아채기 어렵다 — 그래서 여기서 미리 끊는다.
 *
 * 해결은 이름을 맞추는 것이다: 저장소를 `kidswiki-preview` Worker 에도 연결하고 브랜치 프리뷰
 * 빌드를 그쪽에서 돌린다(docs/branch-preview.md).
 */
function assertCiNameMatches(previewName) {
    const ciName = process.env.WRANGLER_CI_OVERRIDE_NAME;
    if (!ciName || ciName === previewName) return;

    console.error(
        `[make-preview-config] 중단: 이 빌드는 Worker "${ciName}" 에 연결돼 있는데 프리뷰 설정의\n` +
        `  이름은 "${previewName}" 입니다. 이대로 진행하면 wrangler 가 CI 이름으로 덮어써서\n` +
        `  프리뷰가 아니라 "${ciName}" 에 업로드됩니다.\n` +
        `  → 저장소를 "${previewName}" Worker 에 연결하고 그쪽에서 브랜치 프리뷰 빌드를 돌리세요.\n` +
        '  자세한 절차: docs/branch-preview.md',
    );
    process.exit(1);
}

// 직접 실행할 때만 파일을 쓴다(테스트에서는 import 만 한다).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const { text, previewName, dropped } = buildPreviewConfig(
        readFileSync(SRC, 'utf8'),
        process.env.PREVIEW_WORKER_NAME,
    );
    assertCiNameMatches(previewName);
    writeFileSync(OUT, text, 'utf8');
    console.log(`[make-preview-config] wrangler.preview.toml 생성 완료 (name = "${previewName}")`);
    if (dropped.length) console.log(`[make-preview-config] 제거된 테이블: ${dropped.join(', ')}`);
}
