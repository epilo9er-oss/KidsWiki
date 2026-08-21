// 키위 단면 — 흰 헤더 + 과육색 얇은 선. 색면 최소. (WIKI_THEME 키 "kiwi-slice").
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
        // ── 팔레트(라이트=속살 크림 계열 지면, 다크=씨앗 계열 지면) ──
        '--wiki-bg': 'light-dark(#fbfbf4, #16180f)',
        '--wiki-bg-alt': 'light-dark(#f2f2e6, #0f110a)',
        '--wiki-card-bg': 'light-dark(#ffffff, #1f2217)',
        '--wiki-text': 'light-dark(#23261c, #eef0e4)',
        '--wiki-text-muted': 'light-dark(#5f6551, #a8ad98)',
        '--wiki-border': 'light-dark(#e0e0cf, #2f3324)',
        '--wiki-border-focus': 'light-dark(#47691c, #a8cf62)',
        '--wiki-hr-color': 'light-dark(#d8d8c4, #2a2e20)',

        // 듀얼-롤 primary — 라이트는 진한 초록(텍스트 가능), 다크는 밝은 과육(어두운 면 위 텍스트).
        '--wiki-primary': 'light-dark(#47691c, #a8cf62)',
        '--wiki-primary-hover': 'light-dark(#375314, #c3e089)',
        '--wiki-accent': 'light-dark(#7a5a34, #d0a86e)',
        // 채움 위 글자색 — primary 명도가 모드별로 뒤집히므로 이것도 함께 뒤집는다.
        '--wiki-btn-text': 'light-dark(#ffffff, #16180f)',
        // 라이트 primary 트리플렛. 다크는 dark 그룹에서 재정의(light-dark() 로 트리플렛 분기 불가).
        '--wiki-primary-rgb': '71, 105, 28',
        '--wiki-focus-ring-color': 'rgba(71, 105, 28, 0.22)',

        // ── 표면 ──
        '--wiki-code-bg': 'light-dark(#f5f5e9, #0f110a)',
        '--wiki-toc-bg': 'light-dark(rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.05))',
        '--wiki-glass-bg': 'light-dark(rgba(255, 255, 255, 0.9), #1f2217e6)',
        '--wiki-glass-border': 'light-dark(rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0.06))',

        // ── 헤더 ──
        '--wiki-header-bg': 'light-dark(#ffffff, #1f2217)',
        '--wiki-header-border': 'light-dark(#8fbc45, #8fbc45)',
        '--wiki-header-text': 'light-dark(#23261c, #eef0e4)',
        '--wiki-header-brand': 'light-dark(#47691c, #a8cf62)',
    },
    dark: {
        // 다크 트리플렛(= #a8cf62).
        '--wiki-primary-rgb': '168, 207, 98',
        // 어두운 표면 위 포커스 링은 불투명도를 올려야 보인다.
        '--wiki-focus-ring-color': 'rgba(168, 207, 98, 0.5)',
    },
};
