// Astro 정적 셸 빌드 설정.
//
// Astro 는 이 저장소에서 "셸 HTML 생성기" 로만 쓰인다. 런타임은 Worker(src/index.ts)이고,
// Astro 산출물은 스테이징(.astro-dist)에 떨어진 뒤 scripts/copy-astro-pages.mjs 가
// 필요한 HTML 만 public/ 으로 골라 복사한다. 그래서 아래 4개 값은 빌드 스크립트와의
// 계약이며 임의로 바꾸면 파이프라인이 깨진다:
//
//  - srcDir      : 페이지가 src/astro/pages 에 있다(기본값 src/pages 아님).
//  - outDir      : copy-astro-pages.mjs 의 STAGING 경로와 일치해야 한다.
//  - build.format: 'file' → login.html 처럼 납작한 파일로 떨어진다. 기본값('directory')
//                  이면 login/index.html 이 되어 복사 대상 목록과 어긋난다.
//  - publicDir   : 의도적으로 빈 디렉터리(src/astro/public). 기본값(./public)이면 Vite
//                  산출물·CSS·컴포넌트가 통째로 .astro-dist 에 복사된다.
//
// 주의: 셸은 wrangler.toml 의 브랜딩 값을 빌드 타임에 베이킹하므로(scripts/branding.mjs)
// astro build 전에 wrangler.toml 이 있어야 한다.
import { defineConfig } from 'astro/config';

export default defineConfig({
    srcDir: './src/astro',
    outDir: './.astro-dist',
    publicDir: './src/astro/public',
    build: {
        format: 'file',
    },
});
