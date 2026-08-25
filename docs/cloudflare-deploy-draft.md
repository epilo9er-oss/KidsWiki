# Cloudflare 배포 임시 메모

> 2026-08-24 기준 초안. 첫 배포가 끝나면 실제 도메인과 운영 절차를 반영해 정식 문서로 옮긴다.

## 현재 상태

- [x] npm 설치 및 로컬 빌드/타입 검사
- [x] 로컬 D1 스키마 적용
- [x] `wrangler dev --local` 확인
- [x] Cloudflare Workers 온보딩 및 `workers.dev` 서브도메인 등록
- [x] R2 구독 활성화
- [x] 운영용 D1, KV 생성
- [x] 운영용 R2(`kidswiki-media`, `kidswiki-rag`) 생성
- [x] AI Search `kidswiki-rag-search` 생성
- [ ] 운영 변수와 Secret 설정
- [x] 원격 D1 스키마 적용
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

## 2. R2 활성화와 오류 `10042`

이 오류는 패키지 매니저나 명령 문법 문제가 아니다. 현재 Cloudflare 계정에 R2 구독이 활성화되지 않아 버킷 생성 요청이 거절된 것이다.

이 계정은 2026-08-24에 R2를 활성화하고 `kidswiki-media`, `kidswiki-rag` 버킷 생성을 완료했다. 다른 계정에서 같은 오류가 나면 아래 절차로 활성화한다.

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

RAG 검색을 쓰면 인덱싱 전용 버킷과 그 버킷을 데이터 소스로 사용하는 AI Search 인스턴스도 생성한다. AI Search 인스턴스는 계정에 자동 생성되는 `default` namespace를 사용한다.

```sh
npx wrangler r2 bucket create kidswiki-rag --location apac
npx wrangler ai-search create kidswiki-rag-search \
  --type r2 --source kidswiki-rag
```

이미 생성된 경우 다시 만들지 말고 조회한다.

```sh
npx wrangler r2 bucket list
npx wrangler ai-search list
```

리소스 생성 후 `wrangler.toml`은 아래 형태여야 한다. `--update-config`가 추가한 블록과 기존 블록이 중복되지 않았는지 확인한다.

```toml
[[d1_databases]]
binding = "DB"
database_name = "kidswiki-db"
database_id = "<Cloudflare가 발급한 ID>"

[[r2_buckets]]
binding = "MEDIA"
bucket_name = "kidswiki-media"

[[r2_buckets]]
binding = "RAG_BUCKET"
bucket_name = "kidswiki-rag"

[[ai_search]]
binding = "AI_SEARCH"
instance_name = "kidswiki-rag-search"
remote = true

[[kv_namespaces]]
binding = "KV"
id = "<Cloudflare가 발급한 ID>"
```

초기 배포에서 RAG 검색을 쓰지 않을 경우 다음 두 블록은 값만 비워 두지 말고 **블록 전체를 주석 처리**한다. `RAG_SEARCH_ENABLED = "false"`는 그대로 둔다.

```toml
# [[r2_buckets]]
# binding = "RAG_BUCKET"
# bucket_name = "..."

# [[ai_search]]
# binding = "AI_SEARCH"
# instance_name = "..."
# remote = true
```

RAG를 쓰는 운영 설정에서는 위 두 블록을 활성화하고 `[vars]`에 `RAG_SEARCH_ENABLED = "true"`를 둔다. 직접 인스턴스 바인딩이 이름을 가지므로 `RAG_AUTORAG_NAME`은 사용하지 않는다. `binding` 값은 코드와 맞게 각각 `RAG_BUCKET`, `AI_SEARCH`로 유지한다. `remote = true`는 로컬 dev에서도 실제 AI Search 인스턴스를 사용한다는 표시이며 원격 사용량이 발생한다.

`ANALYTICS`와 `ADMIN_JOB_DO`는 현재 설정대로 배포하며 별도 ID를 채우지 않는다.

## 4. 배포 전 운영 값

`wrangler.toml`에서 최소한 다음 값을 실제 주소와 운영 값으로 바꾼다.

