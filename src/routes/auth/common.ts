import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Env } from '../../types';
import type { UserId } from '../../shared/userId';
import type { OAuthProfile, OAuthStateData } from './providers/base';
import { isEmailDomainAllowed } from '../../utils/auth';
import { dispatchDiscord } from '../../utils/webhook/discord';
import { userJoined } from '../../utils/webhook/events/signup';
import {
    createUserWithIdentity,
    decideUnknownIdentity,
    findUserByIdentity,
    findUsersByEmail,
    hasProviderIdentity,
    linkIdentity,
    parsePendingIdentityLink,
    type PendingIdentityLink,
    updateIdentityEmail,
} from './identities';

/**
 * OAuth 로그인 공통 처리:
 *  1. provider + uid로 기존 유저 조회
 *  2. 없으면 이메일 중복 체크 → 신규 유저 생성 (또는 승인제 처리)
 *  3. 세션 생성 후 쿠키 발급
 */
/**
 * 세션 수명(초).
 *  - REMEMBER: "로그인 유지" 체크 시. 매우 길게(1년) 발급한다.
 *  - DEFAULT : 미체크 시. 6시간 후 만료.
 */
export const SESSION_TTL_REMEMBER = 60 * 60 * 24 * 365; // 1년
export const SESSION_TTL_DEFAULT = 60 * 60 * 6; // 6시간

const PENDING_IDENTITY_LINK_TTL = 600;

export async function handleOAuthLogin(c: Context<Env>, profile: OAuthProfile, redirectUrl?: string, remember = false): Promise<Response> {
    const db = c.env.DB;
    let isNewUser = false;
    let userId: UserId | null = null;

    // OAuth 공급자의 불변 식별자로 로그인 계정을 찾는다. 이메일은 절대 로그인 키로 쓰지 않는다.
    const existingUser = await findUserByIdentity(db, profile.provider, profile.uid);

    if (existingUser && existingUser.role === 'deleted') {
        return c.redirect('/?error=deleted_account');
    }

    if (existingUser) {
        userId = existingUser.id;
        await updateIdentityEmail(db, profile.provider, profile.uid, profile.email);

        // 대표 프로필 사진은 기본 로그인 수단으로 로그인했을 때만 갱신한다.
        if (existingUser.provider === profile.provider && existingUser.uid === profile.uid) {
            await db
                .prepare('UPDATE users SET picture = CASE WHEN picture_private = 1 THEN picture ELSE ? END WHERE id = ?')
                .bind(profile.picture || null, existingUser.id)
                .run();
        }
    } else {
        const email = profile.email?.trim();
        if (!email) {
            return c.redirect(`/?error=email_required&provider=${encodeURIComponent(profile.provider)}`);
        }

        // 같은 이메일은 연결 후보일 뿐이다. 기존 기본 공급자로 다시 인증하기 전에는 병합하지 않는다.
        const emailUsers = await findUsersByEmail(db, email);
        const targetHasProvider = emailUsers.length === 1
            ? await hasProviderIdentity(db, emailUsers[0].id, profile.provider)
            : false;
        const decision = decideUnknownIdentity(emailUsers.length, targetHasProvider);
        if (decision === 'require_reauthentication') {
            const target = emailUsers[0];
            const token = crypto.randomUUID();
            const browserNonce = crypto.randomUUID();
            const pending: PendingIdentityLink = {
                targetUserId: target.id,
                candidate: { provider: profile.provider, uid: profile.uid, email },
                remember,
                browserNonce,
            };
            await c.env.KV.put(`pending_identity_link:${token}`, JSON.stringify(pending), {
                expirationTtl: PENDING_IDENTITY_LINK_TTL,
            });
            setCookie(c, 'oauth_link_nonce', browserNonce, {
                httpOnly: true,
                secure: true,
                sameSite: 'Lax',
                path: '/auth',
                maxAge: PENDING_IDENTITY_LINK_TTL,
            });
            const query = new URLSearchParams({
                info: 'account_link_required',
                provider: target.provider,
                candidate: profile.provider,
                link_token: token,
            });
            return c.redirect(`/?${query.toString()}`);
        }
        if (decision === 'conflict') {
            const provider = emailUsers.length === 1 ? `&provider=${encodeURIComponent(emailUsers[0].provider)}` : '';
            return c.redirect(`/?error=email_already_registered${provider}`);
        }

        // 이메일 도메인 필터링
        if (!isEmailDomainAllowed(email, c.env.EMAIL_RESTRICTION, c.env.EMAIL_LIST)) {
            return c.redirect('/?error=email_domain_not_allowed');
        }

        const settingsRow = await db
            .prepare('SELECT signup_policy FROM settings WHERE id = 1')
            .first<{ signup_policy: string }>();
        const signupPolicy = settingsRow?.signup_policy || 'open';

        // 차단: 신규 유저 가입 완전 차단
        if (signupPolicy === 'blocked') {
            return c.redirect('/?error=signup_blocked');
        }

        // 승인제: 신규 유저는 바로 가입하지 않고 가입 신청 절차를 거침
        if (signupPolicy === 'approval') {
            // 기존 가입 신청 확인
            const existingRequest = await db
                .prepare('SELECT id, status FROM signup_requests WHERE provider = ? AND uid = ? ORDER BY created_at DESC LIMIT 1')
                .bind(profile.provider, profile.uid)
                .first<{ id: number; status: string }>();

            if (existingRequest) {
                if (existingRequest.status === 'pending') {
                    return c.redirect('/?error=signup_pending');
                }
                if (existingRequest.status === 'blocked') {
                    return c.redirect('/?error=signup_blocked');
                }
                // rejected: 재신청 가능 → 아래로 진행
            }

            // 임시 토큰 발급하여 KV에 저장 (10분 TTL)
            const signupToken = crypto.randomUUID();
            await c.env.KV.put(`signup_token:${signupToken}`, JSON.stringify({
                provider: profile.provider,
                uid: profile.uid,
                email,
                name: profile.name,
                picture: profile.picture,
            }), { expirationTtl: 600 });

            return c.redirect(`/setup-profile?mode=approval&token=${signupToken}`);
        }

        // 모두 허용: 바로 유저 생성
        const finalName = await resolveUniqueName(db, profile.name);
        userId = await createUserWithIdentity(db, {
            provider: profile.provider,
            uid: profile.uid,
            email,
            name: finalName,
            picture: profile.picture,
        });
        isNewUser = true;

        // open 정책 신규 가입 → community 채널 환영 알림
        if (userId) {
            dispatchDiscord(c.env, c.executionCtx, userJoined({
                user: { id: userId, name: finalName, picture: profile.picture || null },
                env: c.env,
            }));
        }
    }

    if (!userId) {
        return c.redirect('/error?reason=' + encodeURIComponent('계정 생성에 실패했습니다. 다시 시도해주세요.'));
    }

    await createSession(c, userId, remember);

    if (isNewUser) {
        return c.redirect('/setup-profile');
    }

    const safeRedirect = (redirectUrl && redirectUrl.startsWith('/') && !redirectUrl.startsWith('//') && !/[\x00-\x1f\x7f]/.test(redirectUrl))
        ? redirectUrl
        : '/';
    return c.redirect(safeRedirect);
}

