#!/usr/bin/env node
/**
 * scripts/make-preview-config.mjs 회귀 테스트 — `node --test scripts/make-preview-config.test.mjs`
 *
 * 이 변환기는 정식 TOML 파서가 아니라 줄 단위 스캐너다. 그래서 아래 두 가지가 깨지기 쉽고,
 * 깨져도 **조용히** 잘못된 설정을 뱉는다(= 프로덕션 라우트/크론을 단 프리뷰 Worker).
 *   1) 멀티라인 문자열(`"""`) 안의 `[...]` 를 테이블 헤더로 오인
 *   2) 여러 줄에 걸친 배열 값(`routes = [\n ... \n]`)을 부분만 삭제
 * 실제 wrangler.toml 의 CUSTOM_HEADER/SIDEBAR/FOOTER 가 1) 에 해당하므로 반드시 고정해 둔다.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parse } from 'smol-toml';

import { buildPreviewConfig } from './make-preview-config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'make-preview-config.mjs');
const REAL = readFileSync(join(ROOT, 'wrangler.toml'), 'utf8');

/** buildPreviewConfig 가 항상 앞에 붙이는 고정 배너 줄 수(주석 검사 시 제외용). */
const BANNER_LINES = buildPreviewConfig('name = "x"\n').text.split('\n').findIndex((l) => !l.startsWith('#'));

test('실제 wrangler.toml: 위험 블록만 사라지고 나머지는 그대로다', () => {
    const src = parse(REAL);
    const out = parse(buildPreviewConfig(REAL).text);

    // 프리뷰 URL 을 막던 DO, 그리고 프로덕션에 부수효과를 내는 블록이 제거됐는지.
    assert.equal(out.durable_objects, undefined);
    assert.equal(out.migrations, undefined);
    assert.equal(out.exports, undefined);
    assert.equal(out.triggers, undefined, '크론이 남으면 프로덕션 D1 에 scheduled 핸들러가 중복 실행된다');
    assert.equal(out.routes, undefined, '라우트가 남으면 프리뷰가 프로덕션 도메인을 가로챈다');
    assert.equal(out.queues, undefined, '큐가 남으면 프리뷰가 프로덕션 메시지를 가로채 소비한다');
    assert.equal(out.env, undefined);
    assert.equal(
        out.analytics_engine_datasets, undefined,
        '데이터셋이 남으면 프리뷰 브라우징이 프로덕션 트렌딩·통계를 오염시킨다',
    );

    // 프리뷰가 프리뷰이려면 이름이 달라야 하고, preview_urls 는 최상위여야 한다.
    assert.equal(out.name, `${src.name}-preview`);
    assert.equal(out.preview_urls, true);

    // 나머지는 원본과 동일해야 한다(vars 는 멀티라인 문자열이 많아 특히 중요).
    // ALLOW_CRAWL 만 의도적으로 바뀌므로 그것만 제외하고 대조한다(별도 테스트로 고정).
    assert.deepEqual({ ...out.vars, ALLOW_CRAWL: null }, { ...src.vars, ALLOW_CRAWL: null });
    assert.deepEqual(out.assets, src.assets);
    assert.deepEqual(out.d1_databases, src.d1_databases);
    assert.deepEqual(out.r2_buckets, src.r2_buckets);
    assert.deepEqual(out.kv_namespaces, src.kv_namespaces);
    assert.deepEqual(out.ai_search, src.ai_search);
    assert.deepEqual(out.observability, src.observability);
    assert.equal(out.main, src.main);
    assert.equal(out.compatibility_date, src.compatibility_date);
});

test('멀티라인 문자열 안의 대괄호를 테이블 헤더로 오인하지 않는다', () => {
    const toml = [
        'name = "app"',
        '',
        '[vars]',
        'SIDEBAR = """',
        '[{"type":"link","url":"/x"}]',
        '[[migrations]]',
        '[triggers]',
        '"""',
        'AFTER = "kept"',
        '',
        '[[migrations]]',
        'tag = "v1"',
        'new_sqlite_classes = ["Foo"]',
    ].join('\n');

    const out = parse(buildPreviewConfig(toml).text);
    assert.equal(out.migrations, undefined, '진짜 [[migrations]] 는 제거돼야 한다');
    assert.equal(out.vars.AFTER, 'kept', '문자열 뒤 키까지 통째로 잘려나가면 안 된다');
    assert.match(out.vars.SIDEBAR, /\[\[migrations\]\]/, '문자열 내용은 손대지 않는다');
});

