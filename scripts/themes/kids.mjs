// 키즈 — 크레용 놀이터(따뜻한 크림 지면 + 라즈베리·그레이프 2색) 스킨 (WIKI_THEME 키 "kids").
//
// 컨셉: 차가운 흰 종이 대신 **따뜻한 크림(#fff8ef)** 지면에 흰 카드를 얹고, 라즈베리
// (#c2255c)와 그레이프(#7048c6) 두 색만 강조로 쓴다. 헤더는 두 색을 잇는 그라데이션 바,
// 모서리는 전 스케일을 키워 푹신하게, 제목은 둥근 한글 서체(Jua)로 쓴다.
//
// 색 이상으로 **읽기 밀도**도 조정한다: 행간을 1.7/1.8 → 1.8/1.9 로 벌린다(한글 장문 가독성).
// 산문 폭은 베이스 66ch 를 유지한다 — 독자는 아이가 아니라 육아 정보를 찾는 부모이고,
// 문서에 표·그래프가 많이 들어가므로 폭을 좁히면 손해가 크다.
//
// ── 토큰만으로 어디까지 재현되나(설계 한계) ─────────────────────────────────────────
// 테마 엔진은 `:root` 에 CSS 변수만 베이킹하고 새 셀렉터·규칙은 주입하지 못한다. 따라서
// 색·서체·모서리·행간·여백은 전부 반영되지만, "일러스트 삽화", "손그림 테두리", 아이콘
// 교체처럼 마크업·규칙이 필요한 요소는 이 파일로 불가하다(style.css 나 컴포넌트를 고쳐야
// 한다). 모서리는 셸(style.css)과 본문(render.css)이 같은 radius 스케일을 공유하므로 전
// 스케일을 함께 키워야 모서리가 섞이지 않는다(--wiki-radius-full 알약은 유지).
//
// 라이트·다크 양벌(다크 전용 아님). 다크는 크림 대신 짙은 자보라(#171320)로 같은 두 색의
// 밝은 변형을 얹는다.
//
// AA 메모 — 아래 역할 쌍을 전부 계산해 4.5:1 이상을 확인했다(WCAG 2.x 상대휘도):
//  - 라이트: text 14.3:1, muted 5.7:1, primary as text 5.4:1(크림)·5.7:1(흰 카드),
//    흰 글자 on primary 채움 5.7:1, primary-hover as text 7.5:1, accent as text 5.8:1.
//  - 다크:   text 16.2:1, muted 8.0:1, primary as text 9.5:1, 어두운 btn-text
//    (#3d0a22) on primary 채움 8.7:1, accent as text 8.9:1.
//  - 그라데이션 헤더의 흰 글자: 라이트 양 끝 5.7:1·6.1:1, 다크 양 끝 11.8:1·12.1:1.
//  - 듀얼-롤 주의: primary 는 "채움 배경"과 "표면 위 텍스트" 두 역할을 겸하므로 라이트는
//    진한 라즈베리, 다크는 밝은 핑크로 분리하고 btn-text 를 모드별로 뒤집었다.
//  - 시맨틱색(success/warning/danger/diff/공지/callout)은 베이스 유지 — 경고·오류의 관습색을
//    바꾸면 학습된 의미가 깨지고 블라스트 반경만 커진다.
//
// 제목 서체 Jua 는 **weight 400 단독**이라 굵은 제목은 브라우저 합성(faux bold)으로 그려진다.
// 둥근 디스플레이 서체라 합성 굵기가 크게 튀지 않아 허용했다. 본문은 가독성 우선으로
// 디스플레이 서체를 쓰지 않고 Noto Sans KR(이미 로드됨)을 쓴다.
//
// 새 웹폰트(Jua) → src/shared/cdn.ts FONTS.ui 에 동기화함.

