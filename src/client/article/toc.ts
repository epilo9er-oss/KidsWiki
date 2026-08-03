// @ts-nocheck — 문서 구조(목차)·읽기/Raw 모드 공유 컨트롤러(전역 위키·워크스페이스 공용).
// 두 셸이 동일한 DOM 마커를 쓰므로 ID 는 고정이다:
//   본문 #articleContent / 문서 래퍼 #articlePage / 목차 소스 #tocNav /
//   플로팅 목차 #tocFloatingPanel·#tocFloatingNav / 사이드바 목차 #wikiTocSidebarNav·
//   #wikiTocSidebarRightNav / 스크롤바 목차 레일 #tocScrollRail /
//   FAB 그룹 #scrollFabGroup / 읽기·Raw 종료 FAB.
// 스크롤스파이/플로팅/모드 상태는 인스턴스에 캡슐화한다. 프레젠테이션 문서의 읽기 모드
// 토글 시 재렌더만 셸별로 다르므로 onReadingModeToggled 콜백으로 위임한다.
// 동작은 과거 index.ts 의 목차/읽기/Raw 모드 블록과 동일하다.

export interface TocControllerOptions {
  /** 읽기 모드 토글 직후 호출(프레젠테이션 문서 재렌더 등 셸별 후처리). */
  onReadingModeToggled?: (active: boolean) => void;
}