test('여러 줄에 걸친 routes 배열을 통째로 제거한다', () => {
    const toml = [
        'name = "app"',
        'routes = [',
        '  { pattern = "example.com", custom_domain = true },',
        '  { pattern = "www.example.com", custom_domain = true }',
        ']',
        'main = "src/index.ts"',
    ].join('\n');

    const out = parse(buildPreviewConfig(toml).text);
    assert.equal(out.routes, undefined);
    assert.equal(out.main, 'src/index.ts', '배열 뒤 키가 함께 삭제되면 안 된다');
});

test('[[routes]] 테이블 형태와 [exports.*] 도 제거한다', () => {
    const toml = [
        'name = "app"',
        '',
        '[[routes]]',
        'pattern = "example.com"',
        'custom_domain = true',
        '',
        '[exports.MyDO]',
        'type = "durable-object"',
        'storage = "sqlite"',
        '',
        '[observability]',
        'enabled = true',
    ].join('\n');

    const out = parse(buildPreviewConfig(toml).text);
    assert.equal(out.routes, undefined);
    assert.equal(out.exports, undefined);
    assert.equal(out.observability.enabled, true);
});

test('블록 위에 붙은 설명 주석도 블록과 함께 사라진다', () => {
    const toml = [
        'name = "app"',
        '',
        '# === 관리자 잡 러너 Durable Object ===',
        '# AdminJobDO 설명 주석',
        '[[durable_objects.bindings]]',
        'name = "ADMIN_JOB_DO"',
        'class_name = "AdminJobDO"',
        '',
        '[observability]',
        'enabled = true',
    ].join('\n');

    // 배너는 이 변환기가 항상 덧붙이는 고정 머리말이므로 검사 대상에서 제외한다.
    const body = buildPreviewConfig(toml).text.split('\n').slice(BANNER_LINES).join('\n');
    assert.ok(!body.includes('AdminJobDO'));
    assert.ok(!body.includes('=== 관리자 잡 러너'), '고아 주석이 남으면 안 된다');
    assert.ok(!body.includes('설명 주석'), '고아 주석이 남으면 안 된다');
});

test('여러 줄 배열의 continuation 줄이 `[` 로 시작해도 헤더로 오인하지 않는다', () => {
    // 회귀: 깊이 추적이 없으면 `  [1, 2],` 를 테이블 헤더로 읽어 preamble 이 중간에서 잘리고,
    // 뒤에 붙는 preview_urls 가 배열 **안쪽**에 삽입돼 파싱 불가능한 TOML 이 나왔다.
    const toml = ['name = "app"', 'foo = [', '  [1, 2],', ']', 'main = "x"'].join('\n');

    const out = parse(buildPreviewConfig(toml).text);
    assert.deepEqual(out.foo, [[1, 2]]);
    assert.equal(out.main, 'x');
    assert.equal(out.preview_urls, true);
    assert.equal(out.name, 'app-preview');
});

test('큐 consumers 를 제거한다(프로덕션 큐 메시지 가로채기 방지)', () => {
    const toml = ['name = "app"', '', '[[queues.consumers]]', 'queue = "prod-queue"'].join('\n');
    assert.equal(parse(buildPreviewConfig(toml).text).queues, undefined);
});

test('[env.*] 블록을 제거한다(환경 블록에 숨은 DO/triggers 우회 차단)', () => {
    const toml = [
        'name = "app"',
        '[env.staging]',
        'name = "app-staging"',
        '[env.staging.triggers]',
        'crons = ["0 0 * * *"]',
        '[[env.staging.durable_objects.bindings]]',
        'name = "D"',
        'class_name = "C"',
    ].join('\n');
    assert.equal(parse(buildPreviewConfig(toml).text).env, undefined);
});