/** @type {import('./index.mjs').ThemeDefinition} */
export default {
    root: {
        // ── 팔레트(따뜻한 크림 지면 + 흰 카드) ──
        '--wiki-bg': 'light-dark(#fff8ef, #171320)',
        '--wiki-bg-alt': 'light-dark(#ffefdd, #100d16)',
        '--wiki-card-bg': 'light-dark(#ffffff, #221c2e)',
        '--wiki-text': 'light-dark(#2b2430, #f4f0f5)',
        '--wiki-text-muted': 'light-dark(#6b5f70, #b3a8bb)',
        '--wiki-border': 'light-dark(#ecdcc6, #332b42)',
        '--wiki-border-focus': 'light-dark(#c2255c, #ff9ec4)',
        '--wiki-hr-color': 'light-dark(#e5d3ba, #2e2740)',

        // 라즈베리 primary / 그레이프 accent — 강조는 이 둘로만 제한한다.
        '--wiki-primary': 'light-dark(#c2255c, #ff9ec4)',
        '--wiki-primary-hover': 'light-dark(#a01048, #ffc4dc)',
        '--wiki-accent': 'light-dark(#7048c6, #c4a8f5)',
        // 채움 위 글자색: 라이트=흰색(진한 라즈베리 위) / 다크=짙은 자주(밝은 핑크 위).
        '--wiki-btn-text': 'light-dark(#ffffff, #3d0a22)',
        // 라이트 primary 트리플렛(= #c2255c). 다크는 dark 그룹에서 재정의.
        '--wiki-primary-rgb': '194, 37, 92',
        '--wiki-focus-ring-color': 'rgba(194, 37, 92, 0.22)',

        // ── 표면 ──
        '--wiki-code-bg': 'light-dark(#fff3e2, #100d16)',
        '--wiki-toc-bg': 'light-dark(rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.06))',
        // 크림 지면 위에서 카드/패널/로그인 카드가 분리돼 보이도록 표면을 지면보다 밝게 둔다
        // (지면색과 같은 값이면 로그인 카드가 배경에 녹아 사라진다 — 실측으로 확인해 수정).
        '--wiki-glass-bg': 'light-dark(rgba(255, 255, 255, 0.9), rgba(34, 28, 46, 0.85))',
        '--wiki-glass-border': 'light-dark(rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0.06))',

        // ── 헤더 — 라즈베리→그레이프 그라데이션 바 ──
        // 그라데이션은 <color> 가 아니라 <image> 라 light-dark() 로 감쌀 수 없다.
        // root 에 라이트값(양 모드 적용) → dark 그룹에서 다크값으로 재정의한다.
        '--wiki-header-bg': 'linear-gradient(135deg, #c2255c 0%, #7048c6 100%)',
        '--wiki-header-border': 'light-dark(#a81f50, #2b1e4d)',
        // 양 모드 그라데이션이 모두 어두우므로 전경은 모드 불변 흰색.
        '--wiki-header-text': '#ffffff',
        '--wiki-header-brand': '#ffffff',

        // ── 비-색 토큰: 둥근 한글 제목 서체 + 큰 모서리 + 넉넉한 읽기 밀도 ──
        '--wiki-font-heading': "'Jua', 'Noto Sans KR', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        '--wiki-font-body': "'Noto Sans KR', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        '--wiki-radius-xs': '6px',
        '--wiki-radius-sm': '10px',
        '--wiki-radius-md': '12px',
        '--wiki-radius-base': '14px',
        '--wiki-radius-lg': '18px',
        '--wiki-radius-xl': '24px',
        '--wiki-radius-2xl': '32px',
        // 읽기 밀도 — 행간만 벌린다.
        //
        // 독자는 아이가 아니라 **부모(성인)** 다. 아이는 주제이고 청중은 육아 정보를 찾는
        // 학부모·미취학아동 부모·예비 부모다. 그래서 산문 폭(--wiki-measure)은 베이스
        // 66ch 를 그대로 쓴다 — 예방접종 일정표·성장 곡선·월령별 비교표가 들어가는 문서라
        // 폭을 좁히면 표와 이미지가 먼저 손해를 본다.
        //
        // 행간만 베이스보다 벌린다. 이건 어린 독자와 무관하게 성립하는 이유다: 한글 장문은
        // 라틴 문자보다 글자 밀도가 높아 같은 행간에서 더 빽빽하게 읽힌다.
        '--wiki-space-4': '1.1rem',
        '--wiki-lh-loose': '1.8',
        '--wiki-lh-spacious': '1.9',
    },
    dark: {
        // 다크 트리플렛(= #ff9ec4).
        '--wiki-primary-rgb': '255, 158, 196',
        // 어두운 표면 위 포커스 링은 불투명도를 올려야 보인다(라이트 0.22 → 다크 0.5).
        '--wiki-focus-ring-color': 'rgba(255, 158, 196, 0.5)',
        // 다크 그라데이션 헤더(같은 두 색의 저명도 변형).
        '--wiki-header-bg': 'linear-gradient(135deg, #6d1234 0%, #3d2a6b 100%)',
    },
};