- `GOOGLE_REDIRECT_URI`, `DISCORD_REDIRECT_URI`, `NAVER_REDIRECT_URI`, `KAKAO_REDIRECT_URI`: 활성화할 공급자의 배포 OAuth callback
- `MEDIA_PUBLIC_URL`: `https://<배포주소>/media`
- `WIKI_PUBLIC_BASE_URL`: `https://<배포주소>`
- `GOOGLE_CLIENT_ID`, `DISCORD_CLIENT_ID`, `NAVER_CLIENT_ID`, `KAKAO_CLIENT_ID`: 실제로 활성화할 OAuth 공급자의 값
- `SUPER_ADMIN_EMAILS`: 실제 관리자 이메일
- 첫 확인 전에는 `MCP_MODE = "disabled"`, `ALLOW_CRAWL = "false"` 권장
- 비공개 테스트라면 `WIKI_VISIBILITY = "closed"` 검토

Secret 값은 `wrangler.toml`에 쓰거나 Git에 커밋하지 않는다. 첫 Worker 배포 후, 사용하는 기능의 값만 등록한다.

```sh
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put DISCORD_CLIENT_SECRET
npx wrangler secret put NAVER_CLIENT_SECRET
# 카카오 앱에서 Client Secret 기능을 켠 경우에만
npx wrangler secret put KAKAO_CLIENT_SECRET
```