test('최상위 name 을 테이블 안의 name 키와 혼동하지 않는다', () => {
    // 실제 wrangler.toml 의 [[durable_objects.bindings]] 에 name = "ADMIN_JOB_DO" 가 있다.
    const toml = [
        'name = "app"',
        '[[durable_objects.bindings]]',
        'name = "ADMIN_JOB_DO"',
        'class_name = "AdminJobDO"',
    ].join('\n');
    assert.equal(parse(buildPreviewConfig(toml).text).name, 'app-preview');

    // 최상위 name 없이 테이블 안에만 있으면 그것을 집어 쓰지 말고 실패해야 한다.
    assert.throws(() => buildPreviewConfig('[vars]\nname = "not-top-level"\n'), /name/);
});

test('Analytics Engine 데이터셋을 제거한다(프로덕션 트렌딩·통계 오염 방지)', () => {
    const toml = [
        'name = "app"',
        '',
        '[[analytics_engine_datasets]]',
        'binding = "ANALYTICS"',
        'dataset = "kidswiki"',
    ].join('\n');
    assert.equal(parse(buildPreviewConfig(toml).text).analytics_engine_datasets, undefined);
});

test('preamble 멀티라인 문자열 안의 name 줄을 치환하지 않는다', () => {
    // 회귀: 탐색만 preamble 로 좁히고 치환은 상태 없는 정규식이면 문자열 내용이 훼손된다.
    const toml = ['name = "app"', 'BANNER = """', 'name = "inner"', '"""'].join('\n');

    const out = parse(buildPreviewConfig(toml).text);
    assert.equal(out.name, 'app-preview');
    assert.equal(out.BANNER, 'name = "inner"\n', '멀티라인 문자열 내용은 값이므로 손대면 안 된다');
});

test('멀티라인 문자열이 진짜 name 보다 앞에 와도 올바른 줄을 집는다', () => {
    // 위 테스트는 진짜 name 이 첫 줄이라 "첫 매치"만으로도 우연히 통과한다. 순서를 뒤집어야
    // findTopLevelName 의 문자열 상태 검사가 실제로 검증된다. 이게 깨지면 산출물에 원본 이름이
    // 그대로 남아 **프로덕션 Worker 로 업로드**되는데, 사후 검증도 같은 헬퍼를 쓰므로 함께 눈이 먼다.
    const toml = ['BANNER = """', 'name = "inner"', '"""', 'name = "app"'].join('\n');

    const out = parse(buildPreviewConfig(toml).text);
    assert.equal(out.name, 'app-preview');
    assert.equal(out.BANNER, 'name = "inner"\n');
});

test('배너의 제거 대상 목록이 DROP_TABLES 와 어긋나지 않는다', () => {
    // 하드코딩된 배너는 DROP_TABLES 를 늘릴 때 조용히 낡아 디버깅하는 사람을 오도한다.
    const banner = buildPreviewConfig('name = "app"\n').text
        .split('\n')
        .find((l) => l.startsWith('# 제거된 블록:'));
    assert.ok(banner, '배너에 제거 대상 목록이 있어야 한다');
    for (const table of ['durable_objects', 'migrations', 'triggers', 'queues', 'env',
        'analytics_engine_datasets']) {
        assert.ok(banner.includes(table), `배너에 ${table} 이 빠져 있다`);
    }
});

test('원본의 preview_urls = false 를 true 로 덮어쓴다', () => {
    const out = parse(buildPreviewConfig('name = "app"\npreview_urls = false\nmain = "x"\n').text);
    assert.equal(out.preview_urls, true);
    assert.equal(out.main, 'x');
});

test('CRLF 줄바꿈에서도 동작한다', () => {
    const toml = ['name = "app"', 'main = "x"', '[triggers]', 'crons = ["0 0 * * *"]'].join('\r\n');
    const out = parse(buildPreviewConfig(toml).text);
    assert.equal(out.triggers, undefined);
    assert.equal(out.main, 'x');
    assert.equal(out.name, 'app-preview');
});

