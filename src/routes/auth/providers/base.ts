import type { Context } from 'hono';
import type { Env } from '../../../types';
import type { UserId } from '../../../shared/userId';

/**
 * OAuth 공급자 인터페이스
 * 모든 OAuth 공급자는 이 인터페이스를 구현해야 한다.
 */
export interface OAuthProvider {
    /** 공급자 식별자 (wrangler.toml AUTH_PROVIDERS 값과 일치) */
    name: string;

    /** 로그인 버튼 표시 텍스트 */
    label: string;

    /**
     * 인증 페이지로 리디렉션 (CSRF state 생성 포함).
     * stateData로 의도(intent)와 부가 정보를 state KV에 함께 저장할 수 있다.
     */
    handleLogin(c: Context<Env>, stateData?: Partial<OAuthStateData>): Promise<Response>;

    /** OAuth 콜백 처리 → 프로필 + state 데이터 반환 */
    handleCallback(c: Context<Env>): Promise<OAuthCallbackResult | Response>;
}

/**
 * OAuth 공급자에서 반환하는 사용자 프로필
 */
export interface OAuthProfile {
    provider: string;
    uid: string;
    /** 공급자 동의 범위에 따라 없을 수 있다. 신규 가입에는 검증된 이메일이 필수다. */
    email?: string;
    name: string;
    picture?: string;
}

/**
 * OAuth state KV에 저장되는 의도/컨텍스트 데이터
 * - login: 일반 로그인 흐름
 * - refresh_picture: 로그인 상태에서 프로필 사진만 갱신
 * - link: 현재 로그인 계정에 새 공급자 연결
 * - confirm_link: 같은 이메일 계정 후보를 기존 기본 공급자로 재인증
 */
export interface OAuthStateData {
    provider: string;
    intent: 'login' | 'refresh_picture' | 'link' | 'confirm_link';
    /** refresh_picture 의도일 때 갱신 대상 유저 id */
    userId?: UserId;
    /** refresh_picture 의도일 때 기대되는 공급자 측 uid */
    expectedUid?: string;
    /** 로그인 완료 후 이동할 상대경로 URL (/ 시작, // 미시작인 경우만 유효) */
    redirectUrl?: string;
    /** "로그인 유지" 체크 여부. true 면 세션을 매우 길게, 아니면 6시간으로 발급한다. */
    remember?: boolean;
    /** confirm_link 의도에서 서버 KV에 보관한 연결 후보 토큰 */
    pendingLinkToken?: string;
}

/**
 * handleCallback의 성공 결과: 프로필과 state 데이터를 함께 반환
 */
export interface OAuthCallbackResult {
    profile: OAuthProfile;
    state: OAuthStateData;
}
