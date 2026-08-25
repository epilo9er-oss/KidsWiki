import type { Env } from '../types';

/**
 * 프로필 사진 비공개 시 users.picture 컬럼에 저장되는 마스킹 경로.
 * 클라이언트 공통 아바타 렌더러는 이 값을 공급자 사진이 아닌 이름 첫 글자 표시로 해석한다.
 */
export const PRIVATE_AVATAR_PATH = '/avatar-default.svg';

/**
 * 이메일 도메인이 가입 가능한지 확인합니다.
 * @param email 사용자 이메일
 * @param restriction "whitelist" | "blacklist" | 그 외 (none으로 취급)
 * @param listRaw 콤마로 구분된 도메인 목록 문자열
 * @returns true면 가입 허용, false면 차단
 */
export function isEmailDomainAllowed(email: string, restriction: string, listRaw: string): boolean {
    const mode = restriction?.trim().toLowerCase();
    if (mode !== 'whitelist' && mode !== 'blacklist') return true;

    const domain = email.split('@')[1]?.toLowerCase() || '';
    const list = listRaw.split(',').map(d => d.trim().toLowerCase()).filter(d => d.length > 0);

    if (mode === 'whitelist') return list.includes(domain);
    // blacklist
    return !list.includes(domain);
}

/**
 * SUPER_ADMIN_EMAILS 환경변수를 파싱하여 최고 관리자 이메일 Set을 반환합니다.
 * @param env SUPER_ADMIN_EMAILS를 포함하는 환경 바인딩
 * @returns 최고 관리자 이메일 Set
 */
export function getSuperAdmins(env: Env['Bindings']): Set<string> {
    const emails = (env.SUPER_ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(e => e.length > 0);
    return new Set(emails);
}

/**
 * 주어진 이메일이 최고 관리자인지 확인합니다.
 * @param email 사용자의 이메일 주소
 * @param env SUPER_ADMIN_EMAILS를 포함하는 환경 바인딩
 * @returns 이메일이 최고 관리자 목록에 있으면 true, 아니면 false
 */
export function isSuperAdmin(email: string | null | undefined, env: Env['Bindings']): boolean {
    return !!email && getSuperAdmins(env).has(email);
}
