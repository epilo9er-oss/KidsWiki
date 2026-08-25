/**
 * 로그인 페이지(/login) 클라이언트 스크립트.
 *
 * - /api/auth/providers 응답 기반으로 OAuth 공급자 버튼을 동적 주입
 * - SSR 로 head 에 주입된 #ssr-data JSON 을 읽어 환영 메시지/약관 표시
 * - 이용약관 / 개인정보 처리방침 모달은 sweetalert2 (CDN, window.Swal) 로 표시
 *
 * 마이그레이션 노트:
 *   기존 public/login.html 의 인라인 <script> 블록을 ES 모듈로 이전한 두 번째 사례.
 *   common.js / render.js 등 전역 의존이 없어 단일 페이지 진입점으로 떨어진다.
 *   sweetalert2 만 CDN <script> 로 먼저 로드해 window.Swal 에 노출돼 있다.
 */

import { escapeHtml } from '../utils/html';
import { apiGet } from '../utils/api';
import '../utils/swal';
import type { AuthProvidersResponse } from '../../shared/api/auth';
import { initQrLogin } from './qr-login-guest';

interface SsrData {
    loginMessage?: string;
    termsOfService?: string;
    privacyPolicy?: string;
}

interface ProviderConfig {
    label: string;
    icon: string;
}

// 심볼은 Google/NAVER/Kakao 개발자센터에서 받은 공식 버튼 PNG의 원본 영역을 그대로 사용한다.
const providerConfig: Record<string, ProviderConfig> = {
    google: {
        label: 'Google로 로그인',
        icon: '<span class="oauth-brand-icon oauth-brand-icon--google" aria-hidden="true"><img src="/brand/oauth/google-signin-light-square.png" alt=""></span>',
    },
    discord: {
        label: 'Discord로 로그인',
        icon: '<svg class="oauth-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#5865F2"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z"/></svg>',
    },
    naver: {
        label: '네이버 로그인',
        icon: '<span class="oauth-brand-icon oauth-brand-icon--naver" aria-hidden="true"><img src="/brand/oauth/naver-login-green-wide.png" alt=""></span>',
    },
    kakao: {
        label: '카카오 로그인',
        icon: '<span class="oauth-brand-icon oauth-brand-icon--kakao" aria-hidden="true"><img src="/brand/oauth/kakao-login-medium-wide.png" alt=""></span>',
    },
};

function getSafeRedirectParam(): string | null {
    const raw = new URLSearchParams(window.location.search).get('redirect');
    return (raw && raw.startsWith('/') && !raw.startsWith('//') && !/[\x00-\x1f\x7f]/.test(raw)) ? raw : null;
}

/**
 * "로그인 유지" 체크 상태를 모든 공급자 링크의 remember 쿼리에 반영한다.
 * 체크 시 remember=1 을 붙이면 서버가 세션을 매우 길게, 미체크면 6시간으로 발급한다.
 */
function applyRememberToLinks(remember: boolean): void {
    const container = document.getElementById('auth-providers-container');
    if (!container) return;
    container.querySelectorAll<HTMLAnchorElement>('a.btn-oauth').forEach((a) => {
        const url = new URL(a.getAttribute('href') || '', window.location.origin);
        if (remember) url.searchParams.set('remember', '1');
        else url.searchParams.delete('remember');
        a.setAttribute('href', url.pathname + url.search);
    });
}

async function renderProviders(): Promise<void> {
    try {
        const { providers } = await apiGet<AuthProvidersResponse>('/api/auth/providers');
        const container = document.getElementById('auth-providers-container');
        if (!container) return;

        const safeRedirect = getSafeRedirectParam();

        for (const p of providers) {
            const cfg = providerConfig[p.name];
            if (!cfg) continue;
            const a = document.createElement('a');
            a.href = '/auth/' + p.name + (safeRedirect ? '?redirect=' + encodeURIComponent(safeRedirect) : '');
            a.className = 'btn-oauth btn-oauth--' + p.name;
            a.setAttribute('aria-label', cfg.label);
            a.innerHTML = cfg.icon + '<span class="oauth-label">' + escapeHtml(cfg.label) + '</span>';
            container.appendChild(a);
        }

        // 버튼이 렌더된 뒤 현재 체크박스 상태를 반영 (비동기 렌더 이후 링크 갱신)
        const rememberCheckbox = document.getElementById('rememberMe') as HTMLInputElement | null;
        applyRememberToLinks(!!rememberCheckbox?.checked);
    } catch (e) {
        console.error('Failed to load auth providers', e);
    }
}

function readSsrData(): SsrData {
    const ssrDataEl = document.getElementById('ssr-data');
    if (!ssrDataEl || !ssrDataEl.textContent) return {};
    try {
        return JSON.parse(ssrDataEl.textContent) as SsrData;
    } catch (e) {
        console.error('Failed to parse SSR data', e);
        return {};
    }
}

function policyHtml(s: string): string {
    return `<div style="white-space: pre-wrap; text-align: left;">${escapeHtml(s)}</div>`;
}

document.addEventListener('DOMContentLoaded', () => {
    renderProviders();
    initQrLogin();

    const rememberCheckbox = document.getElementById('rememberMe') as HTMLInputElement | null;
    rememberCheckbox?.addEventListener('change', () => applyRememberToLinks(rememberCheckbox.checked));

    const ssrData = readSsrData();
    if (ssrData.loginMessage) {
        const msgEl = document.getElementById('loginMessage');
        if (msgEl) msgEl.textContent = ssrData.loginMessage;
    }

    const btnTerms = document.getElementById('btnTerms');
    btnTerms?.addEventListener('click', () => {
        window.Swal?.fire({
            title: '이용약관',
            html: policyHtml(ssrData.termsOfService || '이용약관 내용이 없습니다.'),
            width: '80%',
            customClass: { popup: 'text-start' },
            confirmButtonText: '닫기',
        });
    });

    const btnPrivacy = document.getElementById('btnPrivacy');
    btnPrivacy?.addEventListener('click', () => {
        window.Swal?.fire({
            title: '개인정보 처리방침',
            html: policyHtml(ssrData.privacyPolicy || '개인정보 처리방침 내용이 없습니다.'),
            width: '80%',
            customClass: { popup: 'text-start' },
            confirmButtonText: '닫기',
        });
    });
});
