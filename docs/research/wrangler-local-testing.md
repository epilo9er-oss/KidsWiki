# KidsWiki 테스트: Wrangler 배포가 필요한가

- 조사일: 2026-08-24
- 갱신일: 2026-08-24 (AI Search 직접 인스턴스 바인딩 반영)

## 결론

**보통은 올릴 필요 없다. 이 프로젝트의 현재 설정에서는 `npm run dev:local`부터 쓰면 된다.** 이 명령은 [`package.json`](../../package.json)의 `wrangler dev --local`을 실행한다. `wrangler dev`는 Worker 코드를 프로덕션과 같은 `workerd` 런타임으로 로컬 실행하고, 설정된 리소스도 기본적으로 로컬에서 시뮬레이션한다. ([Cloudflare: Local development](https://developers.cloudflare.com/workers/local-development/))

반대로 `npm run deploy`의 `wrangler deploy`는 새 버전을 만든 뒤 곧바로 해당 Worker 트래픽 100%에 배포한다. 일상 테스트 명령이 아니라 최종 릴리스 명령이다. ([Cloudflare: Versions & deployments](https://developers.cloudflare.com/workers/versions-and-deployments/))

## 설정 파일 선택 규칙

- `-c`를 생략하면 Wrangler는 현재 디렉터리에서 상위로 올라가며 `wrangler.json` → `wrangler.jsonc` → `wrangler.toml` 순서로 찾는다. 이 순서는 이 프로젝트에 잠긴 Wrangler 4.93.0의 공식 구현에도 명시돼 있다. ([Wrangler 4.93.0 source: config discovery](https://github.com/cloudflare/workers-sdk/blob/ee8857fe29a8afd1c145e6d95ab2ed5a2bdd773d/packages/workers-utils/src/config/config-helpers.ts#L25-L66))
- `wrangler.local.toml`은 자동 탐색 이름이 **아니다**. 다만 명시한 config 경로가 자동 탐색보다 우선하고 `.toml` 확장자는 TOML로 파싱되므로 `npx wrangler dev -c ./wrangler.local.toml` 또는 `npm run dev -- -c ./wrangler.local.toml`로 쓸 수 있다. ([Wrangler 4.93.0 source: explicit config and parser](https://github.com/cloudflare/workers-sdk/blob/ee8857fe29a8afd1c145e6d95ab2ed5a2bdd773d/packages/workers-utils/src/config/index.ts#L113-L120), [Cloudflare: `wrangler dev --config`, `-c`](https://developers.cloudflare.com/workers/wrangler/commands/workers/#dev))
- 설정 파일이 `wrangler.toml`이어도 `wrangler dev`는 기본 로컬 실행이다. 파일명이 모드를 정하지 않으며 `--remote`의 기본값은 `false`다. 단, 설정에 개별 바인딩의 `remote = true`가 있으면 Worker 코드는 로컬이어도 그 바인딩은 원격에 연결된다. 완전 로컬을 강제하려면 `wrangler dev --local`을 쓴다. ([Cloudflare: Local development defaults](https://developers.cloudflare.com/workers/local-development/#defaults), [Wrangler 4.93.0 source: remote default](https://github.com/cloudflare/workers-sdk/blob/ee8857fe29a8afd1c145e6d95ab2ed5a2bdd773d/packages/wrangler/src/dev.ts#L207-L217))

## 이 프로젝트의 최소 로컬 실행

새 로컬 환경에서 [`wrangler example.toml`](../../wrangler%20example.toml)을 복사했다면 D1·R2·KV의 빈 식별자 필드를 제거하고 바인딩 이름만 남긴 뒤, 로컬 D1에 스키마를 넣고 실행한다.

```sh
npm ci
npm run setup:local
npm run dev:local
```

숫자형 사용자 ID를 쓰던 로컬 상태에서 새 Base58 사용자 ID 스키마로 전환할 때는 `.wrangler/state`를 한 번 지운 뒤 `npm run setup:local`을 다시 실행한다. 이 작업은 로컬 D1·KV·R2 테스트 데이터 전체를 지우므로 필요한 자료가 없는 개발 환경에서만 한다.

AI Search는 로컬 시뮬레이션 대신 원격 프록시를 사용한다. 일반 로컬 테스트에서는 `[[ai_search]]` 블록을 주석 처리하고 `RAG_SEARCH_ENABLED = "false"`를 유지한다. 로컬 Worker에서 실제 AI Search를 시험할 때만 바인딩에 `remote = true`를 추가한다.

`--local` D1은 프로덕션과 분리되고, D1은 Cloudflare가 운영하는 것과 같은 버전으로 로컬 개발을 지원한다. 새 로컬 리소스는 비어 있으므로 위 스키마 명령을 최초 한 번 실행해야 하며, 이후 로컬 데이터는 기본적으로 `wrangler dev` 실행 사이에도 유지된다. `.wrangler/state`를 지웠다면 다시 실행한다. ([Cloudflare: Adding local data](https://developers.cloudflare.com/workers/local-development/local-data/), [Cloudflare: D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/))

예제 설정의 `[build] command = "npm run build"`는 `wrangler dev`가 알아서 실행하므로 `npm run build`를 먼저 따로 돌릴 필요도 없다.

## 바인딩 준비 체크리스트

`wrangler dev`/Miniflare는 D1·R2·KV 같은 로컬 리소스를 자동 생성하므로 로컬 테스트를 위해 원격 리소스를 먼저 만들 필요가 없다. 최신 Wrangler는 식별자를 생략한 바인딩 설정을 지원하며, 이 프로젝트에 잠긴 4.93.0의 공식 설정 타입에서도 KV `id`, R2 `bucket_name`, D1 `database_name`/`database_id`는 선택 사항이다. 따라서 예제의 `id = ""`, `bucket_name = ""`, `database_id = ""`처럼 빈 값을 남기지 말고 해당 줄을 제거한다. ([Cloudflare: Automatic resource provisioning](https://developers.cloudflare.com/workers/wrangler/configuration/#automatic-resource-provisioning), [Wrangler 4.93.0 source: optional identifiers](https://github.com/cloudflare/workers-sdk/blob/ee8857fe29a8afd1c145e6d95ab2ed5a2bdd773d/packages/workers-utils/src/config/environment.ts#L850-L995))

| 바인딩 | 로컬 시작 전 준비 |
| --- | --- |
| D1 `DB` | 원격 DB/ID는 불필요. 다만 빈 로컬 DB에 `migrations/schema.sql`을 위 명령으로 최초 한 번 적용한다. |
| R2 `MEDIA`, `RAG_BUCKET` | 원격 버킷/이름은 불필요. 로컬 객체는 `.wrangler/state`에 저장된다. ([Cloudflare: R2 local development](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/#4-access-your-r2-bucket-from-your-worker)) |
| KV `KV` | 원격 namespace/ID는 불필요. 쓰지 않은 키는 로컬에서 `null`이다. ([Cloudflare: KV local development](https://developers.cloudflare.com/kv/get-started/#7-access-your-kv-namespace-from-your-worker)) |
| Durable Object `ADMIN_JOB_DO` | 원격 리소스/ID는 불필요. 예제의 class binding과 migration만 유지하면 인스턴스·상태는 앱 코드가 로컬에 만든다. ([Cloudflare: Adding local data](https://developers.cloudflare.com/workers/local-development/local-data/#durable-objects)) |
| Assets `ASSETS` | 원격 리소스/ID는 불필요. 예제의 `directory = "public"`만 사용한다. |
| Analytics Engine `ANALYTICS` | 바인딩 자체는 로컬 지원되고 리소스 ID가 없다. 다만 이 프로젝트의 통계 조회 라우트는 Cloudflare SQL API를 직접 호출하므로 실제 통계를 보려면 `CF_ACCOUNT_ID`와 `CF_API_TOKEN`이 필요하다. ([Cloudflare: binding support](https://developers.cloudflare.com/workers/local-development/bindings-per-env/), [`src/routes/analytics.ts`](../../src/routes/analytics.ts#L14)) |
| AI Search `AI_SEARCH` | 로컬 시뮬레이션은 없다. 실제 인스턴스를 시험할 때만 `[[ai_search]]` 바인딩에 `remote = true`를 두며 Cloudflare 로그인·원격 사용량이 필요하다. 완전 로컬 테스트라면 블록을 빼고 `RAG_SEARCH_ENABLED = "false"`를 유지한다. ([Cloudflare: AI Search local development](https://developers.cloudflare.com/ai-search/api/search/workers-binding/)) |

`.dev.vars`는 앱을 띄우기 위한 공통 필수 파일이 아니라, 로컬에서 비밀값이 필요한 기능을 시험할 때만 만든다. Cloudflare는 로컬 secret을 설정 파일과 같은 디렉터리의 `.dev.vars` 또는 `.env` 중 하나에 두도록 안내한다. ([Cloudflare: Local secrets](https://developers.cloudflare.com/workers/local-development/environment-variables/#local-development-with-secrets))

- OAuth: `GOOGLE_CLIENT_SECRET`, `DISCORD_CLIENT_SECRET`, `NAVER_CLIENT_SECRET`, 선택적 `KAKAO_CLIENT_SECRET`
- Turnstile 서버 검증: `TURNSTILE_SECRET_KEY`
- 실제 Analytics Engine 통계 조회: `CF_ACCOUNT_ID`, `CF_API_TOKEN`
- Discord 알림: `DISCORD_ADMIN_WEBHOOK_URL`, `DISCORD_COMMUNITY_WEBHOOK_URL`
- Web Push: `VAPID_PRIVATE_KEY` (공개키와 subject는 일반 설정)

AI Search 원격 바인딩 인증은 이 앱의 `.dev.vars` secret이 아니라 Wrangler의 Cloudflare 로그인/계정을 사용한다. 위 선택 기능을 시험하지 않는 기본 UI·로컬 CRUD 테스트라면 `.dev.vars` 없이 시작할 수 있다. 프로젝트가 기대하는 secret 목록은 [`wrangler example.toml`](../../wrangler%20example.toml#L82)에 정리돼 있다.

## 로컬로 충분한 범위

이 프로젝트가 쓰는 Assets, D1, R2, KV, Durable Objects는 모두 로컬 시뮬레이션을 지원한다. 따라서 UI·라우트·CRUD·미디어 업로드·세션/KV·`ADMIN_JOB_DO` 로직은 먼저 로컬에서 확인하면 된다. AI Search만 원격 프록시가 필요하므로 일반 로컬 테스트에서는 해당 블록을 제거하고 `RAG_SEARCH_ENABLED = "false"`를 사용한다. ([Cloudflare: AI Search local development](https://developers.cloudflare.com/ai-search/api/search/workers-binding/))

## 원격이 필요한 경우

- 실제 테스트용 D1/R2/KV가 필요하면 전체를 올리지 말고 해당 바인딩에만 `remote = true`를 둔다. Worker 코드는 계속 로컬에서 돈다. 원격 쓰기·삭제는 실제 데이터를 바꾸므로 프로덕션이 아닌 별도 staging 리소스를 써야 한다. ([Cloudflare: Remote bindings](https://developers.cloudflare.com/workers/local-development/#remote-bindings))
- RAG/AI Search를 켜거나 실제 원격 Durable Object·Cloudflare 네트워크 고유 동작을 확인해야 하면 필요한 바인딩에만 `remote = true`를 둔다. Cloudflare는 `wrangler dev --remote`보다 로컬 실행 + 필요한 원격 바인딩만 쓰는 방식을 우선 권장한다. ([Cloudflare: Remote development](https://developers.cloudflare.com/workers/local-development/#remote-bindings))
- 외부 OAuth 콜백·웹훅·다른 기기에서 로컬 서버로 들어와야 할 뿐이라면 배포 대신 `wrangler dev --tunnel`로 공개 URL을 만들 수 있다. ([Cloudflare: Share a local dev server](https://developers.cloudflare.com/workers/local-development/local-dev-tunnels/))

## 이 프로젝트의 프리뷰 주의점

`wrangler versions upload`는 프로덕션에 배포하지 않고 Preview URL을 만들 수 있지만, Cloudflare는 **Durable Object를 구현하는 Worker에는 Preview URL을 생성하지 않는다.** ([Cloudflare: Preview URLs](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/))

그래서 [`scripts/make-preview-config.mjs`](../../scripts/make-preview-config.mjs)는 DO·migrations·cron·routes·queues·Analytics Engine을 제거한 별도 `<name>-preview` Worker 설정을 만든다.

- 최초 프리뷰 Worker 생성: `npm run preview:init`
- 이후 버전 프리뷰: `npm run preview:deploy`
- 제한: 프리뷰에서는 `ADMIN_JOB_DO` 기능을 테스트할 수 없다.
- 위험: 생성된 설정은 원본 D1·R2·KV 바인딩을 복사하므로, 원본이 프로덕션 리소스를 가리키면 프리뷰의 쓰기도 프로덕션 데이터를 바꾼다. 프리뷰에는 격리된 바인딩을 써야 한다.

따라서 순서는 **`npm run dev:local` → 필요한 경우에만 원격 바인딩/터널 → 격리된 프리뷰 → 마지막에 `npm run deploy`**가 맞다.