test('문자열·주석 안의 대괄호와 따옴표에 속지 않는다', () => {
    const toml = [
        'name = "app"',
        '# 주석 안의 [triggers] 와 짝 없는 따옴표 "',
        'main = "src/index.ts"',
        '[vars]',
        'A = """foo"""',          // 같은 줄에서 열고 닫는 멀티라인
        'B = "a\\"[b"',           // 이스케이프된 따옴표 + 대괄호
        "C = '''",                // 리터럴 멀티라인
        '[[migrations]]',
        "'''",
        'D = "kept"',
        '',
        '[triggers]',
        'crons = ["0 0 * * *"]',
    ].join('\n');

    const out = parse(buildPreviewConfig(toml).text);
    assert.equal(out.main, 'src/index.ts');
    assert.equal(out.triggers, undefined, '진짜 [triggers] 는 제거돼야 한다');
    assert.equal(out.vars.A, 'foo');
    assert.equal(out.vars.B, 'a"[b');
    assert.equal(out.vars.D, 'kept', '멀티라인 문자열 뒤 키가 잘려나가면 안 된다');
});

test('ALLOW_CRAWL 을 꺼서 프리뷰가 색인 가능한 중복 오리진이 되지 않게 한다', () => {
    // 프리뷰 URL 은 공개이고 noindex 도 없다. robots.txt·sitemap·canonical 이 모두 요청 오리진
    // 기준이라, "true" 인 채로 복사되면 브랜치마다 프로덕션과 같은 내용의 색인 대상이 생긴다.
    const toml = [
        'name = "app"',
        '[vars]',
        'ALLOW_CRAWL = "true" # 크롤링 허용',
        'OTHER = "keep"',
    ].join('\n');

    const { text } = buildPreviewConfig(toml);
    const out = parse(text);
    assert.equal(out.vars.ALLOW_CRAWL, 'false');
    assert.equal(out.vars.OTHER, 'keep', '다른 vars 는 건드리면 안 된다');
    assert.match(text, /# 크롤링 허용/, '인라인 주석은 보존한다');
});

test('원본에 ALLOW_CRAWL 이 없으면 추가한다', () => {
    const out = parse(buildPreviewConfig('name = "app"\n[vars]\nA = "1"\n').text);
    assert.equal(out.vars.ALLOW_CRAWL, 'false');
    assert.equal(out.vars.A, '1');
});

test('실제 wrangler.toml 에서 ALLOW_CRAWL 만 바뀐다', () => {
    const src = parse(REAL);
    const out = parse(buildPreviewConfig(REAL).text);
    const changed = Object.keys(src.vars)
        .filter((k) => JSON.stringify(src.vars[k]) !== JSON.stringify(out.vars[k]));
    assert.deepEqual(changed, ['ALLOW_CRAWL']);
    assert.equal(out.vars.ALLOW_CRAWL, 'false');
    assert.equal(Object.keys(out.vars).length, Object.keys(src.vars).length);
});

test('[vars] 서브테이블이 앞에 있어도 진짜 [vars] 를 고른다', () => {
    // 회귀: 첫 세그먼트(root)로 고르면 [vars.FEATURE_FLAGS] 에 값을 써 넣고 진짜 [vars] 는 놓쳐,
    // ALLOW_CRAWL 이 "true" 로 남은 채 조용히 통과한다.
    const toml = [
        'name = "app"',
        '[vars.FEATURE_FLAGS]',
        'beta = true',
        '[vars]',
        'ALLOW_CRAWL = "true"',
    ].join('\n');

    const out = parse(buildPreviewConfig(toml).text);
    assert.equal(out.vars.ALLOW_CRAWL, 'false');
    assert.equal(out.vars.FEATURE_FLAGS.ALLOW_CRAWL, undefined);
    assert.equal(out.vars.FEATURE_FLAGS.beta, true);
});

test('vars 덮어쓰기가 빗나가면 조용히 넘어가지 않고 실패한다', () => {
    // 값이 문자열 리터럴이 아니면 in-place 치환이 안 되고 키가 중복된다(= 깨진 TOML).
    assert.throws(
        () => buildPreviewConfig('name = "app"\n[vars]\nALLOW_CRAWL = true\n'),
        /ALLOW_CRAWL/,
    );
    // 인라인 vars / 점 표기 vars 키는 [vars] 테이블과 키가 충돌한다.
    assert.throws(
        () => buildPreviewConfig('name = "app"\nvars = { ALLOW_CRAWL = "true" }\n'),
        /vars/,
    );
    assert.throws(
        () => buildPreviewConfig('name = "app"\nvars.ALLOW_CRAWL = "true"\n'),
        /vars/,
    );
});

test('preamble 멀티라인 문자열·주석 안의 `vars =` 를 오탐하지 않는다', () => {
    // 이 가드만 스캐너를 안 쓰면, 정상 입력이 근거 없이 거부된다.
    const toml = [
        'name = "app"',
        'NOTE = """',
        'vars = { ALLOW_CRAWL = "true" }',
        '"""',
        '# vars = { x = 1 }',
        '[vars]',
        'ALLOW_CRAWL = "true"',
    ].join('\n');

    const out = parse(buildPreviewConfig(toml).text);
    assert.equal(out.vars.ALLOW_CRAWL, 'false');
    assert.match(out.NOTE, /vars = \{ ALLOW_CRAWL = "true" \}/, '문자열 내용은 값이다');
});

test('멀티라인 문자열 안의 ALLOW_CRAWL 은 건드리지 않는다', () => {
    const toml = [
        'name = "app"',
        '[vars]',
        'CUSTOM_HEADER = """',
        'ALLOW_CRAWL = "true"',
        '"""',
        'ALLOW_CRAWL = "true"',
    ].join('\n');

    const out = parse(buildPreviewConfig(toml).text);
    assert.equal(out.vars.ALLOW_CRAWL, 'false', '진짜 키는 바뀌어야 한다');
    assert.match(out.vars.CUSTOM_HEADER, /ALLOW_CRAWL = "true"/, '문자열 내용은 값이다');
});

test('workers.dev 라우트를 끈다(상시 공개 URL 이 프로덕션 데이터를 노출)', () => {
    // 이 URL 은 프리뷰 URL 이 아니라서 Preview URLs 용 Cloudflare Access 로 막히지 않는다.
    const out = parse(buildPreviewConfig('name = "app"\nworkers_dev = true\n').text);
    assert.equal(out.workers_dev, false);
    assert.equal(out.preview_urls, true, 'workers_dev 를 꺼도 프리뷰 URL 은 켜져 있어야 한다');
});

test('name 줄의 인라인 주석을 보존한다', () => {
    const { text } = buildPreviewConfig('name = "app" # 프로덕션 이름\nmain = "x"\n');
    assert.match(text, /name = "app-preview" # 프로덕션 이름/);
    assert.equal(parse(text).name, 'app-preview');
});

test('CI 가 다른 Worker 를 기대하면 설정을 만들지 않고 실패한다', () => {
    // Workers Builds 는 연결된 Worker 이름을 WRANGLER_CI_OVERRIDE_NAME 으로 주입하고, wrangler 는
    // 이름이 다르면 경고만 남기고 CI 이름으로 덮어쓴다. 그대로 두면 프리뷰가 아니라 프로덕션
    // Worker 에 버전이 올라가는데 빌드는 성공으로 끝나 알아채기 어렵다.
    // PREVIEW_WORKER_NAME 은 문서가 안내하는 재정의 수단이다. 부모 환경에서 새어 들어오면
    // 기대 이름이 바뀌어 이 테스트가 깨지고, preview:deploy 가 테스트를 선행하므로 배포까지 막힌다.
    const run = (ciName) => {
        const env = { ...process.env, WRANGLER_CI_OVERRIDE_NAME: ciName };
        delete env.PREVIEW_WORKER_NAME;
        return spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', env });
    };

    const mismatch = run('kidswiki');
    assert.equal(mismatch.status, 1, '이름이 다르면 0 이 아닌 코드로 죽어야 한다');
    assert.match(mismatch.stderr, /중단/);

    const match = run('kidswiki-preview');
    assert.equal(match.status, 0, '이름이 같으면 정상 생성돼야 한다');
});

test('PREVIEW_WORKER_NAME 재정의를 존중한다', () => {
    const { previewName } = buildPreviewConfig('name = "app"\n', 'custom-name');
    assert.equal(previewName, 'custom-name');
    assert.equal(parse(buildPreviewConfig('name = "app"\n', 'custom-name').text).name, 'custom-name');
});

test('최상위 name 이 없으면 조용히 넘어가지 않고 실패한다', () => {
    assert.throws(() => buildPreviewConfig('[vars]\nFOO = "bar"\n'), /name/);
});
