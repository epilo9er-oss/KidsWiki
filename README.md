# 키즈위키 (KidsWiki)

Cloudflare 프리티어만으로 돌아가는 서버리스 위키입니다. 마크다운에 확장 문법을 더해 문서를 컴포넌트 조립식 페이지처럼 구성하고, MCP 연동으로 AI의 외장 지식 저장소로도 씁니다.

## 핵심 특징

- **프리티어 셀프호스팅** — Cloudflare Workers · D1 · R2 · KV 위에서 동작합니다. 트래픽이 늘어도 Workers Paid 전환만으로 대응합니다.
- **컴포넌트 조립식 문서** — 마크다운과 호환되는 확장 문법으로 카드 · 그리드 · 탭 · 콜아웃 · 버튼을 조립해 문서 한 장을 페이지처럼 구성합니다.
- **MCP 외장 지식 저장소** — MCP 서버를 내장해 AI 에이전트가 위키를 검색 · 열람 · 편집합니다.
- **공개 · 비공개 운영** — 문서 · 카테고리 단위 ACL, 회원가입 정책, 위키 공개 설정을 지원합니다.

## 기술 스택

| 영역 | 사용 기술 |
| --- | --- |
| 런타임 | Cloudflare Workers (서버리스) |
| 프레임워크 | [Hono](https://hono.dev/) |
| 데이터베이스 | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite 기반) |
| 오브젝트 스토리지 | [Cloudflare R2](https://developers.cloudflare.com/r2/) (미디어 업로드) |
| Key-Value | [Cloudflare KV](https://developers.cloudflare.com/kv/) (사이드바 설정 · 동시편집 충돌 감지) |
| 보안 · API | [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) (캡차), Web Push API |
| 언어 | TypeScript |
| 프런트엔드 | Bootstrap 5 & Bootstrap Icons, Material Design Icons, Astro, Marked.js, DOMPurify, CodeMirror 6, PrismJS, jsdiff, SweetAlert2, Chart.js |

## 시작하기

1. Cloudflare에서 D1 · R2 · KV를 생성합니다.
2. `wrangler example.toml`을 `wrangler.toml`로 복사하고 바인딩 ID와 도메인, `SUPER_ADMIN_EMAILS`를 채웁니다.
3. OAuth(Google / Discord) 제공자를 최소 하나 설정합니다.
4. D1에 `migrations/schema.sql`을 실행해 스키마를 적용합니다.
5. `npm install && npm run deploy` 또는 Cloudflare Workers에 이 저장소를 연결해 배포합니다.

위키 이름 · 로고 · 테마 · 레이아웃 등 브랜딩은 모두 `wrangler.toml`의 `[vars]`에서 바꿉니다. 코드에 남은 `KidsWiki` 문자열은 빌드/런타임에 `WIKI_NAME` 값으로 치환되는 플레이스홀더입니다.

## 라이선스

MIT. 이 프로젝트는 [CloudWiki](https://github.com/eoeoe22/cloudwiki-public) (© 2026 eoeoe22)를 기반으로 합니다.