export async function handleOAuthLink(
    c: Context<Env>,
    profile: OAuthProfile,
    state: OAuthStateData,
): Promise<Response> {
    const currentUser = c.get('user');
    if (!currentUser || !state.userId || currentUser.id !== state.userId) {
        return c.redirect('/mypage?identity_error=session_mismatch');
    }

    const result = await linkIdentity(c.env.DB, currentUser.id, profile);
    if (result === 'linked' || result === 'already_linked') {
        return c.redirect(`/mypage?identity_linked=${encodeURIComponent(profile.provider)}`);
    }
    return c.redirect(`/mypage?identity_error=${encodeURIComponent(result)}`);
}

export async function handlePendingIdentityLink(
    c: Context<Env>,
    profile: OAuthProfile,
    state: OAuthStateData,
): Promise<Response> {
    const token = state.pendingLinkToken;
    if (!token) return c.redirect('/?error=invalid_link_request');

    const key = `pending_identity_link:${token}`;
    const raw = await c.env.KV.get(key);
    if (!raw) return c.redirect('/?error=link_request_expired');

    const pending = parsePendingIdentityLink(raw);
    if (!pending) {
        await c.env.KV.delete(key);
        return c.redirect('/?error=invalid_link_request');
    }

    if (!pending.browserNonce || getCookie(c, 'oauth_link_nonce') !== pending.browserNonce) {
        return c.redirect('/?error=invalid_link_request');
    }

    const target = await c.env.DB.prepare('SELECT id, provider, uid, role FROM users WHERE id = ?')
        .bind(pending.targetUserId)
        .first<{ id: UserId; provider: string; uid: string; role: string }>();

    // 같은 이메일이 아니라 기존 계정의 기본 OAuth identity를 다시 증명했는지 검증한다.
    if (!target || target.role === 'deleted' || profile.provider !== target.provider || profile.uid !== target.uid) {
        return c.redirect('/?error=account_link_reauth_failed');
    }

    const result = await linkIdentity(c.env.DB, target.id, {
        provider: pending.candidate.provider,
        uid: pending.candidate.uid,
        email: pending.candidate.email,
        name: '',
    });
    await c.env.KV.delete(key);

    if (result !== 'linked' && result !== 'already_linked') {
        return c.redirect(`/?error=${encodeURIComponent(result)}`);
    }

    await createSession(c, target.id, state.remember ?? false);
    deleteCookie(c, 'oauth_link_nonce', { path: '/auth', secure: true, sameSite: 'Lax' });
    return c.redirect(`/?info=account_linked&provider=${encodeURIComponent(pending.candidate.provider)}`);
}

/**
 * 세션 생성 + 쿠키 설정
 * @param remember "로그인 유지" 여부. true 면 매우 긴 수명, 아니면 6시간.
 */
export async function createSession(c: Context<Env>, userId: UserId, remember = false): Promise<void> {
    const sessionId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const maxAge = remember ? SESSION_TTL_REMEMBER : SESSION_TTL_DEFAULT;
    const expiresAt = now + maxAge;
    const userAgent = c.req.header('User-Agent') || null;

    await c.env.DB
        .prepare('INSERT INTO sessions (id, user_id, expires_at, user_agent, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(sessionId, userId, expiresAt, userAgent, now)
        .run();

    c.header(
        'Set-Cookie',
        `wiki_session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
    );
}

/**
 * 유저 이름 중복 시 suffix 처리
 */
export async function resolveUniqueName(db: D1Database, baseName: string): Promise<string> {
    let finalName = baseName;
    const nameExists = await db
        .prepare('SELECT COUNT(*) as cnt FROM users WHERE name = ?')
        .bind(finalName)
        .first<{ cnt: number }>();

    if (nameExists && nameExists.cnt > 0) {
        let suffix = 2;
        while (true) {
            const candidateName = `${baseName} ${suffix}`;
            const dupCheck = await db
                .prepare('SELECT COUNT(*) as cnt FROM users WHERE name = ?')
                .bind(candidateName)
                .first<{ cnt: number }>();
            if (!dupCheck || dupCheck.cnt === 0) {
                finalName = candidateName;
                break;
            }
            suffix++;
        }
    }

    return finalName;
}
