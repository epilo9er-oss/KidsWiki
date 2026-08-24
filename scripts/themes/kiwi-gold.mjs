// 골드키위 — 옅은 골드 헤더 + 초록 보조. 더 따뜻함. (WIKI_THEME 키 "kiwi-gold").
//
// 브랜드는 KidsWiki 를 줄인 KiWi(키위)다. 색은 "적당한 초록" 이 아니라 과일 자체에서 온다 —
// 껍질의 갈색, 과육의 밝은 연두, 씨앗의 검정, 속살의 크림.
//
// ── 키위 팔레트의 핵심 제약 ────────────────────────────────────────────────────
// 밝은 과육색(#8fbc45)은 **라이트 모드에서 텍스트로 쓸 수 없다** — 크림 지면 위 2.06:1 로
// AA 근처에도 못 간다. 그런데 과일 자체가 답을 준다: 밝은 과육 위의 씨앗 검정은 6.92:1 이다.
// 그래서 밝은 연두는 **채움 전용**, 텍스트용 초록은 따로 진한 값을 둔다.
//
// 다크 모드는 정확히 반대다. 어두운 지면에서는 밝은 과육이 텍스트로 쓸 수 있게 되고, 대신
// 씨앗 검정을 글자로 못 쓴다. 그래서 primary(채움 배경 + 표면 위 텍스트를 겸하는 듀얼-롤)는
// 모드별로 명도를 뒤집고 --wiki-btn-text 도 함께 뒤집는다.
//
// AA: 본문·보조·강조·강조hover·버튼글자·보조강조·헤더글자·헤더브랜드 11개 역할 쌍을 라이트/
// 다크 양쪽에서 계산해 전부 4.5:1 이상을 확인했다. 시맨틱색(success/warning/danger/diff/공지/
// callout)은 관습 의미를 지키려 베이스를 그대로 둔다.
//
// 비-색 토큰(서체·모서리·간격·행간)은 스킨이 아니라 public/css/style.css 의 :root 가 갖는다 —
// 브랜드 공통이라 5종이 같은 값을 쓰기 때문이다. 이 파일은 색만 담당한다.

/** @type {import('./index.mjs').ThemeDefinition} */
export default {
    root: {
        // ── 중성 표면(테마색은 강조와 헤더에 한정) ──
        '--wiki-bg': 'light-dark(#f8f8f8, #121212)',
        '--wiki-bg-alt': 'light-dark(#f0f0f0, #0d0d0d)',
        '--wiki-card-bg': 'light-dark(#ffffff, #1c1c1c)',
        '--wiki-text': 'light-dark(#2b2718, #f2eddc)',
        '--wiki-text-muted': 'light-dark(#6a6350, #aca591)',
        '--wiki-border': 'light-dark(#dedede, #303030)',
        '--wiki-border-focus': 'light-dark(#6d5a12, #e2bb52)',
        '--wiki-hr-color': 'light-dark(#d6d6d6, #292929)',

        // 듀얼-롤 primary — 라이트는 진한 초록(텍스트 가능), 다크는 밝은 과육(어두운 면 위 텍스트).
        '--wiki-primary': 'light-dark(#6d5a12, #e2bb52)',
        '--wiki-primary-hover': 'light-dark(#54460c, #f0d183)',
        '--wiki-accent': 'light-dark(#4f7a2a, #a8cf62)',
        // 채움 위 글자색 — primary 명도가 모드별로 뒤집히므로 이것도 함께 뒤집는다.
        '--wiki-btn-text': 'light-dark(#ffffff, #181509)',
        // 라이트 primary 트리플렛. 다크는 dark 그룹에서 재정의(light-dark() 로 트리플렛 분기 불가).
        '--wiki-primary-rgb': '109, 90, 18',
        '--wiki-focus-ring-color': 'rgba(109, 90, 18, 0.24)',

        // ── 표면 ──
        '--wiki-code-bg': 'light-dark(#f3f3f3, #0d0d0d)',
        '--wiki-toc-bg': 'light-dark(rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.05))',
        '--wiki-glass-bg': 'light-dark(rgba(255, 255, 255, 0.9), #1c1c1ce6)',
        '--wiki-glass-border': 'light-dark(rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0.06))',

        // ── 헤더 ──
        '--wiki-header-bg': 'light-dark(#eee5cb, #302c21)',
        '--wiki-header-border': 'light-dark(#d2c39b, #554c32)',
        '--wiki-header-text': 'light-dark(#2b2718, #f7f1de)',
        '--wiki-header-brand': 'light-dark(#2b2718, #e2bb52)',
    },
    dark: {
        // 다크 트리플렛(= #e2bb52).
        '--wiki-primary-rgb': '226, 187, 82',
        // 어두운 표면 위 포커스 링은 불투명도를 올려야 보인다.
        '--wiki-focus-ring-color': 'rgba(226, 187, 82, 0.5)',
    },
};
