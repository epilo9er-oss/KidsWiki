# Cloudflare 배포 임시 메모

> 2026-08-24 기준 초안. 첫 배포가 끝나면 실제 도메인과 운영 절차를 반영해 정식 문서로 옮긴다.

## 현재 상태

- [x] npm 설치 및 로컬 빌드/타입 검사
- [x] 로컬 D1 스키마 적용
- [x] `wrangler dev --local` 확인
- [x] Cloudflare Workers 온보딩 및 `workers.dev` 서브도메인 등록
- [ ] R2 구독 활성화 (결제수단 등록이 필요해 보류)
- [ ] 운영용 D1, R2, KV 생성
- [ ] 운영 변수와 Secret 설정
- [ ] 원격 D1 스키마 적용
- [ ] Worker 배포 및 스모크 테스트

## 1. `workers.dev` 서브도메인이란?

Cloudflare 계정마다 한 번 정하는 Worker용 기본 주소다. 별도 도메인을 구매하거나 DNS 레코드를 직접 만드는 작업이 아니다.

예를 들어:

- 계정 서브도메인: `my-kidswiki`
- `wrangler.toml`의 Worker 이름: `kidswiki`
- 최종 기본 주소: `https://kidswiki.my-kidswiki.workers.dev`

등록 방법:

1. 오류 메시지의 Cloudflare 온보딩 링크를 로그인한 상태로 연다.
2. 또는 Dashboard의 **Workers &amp; Pages**로 이동한다.
3. **Your subdomain** 옆의 **Change**를 누르고 원하는 계정 서브도메인을 정한다.

이 등록은 앞서 사용한 원격 개발 프록시와 기본 배포 주소에 필요하다. 운영 주소는 나중에 별도 Custom Domain으로 연결할 수 있다.

## 2. R2 오류 `10042`

이 오류는 패키지 매니저나 명령 문법 문제가 아니다. 현재 Cloudflare 계정에 R2 구독이 활성화되지 않아 버킷 생성 요청이 거절된 것이다.

현재는 결제 카드 등록을 진행하지 않기로 해 이 단계에서 배포 작업을 보류했다. 실패한 명령에서는 `kidswiki-media` 버킷이 생성되지 않았으며, 재개할 때 아래 절차부터 이어간다.

1. Dashboard에서 **Storage &amp; databases &gt; R2 &gt; Overview**로 이동한다.
2. R2 체크아웃 절차를 완료해 계정에 R2 구독을 추가한다.
3. R2는 월별 무료 포함량이 있지만, 사용을 시작하려면 이 구독 절차를 먼저 완료해야 한다. 무료 포함량 초과 사용분은 과금될 수 있다.
4. 활성화 후 버킷 목록을 확인하고 생성 명령을 다시 실행한다.

```sh
npx wrangler r2 bucket list
npx wrangler r2 bucket create kidswiki-media \
  --location apac --binding MEDIA --update-config
```

목록에 `kidswiki-media`가 이미 있으면 다시 만들지 말고 `wrangler.toml`의 `MEDIA` 블록에 다음 값만 넣는다.

```toml
[[r2_buckets]]
binding = "MEDIA"
bucket_name = "kidswiki-media"
```

## 3. 운영 리소스 생성

먼저 로그인한 계정을 확인한다.

```sh
npx wrangler login
npx wrangler whoami
```

아직 없는 리소스만 만든다.

```sh
npx wrangler d1 create kidswiki-db \
  --location apac --binding DB --update-config

npx wrangler r2 bucket create kidswiki-media \
  --location apac --binding MEDIA --update-config

npx wrangler kv namespace create kidswiki-kv \
  --binding KV --update-config
```

`--update-config`가 성공하면 `wrangler.toml`의 주석 처리된 값이 아래 형태로 채워져야 한다. 같은 binding 블록이 중복으로 생기지 않았는지만 확인한다.

```toml
[[d1_databases]]
binding = "DB"
database_name = "kidswiki-db"
database_id = "<Cloudflare가 발급한 ID>"

[[r2_buckets]]
binding = "MEDIA"
bucket_name = "kidswiki-media"

[[kv_namespaces]]
binding = "KV"
id = "<Cloudflare가 발급한 ID>"
```

초기 배포에서 RAG 검색을 쓰지 않을 경우 다음 두 블록은 값만 비워 두지 말고 **블록 전체를 주석 처리**한다. `RAG_SEARCH_ENABLED = "false"`는 그대로 둔다.

```toml
# [[r2_buckets]]
# binding = "RAG_BUCKET"
# bucket_name = "..."

# [ai]
# binding = "AI"
```

`ANALYTICS`와 `ADMIN_JOB_DO`는 현재 설정대로 배포하며 별도 ID를 채우지 않는다.

## 4. 배포 전 운영 값

`wrangler.toml`에서 최소한 다음 값을 실제 주소와 운영 값으로 바꾼다.

- `GOOGLE_REDIRECT_URI`, `DISCORD_REDIRECT_URI`: 배포 주소의 OAuth callback
- `MEDIA_PUBLIC_URL`: `https://<배포주소>/media`
- `WIKI_PUBLIC_BASE_URL`: `https://<배포주소>`
- `GOOGLE_CLIENT_ID`, `DISCORD_CLIENT_ID`: 실제로 활성화할 OAuth 공급자의 값
- `SUPER_ADMIN_EMAILS`: 실제 관리자 이메일
- 첫 확인 전에는 `MCP_MODE = "disabled"`, `ALLOW_CRAWL = "false"` 권장
- 비공개 테스트라면 `WIKI_VISIBILITY = "closed"` 검토

Secret 값은 `wrangler.toml`에 쓰거나 Git에 커밋하지 않는다. 첫 Worker 배포 후, 사용하는 기능의 값만 등록한다.

```sh
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put DISCORD_CLIENT_SECRET
```

다음 Secret은 해당 기능을 쓸 때만 추가한다.

- `TURNSTILE_SECRET_KEY`
- `CF_ACCOUNT_ID`, `CF_API_TOKEN` (관리자 통계 조회)
- `DISCORD_ADMIN_WEBHOOK_URL`, `DISCORD_COMMUNITY_WEBHOOK_URL`
- `VAPID_PRIVATE_KEY`

## 5. 원격 스키마와 배포

리소스 ID가 연결된 뒤 운영 D1에 스키마를 적용한다. 이 명령은 로컬 DB가 아니라 원격 DB를 변경한다.

```sh
npx wrangler d1 execute DB --remote --file=migrations/schema.sql
npm run deploy
```

배포 후 Secret을 등록했다면 한 번 더 배포하고 다음을 확인한다.

- `/` 응답
- OAuth callback 주소 일치 여부
- 이미지 업로드 및 `/media` 조회
- 관리자 계정 인식
- `MCP_MODE`, 크롤링, 공개 범위 설정

## 참고

- [Cloudflare Workers: workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
- [Cloudflare R2: Get started](https://developers.cloudflare.com/r2/get-started/)