export function createTocController(opts: TocControllerOptions = {}) {
  let spyLastId: string | null = null;
  let spyAttached = false;

  // ── 우측 스크롤바 목차 레일 상수 ──
  // 레일은 뷰포트 우측 끝(스크롤바 옆)에 고정되며, 상단/하단 여백으로 헤더·스크롤 FAB 그룹을 피한다.
  // 값은 style.css `.toc-rail` 의 top/bottom 과 반드시 같아야 한다(JS 가 이 범위 안에서 좌표를 계산).
  const RAIL_TOP_INSET = 72;     // px
  // 레일이 뜨는 조건(헤딩 2개 이상 → 목차 존재)에서는 FAB 이 최소 3개(목차/맨 위로/맨 아래로)
  // 보이므로 그룹 높이 3*36+2*8=124px, 하단 여백 24px → 그룹 상단이 148px. 그 위에서 끝낸다.
  const RAIL_BOTTOM_INSET = 152; // px
  // 점의 히트 박스 높이(style.css `--toc-rail-hit-h` 기본값)와 같은 값이어야 인접 박스가 겹치지
  // 않는다 — 겹치면 뒤 형제가 히트 테스트를 가져가 "가리킨 점"과 "열리는 카드"가 어긋난다.
  const RAIL_MIN_GAP = 22;       // px
  // 점이 이보다 촘촘해지면(헤딩 수백 개) 히트 박스를 줄여도 겹침을 피할 수 없어 "가리킨 점"과
  // "열리는 카드"가 어긋난다. 그 밀도에서는 어피던스 자체가 무의미하므로 레일을 띄우지 않는다.
  const RAIL_MIN_DOT_GAP = 4;    // px
  const RAIL_MIN_HEIGHT = 240;   // px — 이보다 낮은 뷰포트에서는 레일을 띄우지 않는다
  let railRebuildTimer: number | null = null;
  let railLayoutTimer: number | null = null;
  // 마지막으로 만든 점 구성의 시그니처(헤딩 id·레벨·라벨). 같으면 재구축 대신 좌표만 갱신한다 —
  // {timer:} 초 단위 갱신처럼 헤딩과 무관한 본문 변경이 옵저버를 계속 깨우기 때문.
  let railSignature = '';

  // ── 목차 사이드바 채우기 (헤딩 번호 포함) ──
  function populateSidebar(sidebarId: string, navId: string): boolean {
    const sidebar = document.getElementById(sidebarId);
    const nav = document.getElementById(navId);
    if (!sidebar || !nav) return false;
    const contentEl = document.getElementById('articleContent');
    const realHeadings = contentEl
      ? Array.from(contentEl.querySelectorAll(
          'h1:not(.accordion-header), h2:not(.accordion-header), h3:not(.accordion-header), h4:not(.accordion-header)'))
          .filter((h) => !h.closest('.wiki-footnotes'))
      : [];
    if (!realHeadings.length) {
      sidebar.classList.add('d-none');
      nav.innerHTML = '';
      return false;
    }
    let html = (contentEl && typeof window.buildTocOlHtml === 'function')
      ? window.buildTocOlHtml(contentEl, true)
      : '';
    if (!html) {
      const src = document.getElementById('tocNav');
      html = src ? src.innerHTML.trim() : '';
    }
    if (!html) {
      sidebar.classList.add('d-none');
      nav.innerHTML = '';
      return false;
    }
    nav.innerHTML = html;
    sidebar.classList.remove('d-none');
    // 재구축된 사이드바 목차에 temporal(:::after/:::until) 숨김 필터를 재적용.
    // buildTocOlHtml 은 숨김 분기 헤딩도 포함해 생성하고, 이 재구축은
    // renderWikiContent 내부의 _initTemporal 동기화보다 늦게 실행되기 때문.
    window._syncTemporalDerivedVisibility?.(document);
    return true;
  }

  // ── 플로팅 목차 패널 ──
  function toggleFloating() {
    const panel = document.getElementById('tocFloatingPanel');
    const tocSource = document.getElementById('tocNav');
    const floatingNav = document.getElementById('tocFloatingNav');
    if (!panel || !floatingNav) return;
    const isVisible = panel.classList.contains('visible');

    if (!isVisible) {
      // temporal(:::after/:::until) 필터로 전 항목이 숨겨진 목차는 없는 것으로 취급
      // (raw innerHTML 은 숨김 li 도 포함하므로 보이는 항목 기준으로 판정).
      if (!tocSource || !tocSource.querySelector('li:not([hidden])')) return;
      floatingNav.innerHTML = tocSource.innerHTML;
      floatingNav.querySelectorAll('a').forEach((a) => {
        a.addEventListener('click', () => {
          panel.classList.remove('visible');
        });
      });
      spyLastId = null;
      updateActive();
    }
    panel.classList.toggle('visible');
  }

  // ── 우측 스크롤바 목차 레일 (PC 전용) ──
  // 본문 헤딩 하나당 점 하나를 문서 내 위치 비율대로 뷰포트 우측 끝에 배치한다(미니맵 매핑).
  // 호버하면 점이 좌측으로 펼쳐지며 목차 제목 카드가 되고, 클릭하면 FAB 목차와 동일한 경로
  // (_resolveAnchorTarget → _scrollToElementWithAncestors)로 해당 헤딩까지 스크롤한다.
  // 목차 패널·사이드바와 같은 목차를 포인터 전용으로 중복 제공하므로 키보드/스크린리더 경로는
  // 기존 목차가 담당한다(컨테이너 aria-hidden, 점은 포커스 대상이 아닌 span).

  /** 레일을 띄울 조건인지: PC 폭 + 포인터 호버 가능 + 문서 페이지 노출 + Raw 모드 아님. */
  function railEligible(): boolean {
    const articlePage = document.getElementById('articlePage');
    if (!articlePage || articlePage.classList.contains('d-none')) return false;
    if (document.body.classList.contains('raw-mode')) return false;
    if (window.innerHeight - RAIL_TOP_INSET - RAIL_BOTTOM_INSET < RAIL_MIN_HEIGHT) return false;
    if (typeof window.matchMedia !== 'function') return false;
    // CSS 의 노출 조건(min-width:992px + hover:hover)과 일치시켜, 숨겨질 레일을 계산하지 않는다.
    return window.matchMedia('(min-width: 992px)').matches && window.matchMedia('(hover: hover)').matches;
  }

  /** 목차에 노출되는(=temporal 숨김이 아니고 실제로 렌더된) 본문 헤딩 목록. */
  function railHeadings(): HTMLElement[] {
    const contentEl = document.getElementById('articleContent');
    if (!contentEl) return [];
    return Array.from(contentEl.querySelectorAll(
      'h1:not(.accordion-header), h2:not(.accordion-header), h3:not(.accordion-header), h4:not(.accordion-header)'))
      .filter((h) => {
        if (!h.id) return false;
        if (h.closest('.wiki-temporal[hidden]')) return false;
        // 숨겨진 조상 아래의 헤딩은 좌표가 0 이라 레일 위치를 계산할 수 없다.
        return !!(h.offsetWidth || h.offsetHeight || h.getClientRects().length);
      }) as HTMLElement[];
  }

  /** 헤딩 하나의 레일 라벨(본문 번호 prefix + 제목) — 사이드바 목차와 같은 표기.
   *  `key` 는 재구축 판정용이다. 헤딩 안에 라이브 `{timer:}` 가 있으면 텍스트가 초마다 바뀌어
   *  매초 전면 재구축이 되므로, 그 헤딩만 본문 텍스트를 빼고 id·레벨·번호로 판정한다.
   *  헤딩 id 는 텍스트가 아니라 위치 기반(`s-1.2`)이므로 트레이드오프가 있다 — 아웃라인이
   *  그대로인 채 타이머 헤딩의 제목만 바뀌면 카드 라벨 갱신을 놓친다(초당 재구축을 피하는 대가). */
  function railLabelOf(h: HTMLElement): { num: string; text: string; key: string } {
    const numSpan = h.querySelector('.wiki-heading-num');
    let text = '';
    h.childNodes.forEach((n) => { if (n !== numSpan) text += n.textContent; });
    text = text.trim();
    return {
      num: numSpan ? (numSpan.textContent || '').trim() : '',
      text,
      key: h.querySelector('.wiki-timer') ? '' : text,
    };
  }

  /** 이상적 위치(문서 내 비율)를 최소 간격 제약에 맞게 보정해 레일 좌표를 확정한다. */
  function layoutRailPositions() {
    const rail = document.getElementById('tocScrollRail');
    if (!rail) return;
    const dots = Array.from(rail.querySelectorAll('.toc-rail-dot')) as HTMLElement[];
    if (!dots.length) return;
    const railHeight = window.innerHeight - RAIL_TOP_INSET - RAIL_BOTTOM_INSET;
    // 레일을 띄우지 않는 높이에서는 좌표가 음수가 되어 점이 헤더 쪽으로 튄다. syncRail 이
    // 리사이즈 디바운스 후 레일을 비우지만, 그 사이 잔상이 보이지 않도록 여기서도 막는다.
    if (railHeight < RAIL_MIN_HEIGHT) return;
    const docHeight = Math.max(document.documentElement.scrollHeight, 1);

    let ys: number[];
    if (dots.length > 1 && (dots.length - 1) * RAIL_MIN_GAP >= railHeight) {
      // 헤딩이 너무 많아 최소 간격을 지킬 수 없으면 균등 분배로 전환한다(레일 밖으로 넘치지 않게).
      const step = railHeight / (dots.length - 1);
      ys = dots.map((_, i) => i * step);
    } else {
      // 접힌 <details> 안 등 렌더되지 않은 헤딩은 rect 가 0 이라 위치를 알 수 없다. 0 으로 두면
      // docY 가 scrollY 가 되어 점이 스크롤에 따라 튀고 최소 간격 보정이 이웃까지 끌고 가므로,
      // 직전 점 좌표를 물려받아 순서만 유지한다(재구축 시점에 목록에서 빠져 정리된다).
      let lastY = 0;
      ys = dots.map((dot) => {
        const target = document.getElementById(dot.dataset.tocRailId || '');
        const rect = target ? target.getBoundingClientRect() : null;
        if (!rect || (!rect.width && !rect.height)) return lastY;
        lastY = Math.min(Math.max((rect.top + window.scrollY) / docHeight, 0), 1) * railHeight;
        return lastY;
      });
      // 앞→뒤로 최소 간격 확보 후, 넘친 만큼 뒤→앞으로 되밀어 레일 범위 안에 가둔다.
      // 이 분기의 진입 조건이 (n-1)*GAP < railHeight 이므로 되민 결과의 ys[0] 도 항상 양수다
      // (ys[0] >= railHeight - (n-1)*GAP > 0) — 별도 하한 clamp 는 두지 않는다.
      for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + RAIL_MIN_GAP);
      for (let i = ys.length - 1; i > 0; i--) {
        if (ys[i] > railHeight) ys[i] = railHeight;
        ys[i - 1] = Math.min(ys[i - 1], ys[i] - RAIL_MIN_GAP);
      }
    }

    // 실제 간격보다 히트 박스가 크면 뒤 형제가 앞 점의 원 위를 덮어 "가리킨 점"과 "열리는 카드"가
    // 어긋난다(균등 분배 폴백에서 간격이 RAIL_MIN_GAP 미만이 될 수 있다). 최소 간격에 맞춰 줄이되,
    // 간격은 실제로 찍히는 정수 좌표 기준으로 재야 반올림분(최대 1px)만큼 다시 겹치지 않는다.
    const tops = ys.map((y) => Math.round(y));
    let minGap = RAIL_MIN_GAP;
    for (let i = 1; i < tops.length; i++) minGap = Math.min(minGap, tops[i] - tops[i - 1]);
    if (minGap < RAIL_MIN_DOT_GAP) { rail.hidden = true; return; }
    rail.hidden = false;
    dots.forEach((dot, i) => { dot.style.top = `${tops[i]}px`; });
    rail.style.setProperty('--toc-rail-hit-h', `${Math.floor(minGap)}px`);
  }

  /** 좌표 재계산 디바운스(이미지 로드 등으로 본문 높이가 계속 변할 때 과다 계산 방지). */
  function scheduleRailLayout(delay = 120) {
    if (railLayoutTimer !== null) clearTimeout(railLayoutTimer);
    railLayoutTimer = window.setTimeout(() => {
      railLayoutTimer = null;
      layoutRailPositions();
    }, delay);
  }

  /** 레일을 현재 문서 헤딩으로 다시 만든다(멱등). 조건 미충족 시 비우고 숨긴다. */
  function syncRail() {
    const rail = document.getElementById('tocScrollRail');
    if (!rail) return;
    const headings = railEligible() ? railHeadings() : [];
    if (headings.length < 2) {
      // 헤딩이 하나뿐이면 이동 대상이 사실상 없으므로 레일을 띄우지 않는다.
      rail.innerHTML = '';
      rail.classList.remove('visible');
      rail.hidden = false;
      railSignature = '';
      return;
    }

    const entries = headings.map((h) => {
      const { num, text, key } = railLabelOf(h);
      return { id: h.id, level: Math.min(Math.max(parseInt(h.tagName[1], 10), 1), 4), num, text, key };
    });
    // 필드·항목 경계를 구분자로 남긴다 — 단순 연결이면 서로 다른 헤딩 구성이 같은 문자열이 되어
    // 점이 실제 헤딩과 어긋난 채 유지될 수 있다.
    const signature = entries.map((e) => `${e.level}\x1f${e.id}\x1f${e.num}\x1f${e.key}`).join('\x1e');
    if (signature === railSignature && rail.querySelector('.toc-rail-dot')) {
      // 헤딩 구성이 그대로면 DOM 을 갈아엎지 않는다 — 호버 중인 카드가 파괴되지 않고,
      // {timer:} 같은 초 단위 본문 갱신에서 매번 전체 재생성이 일어나지 않는다.
      layoutRailPositions();
      return;
    }

    // 헤딩 제목은 사용자 입력이므로 문자열 조립 대신 textContent 로 넣는다.
    // 포인터 전용 어피던스(컨테이너 aria-hidden)이므로 button 이 아닌 span 을 쓴다 —
    // button 은 클릭 시 포커스가 aria-hidden 서브트리로 들어가 접근성 검사에 걸린다.
    const frag = document.createDocumentFragment();
    entries.forEach((e) => {
      const dot = document.createElement('span');
      dot.className = `toc-rail-dot toc-rail-lv${e.level}`;
      dot.dataset.tocRailId = e.id;
      const label = document.createElement('span');
      label.className = 'toc-rail-label';
      if (e.num) {
        const numEl = document.createElement('span');
        numEl.className = 'toc-rail-num';
        numEl.textContent = e.num;
        label.appendChild(numEl);
        label.appendChild(document.createTextNode(' '));
      }
      label.appendChild(document.createTextNode(e.text));
      dot.appendChild(label);
      frag.appendChild(dot);
    });
    rail.replaceChildren(frag);
    rail.classList.add('visible');
    railSignature = signature;
    layoutRailPositions();
    // 새 점에 현재 활성 헤딩 표시를 즉시 반영(SPA 전환 직후엔 스파이 값이 이전 문서 기준이다).
    // 여기서 updateActive() 를 부르면 레일 밖(목차 nav)까지 class 를 바꿔 아래 MutationObserver
    // 가드를 빠져나가고 재구축이 무한히 재예약되므로, 레일 표시만 직접 갱신한다.
    updateRailActive(findCurrentHeadingId());
  }

  /** 스크롤스파이 활성 헤딩을 레일 점에 반영. */
  function updateRailActive(currentId: string | null) {
    const rail = document.getElementById('tocScrollRail');
    if (!rail) return;
    rail.querySelectorAll('.toc-rail-dot.toc-active').forEach((d) => d.classList.remove('toc-active'));
    if (!currentId) return;
    const dot = rail.querySelector(`.toc-rail-dot[data-toc-rail-id="${CSS.escape(currentId)}"]`);
    if (dot) dot.classList.add('toc-active');
  }

  /** 짧은 디바운스로 레일 재구축을 예약(연속 DOM 변경·리사이즈에서 과다 계산 방지). */
  function scheduleRailSync(delay = 120) {
    if (railRebuildTimer !== null) clearTimeout(railRebuildTimer);
    railRebuildTimer = window.setTimeout(() => {
      railRebuildTimer = null;
      syncRail();
    }, delay);
  }

  function onRailClick(e: Event) {
    const dot = (e.target as Element).closest('.toc-rail-dot');
    if (!dot) return;
    const id = (dot as HTMLElement).dataset.tocRailId;
    if (!id) return;
    const target = typeof window._resolveAnchorTarget === 'function'
      ? window._resolveAnchorTarget(id)
      : document.getElementById(id);
    if (!target) return;
    history.pushState(null, '', `#${encodeURIComponent(id)}`);
    if (typeof window._scrollToElementWithAncestors === 'function') {
      window._scrollToElementWithAncestors(target, { behavior: 'smooth', block: 'start' });
    } else {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ── 스크롤 스파이 ──
  function findCurrentHeadingId(): string | null {
    const articleContent = document.getElementById('articleContent');
    if (!articleContent) return null;
    const headings = articleContent.querySelectorAll('h1, h2, h3, h4');
    if (!headings.length) return null;

    const offset = 120;
    let currentId: string | null = null;
    for (const h of headings) {
      if (!h.id) continue;
      const rect = h.getBoundingClientRect();
      if (rect.top - offset <= 0) {
        currentId = h.id;
      } else {
        break;
      }
    }
    if (!currentId) {
      for (const h of headings) {
        if (h.id) { currentId = h.id; break; }
      }
    }
    return currentId;
  }

  function updateActive() {
    const articlePage = document.getElementById('articlePage');
    if (!articlePage || articlePage.classList.contains('d-none')) return;
    const currentId = findCurrentHeadingId();
    if (!currentId) return;
    if (currentId === spyLastId) return;
    spyLastId = currentId;

    ['tocNav', 'tocFloatingNav', 'wikiTocSidebarNav', 'wikiTocSidebarRightNav'].forEach((navId) => {
      const nav = document.getElementById(navId);
      if (!nav) return;
      nav.querySelectorAll('a.toc-active').forEach((a) => a.classList.remove('toc-active'));
      nav.querySelectorAll('a').forEach((a) => {
        const href = a.getAttribute('href') || '';
        if (href.slice(1) === currentId) a.classList.add('toc-active');
      });
    });

    updateRailActive(currentId);

    const floatingNav = document.getElementById('tocFloatingNav');
    const panel = document.getElementById('tocFloatingPanel');
    if (floatingNav && panel && panel.classList.contains('visible')) {
      const activeLink = floatingNav.querySelector('a.toc-active');
      if (activeLink) {
        const navRect = floatingNav.getBoundingClientRect();
        const linkRect = activeLink.getBoundingClientRect();
        if (linkRect.top < navRect.top || linkRect.bottom > navRect.bottom) {
          activeLink.scrollIntoView({ block: 'nearest' });
        }
      }
    }

    // docs/right-toc 우측 목차 사이드바: 활성 항목이 사이드바 스크롤 영역 밖으로 밀려나면
    // 사이드바 내부 스크롤만 조정해 다시 보이게 한다(플로팅 목차 패널과 동일하게 스크롤스파이
    // 갱신 시점에만 실행). 스크롤 컨테이너는 nav 가 아니라 aside(#wikiTocSidebarRight,
    // overflow-y:auto)이며, sticky 사이드바에서 scrollIntoView 는 윈도우 스크롤까지 유발할 수
    // 있으므로 컨테이너 scrollTop 만 직접 보정한다.
    const rightSidebar = document.getElementById('wikiTocSidebarRight');
    if (rightSidebar && !rightSidebar.classList.contains('d-none')) {
      const activeLink = rightSidebar.querySelector('a.toc-active');
      if (activeLink) {
        const boxRect = rightSidebar.getBoundingClientRect();
        const linkRect = activeLink.getBoundingClientRect();
        // temporal(:::after/:::until) 숨김 헤딩에 활성 표시가 걸리면 그 목차 링크의 li 는
        // [hidden] 이라 rect 가 0 이 된다. 이 경우 top(0) < boxRect.top 가 참이 되어 사이드바를
        // 잘못 위로 스냅하므로, 렌더되지 않는(rect 0) 링크는 보정 대상에서 제외한다
        // (FAB 의 scrollIntoView 가 비렌더 대상에서 no-op 인 것과 동일한 방어).
        if (linkRect.width || linkRect.height) {
          if (linkRect.top < boxRect.top) {
            rightSidebar.scrollTop -= boxRect.top - linkRect.top;
          } else if (linkRect.bottom > boxRect.bottom) {
            rightSidebar.scrollTop += linkRect.bottom - boxRect.bottom;
          }
        }
      }
    }
  }

  /** 렌더 직후/레이아웃 변동 시 스파이 재계산(여러 프레임 보정). */
  function refresh() {
    spyLastId = null;
    updateActive();
    // 섹션 접기/펼치기 등으로 문서 높이가 바뀌면 레일 점 좌표도 다시 계산해야 한다.
    layoutRailPositions();
    [90, 200, 340, 450].forEach((d) => setTimeout(() => {
      spyLastId = null;
      updateActive();
      layoutRailPositions();
    }, d));
  }

  function interceptTocLinkClick(e: Event) {
    const a = (e.target as Element).closest && (e.target as Element).closest('a[href^="#"]');
    if (!a) return;
    const hash = a.getAttribute('href');
    if (!hash || hash.length < 2) return;
    let id: string;
    try { id = decodeURIComponent(hash.slice(1)); } catch (_) { id = hash.slice(1); }
    const target = id && typeof window._resolveAnchorTarget === 'function'
      ? window._resolveAnchorTarget(id)
      : (id ? document.getElementById(id) : null);
    if (!target) return;
    e.preventDefault();
    history.pushState(null, '', hash);
    if (typeof window._scrollToElementWithAncestors === 'function') {
      window._scrollToElementWithAncestors(target, { behavior: 'smooth', block: 'start' });
    } else {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function attachLinkInterceptors() {
    ['tocNav', 'tocFloatingNav', 'wikiTocSidebarNav'].forEach((navId) => {
      const nav = document.getElementById(navId);
      if (nav && !nav._tocLinkIntercepted) {
        nav.addEventListener('click', interceptTocLinkClick);
        nav._tocLinkIntercepted = true;
      }
    });
  }

  /** 스크롤 스파이 + 링크 인터셉터 + FAB 가시성 옵저버 부착(멱등). */
  function attachSpy() {
    attachLinkInterceptors();
    if (spyAttached) return;
    spyAttached = true;

    let ticking = false;
    const handler = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        updateActive();
        ticking = false;
      });
    };
    // 스크롤·리사이즈 모두에서 활성 헤딩 재계산(리사이즈/방향전환 시 좌표 변동 반영).
    window.addEventListener('scroll', handler, { passive: true });
    window.addEventListener('resize', handler, { passive: true });

    // 목차 레일: 클릭 위임 + 리사이즈 시 재구축(PC/모바일 경계 통과로 노출 조건이 바뀐다).
    const rail = document.getElementById('tocScrollRail');
    if (rail) {
      rail.addEventListener('click', onRailClick);
      window.addEventListener('resize', () => scheduleRailSync(160), { passive: true });
      // 이미지·폰트 로드로 본문 높이가 늘면 문서 내 비율이 달라지지만 mutation 은 발생하지
      // 않으므로(옵저버가 못 잡는다) 본문 크기 자체를 관찰해 좌표를 다시 계산한다.
      const contentEl = document.getElementById('articleContent');
      if (contentEl && typeof ResizeObserver === 'function') {
        new ResizeObserver(() => scheduleRailLayout()).observe(contentEl);
      } else {
        window.addEventListener('load', () => scheduleRailLayout(0));
      }
    }

    // 스크롤 FAB 그룹 표시/숨김 — 200px 이상 스크롤하면 노출(읽기/Raw 모드 중에는 유지).
    const fabGroup = document.getElementById('scrollFabGroup');
    if (fabGroup) {
      window.addEventListener('scroll', () => {
        if (window.scrollY > 200) {
          fabGroup.classList.add('visible');
        } else if (!document.body.classList.contains('reading-mode') && !document.body.classList.contains('raw-mode')) {
          fabGroup.classList.remove('visible');
        }
      }, { passive: true });
    }

    document.addEventListener('transitionend', (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (e.propertyName && e.propertyName !== 'grid-template-rows') return;
      if (t.classList && t.classList.contains('wiki-section-body')) refresh();
    });
    document.addEventListener('toggle', (e) => {
      const t = e.target as Element;
      if (t && t.tagName === 'DETAILS') refresh();
    }, true);

    const tocCollapse = document.getElementById('collapseTOC');
    if (tocCollapse) {
      ['show.bs.collapse', 'hide.bs.collapse', 'shown.bs.collapse', 'hidden.bs.collapse'].forEach((ev) =>
        tocCollapse.addEventListener(ev, refresh));
    }

    // 문서 페이지가 아니거나 목차가 없으면 TOC FAB 숨김.
    const observer = new MutationObserver((mutations) => {
      // 레일 재구축 트리거. 두 종류의 변경은 무시해야 한다:
      //  ① 레일 자체의 DOM 변경 — 재구축이 자기 자신을 다시 예약하는 순환이 된다.
      //  ② 스크롤스파이가 목차 nav 링크에 붙였다 떼는 .toc-active — 스크롤 중 활성 헤딩이
      //     바뀔 때마다 레일을 통째로 다시 만들게 된다(구조 변경이 아니므로 재구축 불필요).
      //  ③ 스크롤 FAB 그룹의 .visible 토글 — 위 스크롤 핸들러가 스크롤마다 classList.add 를
      //     호출하고, DOMTokenList 는 토큰이 그대로여도 attribute 갱신 record 를 남기므로
      //     제외하지 않으면 스크롤 내내 디바운스가 리셋된다.
      //  ④ {timer:} 의 초 단위 textContent 갱신 — 헤딩 구성과는 무관하다.
      const railEl = document.getElementById('tocScrollRail');
      const isRailNoise = (m: MutationRecord) => {
        const t = m.target;
        if (railEl && railEl.contains(t)) return true;
        if (!(t instanceof Element)) return false;
        if (t.id === 'scrollFabGroup') return true;
        if (t.classList.contains('wiki-timer')) return true;
        return t.tagName === 'A'
          && !!t.closest('#tocNav, #tocFloatingNav, #wikiTocSidebarNav, #wikiTocSidebarRightNav, .wiki-toc-card-nav');
      };
      if (!mutations.every(isRailNoise)) scheduleRailSync();

      const tocBtn = document.getElementById('tocFabBtn');
      const tocSource = document.getElementById('tocNav');
      const articlePage = document.getElementById('articlePage');
      if (tocBtn) {
        // temporal 필터로 전 항목이 숨겨진 목차(li 전부 [hidden])는 FAB 도 숨긴다.
        const hasToc = tocSource && tocSource.querySelector('li:not([hidden])');
        const isArticle = articlePage && !articlePage.classList.contains('d-none');
        (tocBtn as HTMLElement).style.display = (hasToc && isArticle) ? '' : 'none';
      }
    });
    // attributeFilter 에 hidden 포함: temporal 경계 flip 이 li[hidden] 만 바꾸는 경우에도
    // FAB 표시 여부가 재평가되도록 한다.
    // attributeFilter 에 open 포함: <details>(:::fold) 개폐는 class 도 hidden 도 바꾸지 않아,
    // 그대로 두면 접힌 폴드 안 헤딩의 점이 레일에 남는다(반대로 열어도 나타나지 않는다).
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'open'] });

    updateActive();
    syncRail();
  }

  // ── 읽기 모드 ──
  function applyReadingUi(active: boolean) {
    const exitBtn = document.getElementById('readingModeExitFab');
    const fabGroup = document.getElementById('scrollFabGroup');
    if (!exitBtn || !fabGroup) return;
    if (active) {
      exitBtn.classList.remove('d-none');
      fabGroup.classList.add('visible');
    } else {
      exitBtn.classList.add('d-none');
      if (window.scrollY <= 200 && !document.body.classList.contains('raw-mode')) {
        fabGroup.classList.remove('visible');
      }
    }
  }

  function toggleReadingMode() {
    if (document.body.classList.contains('raw-mode')) {
      exitRawMode();
    }
    const active = document.body.classList.toggle('reading-mode');
    applyReadingUi(active);
    try {
      if (active) localStorage.setItem('readingMode', '1');
      else localStorage.removeItem('readingMode');
    } catch (e) { /* noop */ }
    if (typeof opts.onReadingModeToggled === 'function') opts.onReadingModeToggled(active);
  }

  function restoreReadingMode() {
    try {
      if (localStorage.getItem('readingMode') === '1') {
        document.body.classList.add('reading-mode');
        applyReadingUi(true);
      }
    } catch (e) { /* noop */ }
  }

  // ── Raw 보기 모드 ──
  function applyRawUi(active: boolean) {
    const exitBtn = document.getElementById('rawModeExitFab');
    const fabGroup = document.getElementById('scrollFabGroup');
    if (!exitBtn || !fabGroup) return;
    if (active) {
      exitBtn.classList.remove('d-none');
      fabGroup.classList.add('visible');
    } else {
      exitBtn.classList.add('d-none');
      if (window.scrollY <= 200 && !document.body.classList.contains('reading-mode')) {
        fabGroup.classList.remove('visible');
      }
    }
  }

  function exitRawMode() {
    if (document.body.classList.contains('raw-mode')) {
      document.body.classList.remove('raw-mode');
    }
    applyRawUi(false);
    // Raw 모드에서는 레일을 띄우지 않으므로 진입/이탈 시 재구축한다.
    scheduleRailSync(0);
  }

  function toggleRawMode() {
    if (document.body.classList.contains('reading-mode')) {
      document.body.classList.remove('reading-mode');
      applyReadingUi(false);
      try { localStorage.removeItem('readingMode'); } catch (e) { /* noop */ }
    }
    const active = document.body.classList.toggle('raw-mode');
    applyRawUi(active);
    scheduleRailSync(0);
    if (active) window.scrollTo({ top: 0, behavior: 'auto' });
  }

  return {
    populateSidebar,
    toggleFloating,
    syncRail,
    attachSpy,
    refresh,
    toggleReadingMode,
    restoreReadingMode,
    toggleRawMode,
    exitRawMode,
  };
}