네이버 앱에는 서비스 URL과 `/auth/naver/callback`을 등록하고, 제공 정보에서 회원 식별자와 이메일을 허용한다. 카카오 앱에는 `/auth/kakao/callback`을 Redirect URI로 등록하고 동의 항목의 닉네임·프로필 사진·카카오계정(이메일)을 설정한다. 공급자가 이메일을 내려주지 않거나 카카오 이메일이 유효·인증 상태가 아니면 기존 계정에 수동 연결은 가능하지만 그 공급자로 신규 가입은 할 수 없다. ([네이버 로그인 개발가이드](https://developers.naver.com/docs/login/devguide/devguide.md), [Kakao Login REST API](https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api))

여러 공급자의 이메일이 같아도 서버는 자동 병합하지 않는다. 새 공급자 로그인 뒤 기존 계정의 기본 공급자로 다시 인증하거나, 로그인된 상태에서 마이페이지의 **로그인 계정**에서 직접 연결해야 한다. 기본 로그인 수단은 해제할 수 없고 보조 수단만 해제할 수 있다.

다음 Secret은 해당 기능을 쓸 때만 추가한다.

- `TURNSTILE_SECRET_KEY`
- `CF_ACCOUNT_ID`, `CF_API_TOKEN` (관리자 통계 조회)
- `DISCORD_ADMIN_WEBHOOK_URL`, `DISCORD_COMMUNITY_WEBHOOK_URL`
- `VAPID_PRIVATE_KEY`

## 5. 원격 스키마와 배포

리소스 ID가 연결된 뒤 운영 D1에 스키마를 적용한다. 이 명령은 로컬 DB가 아니라 원격 DB를 변경한다.

> 숫자형 `users.id`를 사용하던 개발 DB가 있다면 이번에는 증분 적용할 수 없다. `users.id`와 모든 사용자 참조가 22자리 Base58 `TEXT`로 바뀌었으므로, 출시 전 D1을 새로 만들고 `wrangler.toml`의 `database_id`를 새 값으로 교체한 뒤 아래 스키마를 적용한다. 기존 숫자 ID가 든 `session:*` KV 캐시는 새 코드가 자동 폐기하므로 KV namespace를 다시 만들 필요는 없다. R2도 ID 전환 때문에 지울 필요는 없지만, D1 미디어 행도 초기화되므로 기존 객체는 더 이상 참조되지 않는다.

```sh
npx wrangler d1 execute DB --remote --file=migrations/schema.sql
npm run deploy
```

RAG를 처음 켠 배포라면 최고 관리자로 `/admin-bulk-manage`에 접속해 **RAG 백필**을 한 번 실행한다. 이 작업은 기존 문서의 현행 본문을 `RAG_BUCKET`에 복사하며, 이후 문서 편집은 자동으로 미러링된다. AI Search의 다음 R2 동기화가 끝났는지 확인한다.

```sh
npx wrangler ai-search stats kidswiki-rag-search
```

`wrangler secret put`은 새 Worker 버전을 만들어 바로 배포하므로 Secret 등록 뒤 별도 재배포는 필요 없다. 다음을 확인한다.

- `/` 응답
- OAuth callback 주소 일치 여부
- 이미지 업로드 및 `/media` 조회
- `/search`의 RAG 본문 검색과 MCP `search_rag`
- 관리자 계정 인식
- `MCP_MODE`, 크롤링, 공개 범위 설정

## 6. 커스텀 도메인을 구매한 뒤

기존 D1, KV, R2를 다시 만들 필요는 없다. 같은 Worker에 새 공개 주소를 연결하고, 주소를 사용하는 설정만 바꾼다.

아래 예시는 운영 주소를 `https://wiki.example.com`으로 정한 경우다. 루트 도메인을 쓸 경우 `wiki.example.com` 대신 `example.com`을 넣는다.

### 6.1. 도메인을 Cloudflare에 연결

구매한 도메인이 이 Worker와 같은 Cloudflare 계정의 활성 Zone이어야 한다. 다른 등록업체에서 구매했다면 먼저 Cloudflare에 사이트를 추가하고 안내된 네임서버로 변경한다.

`wrangler.toml` 최상단의 `[build]`보다 앞에 다음을 추가한다. `pattern`에는 `https://`나 경로를 넣지 않는다.

```toml
# 전환 확인 중에는 기존 workers.dev 주소도 유지
workers_dev = true

[[routes]]
pattern = "wiki.example.com"
custom_domain = true
```

Custom Domain에서는 Worker가 원본 서버가 되며, Cloudflare가 필요한 DNS 레코드와 TLS 인증서를 관리한다.

### 6.2. 공개 URL과 OAuth 콜백 변경

같은 `wrangler.toml`의 `[vars]`에서 다음 값을 바꾼다.

```toml
GOOGLE_REDIRECT_URI = "https://wiki.example.com/auth/google/callback"
NAVER_REDIRECT_URI = "https://wiki.example.com/auth/naver/callback"
KAKAO_REDIRECT_URI = "https://wiki.example.com/auth/kakao/callback"
MEDIA_PUBLIC_URL = "https://wiki.example.com/media"
WIKI_PUBLIC_BASE_URL = "https://wiki.example.com"
```

Discord 로그인을 활성화했다면 `DISCORD_REDIRECT_URI`도 `https://wiki.example.com/auth/discord/callback`으로 바꾼다. 사용하지 않는 공급자의 변수는 생략해도 된다. D1/KV/R2 바인딩 ID, OAuth Client ID, Secret은 그대로 사용한다. 로컬 개발용 `.dev.vars`의 localhost callback 값도 바꾸지 않는다.

Google Cloud Console의 OAuth 클라이언트에는 배포 전에 다음 승인된 리디렉션 URI를 정확히 추가한다.

```text
https://wiki.example.com/auth/google/callback
```

현재 구현은 서버 측 OAuth라 **승인된 JavaScript 원본**은 필수가 아니다. 이미 원본을 등록해 관리하고 있다면 `https://wiki.example.com`도 추가한다.

네이버 개발자 센터와 Kakao Developers에도 각각 위의 정확한 callback URI를 등록한다. 코드를 먼저 배포할 때는 `AUTH_PROVIDERS = "google"`처럼 기존 공급자만 유지하고, 앱 심사·동의 항목·Secret 등록을 마친 뒤 `naver`, 다음 `kakao`를 한 개씩 추가해 로그인과 마이페이지 계정 연결을 확인한다.

### 6.3. 배포하고 기존 주소 정리

```sh
npm run deploy
```

새 도메인에서 홈페이지, Google 로그인 콜백, `/media` 조회를 확인한다. 도메인이 달라지면 브라우저 쿠키도 별개이므로 기존 사용자는 새 주소에서 다시 로그인해야 한다.

확인이 끝나면 중복 공개 주소를 남기지 않도록 `workers_dev = false`로 바꾸고 다시 배포한다. 그 뒤 Google Cloud Console에서 기존 `workers.dev` 콜백을 제거해도 된다.

프리뷰 설정 생성기는 운영 `routes`를 자동으로 제외하므로 `wrangler.preview.toml`을 따로 수정하지 않는다.

## 참고

- [Cloudflare Workers: workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
- [Cloudflare Workers: Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Cloudflare R2: Get started](https://developers.cloudflare.com/r2/get-started/)
- [Cloudflare AI Search: Wrangler](https://developers.cloudflare.com/ai-search/get-started/wrangler/)
- [Cloudflare AI Search: Workers binding](https://developers.cloudflare.com/ai-search/api/search/workers-binding/)
