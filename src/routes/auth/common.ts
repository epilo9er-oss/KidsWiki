import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Env } from '../../types';
import type { UserId } from '../../shared/userId';
import type { OAuthProfile, OAuthStateData } from './providers/base';
import { isEmailDomainAllowed, isSuperAdmin } from '../../utils/auth';
import { dispatchDiscord } from '../../utils/webhook/discord';
import { userJoined } from '../../utils/webhook/events/signup';
import {
    canOfferOAuthSignup,
    createUserWithIdentity,
    findUserByIdentity,
    linkIdentity,
    parsePendingOAuthIdentity,
    type PendingOAuthIdentity,
    updateIdentityEmail,
} from './identities';
import {
    mergeAccounts,
    parsePendingAccountMerge,
    type PendingAccountMerge,
} from './accountMerge';

/**
 * OAuth 로그인 공통 처리:
 *  1. provider + uid로 기존 유저 조회
 *  2. 없으면 신규 가입 또는 기존 계정 연결을 사용자가 명시적으로 선택
 *  3. 기존 유저면 세션 생성 후 쿠키 발급
 */
/**
 * 세션 수명(초).
 *  - REMEMBER: "로그인 유지" 체크 시. 매우 길게(1년) 발급한다.
 *  - DEFAULT : 미체크 시. 6시간 후 만료.
 */
export const SESSION_TTL_REMEMBER = 60 * 60 * 24 * 365; // 1년
export const SESSION_TTL_DEFAULT = 60 * 60 * 6; // 6시간

const PENDING_AUTH_TTL = 600;

export async function handleOAuthLogin(c: Context<Env>, profile: OAuthProfile, redirectUrl?: string, remember = false): Promise<Response> {
    const db = c.env.DB;

    // OAuth 공급자의 불변 식별자로 로그인 계정을 찾는다. 이메일은 절대 로그인 키로 쓰지 않는다.
    const existingUser = await findUserByIdentity(db, profile.provider, profile.uid);

    if (existingUser && existingUser.role === 'deleted') {
        return c.redirect('/?error=deleted_account');
    }

    if (!existingUser) {
        const token = crypto.randomUUID();
        const browserNonce = crypto.randomUUID();
        const normalizedProfile = { ...profile, email: profile.email?.trim() || undefined };
        const pending: PendingOAuthIdentity = { profile: normalizedProfile, remember, redirectUrl, browserNonce };
        await c.env.KV.put(`pending_oauth_identity:${token}`, JSON.stringify(pending), { expirationTtl: PENDING_AUTH_TTL });
        setCookie(c, 'oauth_identity_nonce', browserNonce, {
            httpOnly: true,
            secure: true,
            sameSite: 'Lax',
            path: '/auth',
            maxAge: PENDING_AUTH_TTL,
        });

        const emailInUse = normalizedProfile.email
            ? !!await db.prepare("SELECT 1 FROM users WHERE role != 'deleted' AND LOWER(email) = LOWER(?) LIMIT 1")
                .bind(normalizedProfile.email)
                .first()
            : false;
        const query = new URLSearchParams({
            info: 'oauth_account_choice',
            provider: profile.provider,
            identity_token: token,
            can_signup: canOfferOAuthSignup(normalizedProfile.email, emailInUse) ? '1' : '0',
        });
        return c.redirect(`/?${query.toString()}`);
    }

    await updateIdentityEmail(db, profile.provider, profile.uid, profile.email);

    // 대표 프로필 사진은 기본 로그인 수단으로 로그인했을 때만 갱신한다.
    if (existingUser.provider === profile.provider && existingUser.uid === profile.uid) {
        await db
            .prepare('UPDATE users SET picture = CASE WHEN picture_private = 1 THEN picture ELSE ? END WHERE id = ?')
            .bind(profile.picture || null, existingUser.id)
            .run();
    }

    await createSession(c, existingUser.id, remember);
    const safeRedirect = (redirectUrl && redirectUrl.startsWith('/') && !redirectUrl.startsWith('//') && !/[\x00-\x1f\x7f]/.test(redirectUrl))
        ? redirectUrl
        : '/';
    return c.redirect(safeRedirect);
}

export async function readPendingOAuthIdentity(
    c: Context<Env>,
    token: string,
): Promise<PendingOAuthIdentity | null> {
    if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
    const key = `pending_oauth_identity:${token}`;
    const raw = await c.env.KV.get(key);
    if (!raw) return null;
    const pending = parsePendingOAuthIdentity(raw);
    if (!pending) {
        await c.env.KV.delete(key);
        return null;
    }
    return getCookie(c, 'oauth_identity_nonce') === pending.browserNonce ? pending : null;
}

export async function handleNewOAuthAccountChoice(c: Context<Env>, token: string): Promise<Response> {
    const pending = await readPendingOAuthIdentity(c, token);
    if (!pending) return c.json({ redirect: '/?error=link_request_expired' }, 400);

    const profile = pending.profile;
    const email = profile.email?.trim() || null;
    if (await findUserByIdentity(c.env.DB, profile.provider, profile.uid)) {
        return c.json({ redirect: '/?error=identity_in_use' }, 409);
    }
    if (email && await c.env.DB.prepare("SELECT 1 FROM users WHERE role != 'deleted' AND LOWER(email) = LOWER(?) LIMIT 1")
        .bind(email)
        .first()) {
        return c.json({ redirect: '/?error=email_already_registered' }, 409);
    }
    const emailRestriction = c.env.EMAIL_RESTRICTION?.trim().toLowerCase();
    if ((!email && emailRestriction === 'whitelist') ||
        (email && !isEmailDomainAllowed(email, emailRestriction, c.env.EMAIL_LIST))) {
        return c.json({ redirect: '/?error=email_domain_not_allowed' }, 403);
    }

    const settingsRow = await c.env.DB.prepare('SELECT signup_policy FROM settings WHERE id = 1')
        .first<{ signup_policy: string }>();
    const signupPolicy = settingsRow?.signup_policy || 'open';
    if (signupPolicy === 'blocked') return c.json({ redirect: '/?error=signup_blocked' }, 403);

    if (signupPolicy === 'approval') {
        const existingRequest = await c.env.DB
            .prepare('SELECT status FROM signup_requests WHERE provider = ? AND uid = ? ORDER BY created_at DESC LIMIT 1')
            .bind(profile.provider, profile.uid)
            .first<{ status: string }>();
        if (existingRequest?.status === 'pending') return c.json({ redirect: '/?error=signup_pending' }, 409);
        if (existingRequest?.status === 'blocked') return c.json({ redirect: '/?error=signup_blocked' }, 403);

        const signupToken = crypto.randomUUID();
        await c.env.KV.put(`signup_token:${signupToken}`, JSON.stringify({
            provider: profile.provider,
            uid: profile.uid,
            email,
            name: profile.name,
            picture: profile.picture,
        }), { expirationTtl: PENDING_AUTH_TTL });
        await c.env.KV.delete(`pending_oauth_identity:${token}`);
        deleteCookie(c, 'oauth_identity_nonce', { path: '/auth', secure: true, sameSite: 'Lax' });
        return c.json({ redirect: `/setup-profile?mode=approval&token=${signupToken}` });
    }

    const finalName = await resolveUniqueName(c.env.DB, profile.name);
    const userId = await createUserWithIdentity(c.env.DB, {
        provider: profile.provider,
        uid: profile.uid,
        email,
        name: finalName,
        picture: profile.picture,
    });
    await createSession(c, userId, pending.remember);
    await c.env.KV.delete(`pending_oauth_identity:${token}`);
    deleteCookie(c, 'oauth_identity_nonce', { path: '/auth', secure: true, sameSite: 'Lax' });
    dispatchDiscord(c.env, c.executionCtx, userJoined({
        user: { id: userId, name: finalName, picture: profile.picture || null },
        env: c.env,
    }));
    return c.json({ redirect: '/setup-profile' });
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

    const owner = await findUserByIdentity(c.env.DB, profile.provider, profile.uid);
    if (owner && owner.id !== currentUser.id) {
        const token = crypto.randomUUID();
        const browserNonce = crypto.randomUUID();
        const pending: PendingAccountMerge = {
            survivorUserId: currentUser.id,
            absorbedUserId: owner.id,
            absorbedIdentity: { provider: profile.provider, uid: profile.uid },
            browserNonce,
        };
        await c.env.KV.put(`pending_account_merge:${token}`, JSON.stringify(pending), { expirationTtl: PENDING_AUTH_TTL });
        setCookie(c, 'oauth_merge_nonce', browserNonce, {
            httpOnly: true,
            secure: true,
            sameSite: 'Lax',
            path: '/auth',
            maxAge: PENDING_AUTH_TTL,
        });
        const query = new URLSearchParams({
            identity_merge: token,
            merge_primary: currentUser.provider,
            merge_candidate: profile.provider,
        });
        return c.redirect(`/mypage?${query.toString()}`);
    }

    const result = owner ? 'already_linked' : await linkIdentity(c.env.DB, currentUser.id, profile);
    if (result === 'linked' || result === 'already_linked') {
        return c.redirect(`/mypage?identity_linked=${encodeURIComponent(profile.provider)}`);
    }
    return c.redirect(`/mypage?identity_error=${encodeURIComponent(result)}`);
}

export async function handlePendingIdentityAttach(
    c: Context<Env>,
    profile: OAuthProfile,
    state: OAuthStateData,
): Promise<Response> {
    const token = state.pendingIdentityToken;
    if (!token) return c.redirect('/?error=invalid_link_request');
    const pending = await readPendingOAuthIdentity(c, token);
    if (!pending) return c.redirect('/?error=link_request_expired');

    const target = await findUserByIdentity(c.env.DB, profile.provider, profile.uid);
    if (!target || target.role === 'deleted') {
        return c.redirect('/?error=account_link_reauth_failed');
    }

    await updateIdentityEmail(c.env.DB, profile.provider, profile.uid, profile.email);
    const result = await linkIdentity(c.env.DB, target.id, pending.profile);
    await c.env.KV.delete(`pending_oauth_identity:${token}`);

    if (result !== 'linked' && result !== 'already_linked') {
        return c.redirect(`/?error=${encodeURIComponent(result)}`);
    }

    await createSession(c, target.id, pending.remember);
    deleteCookie(c, 'oauth_identity_nonce', { path: '/auth', secure: true, sameSite: 'Lax' });
    return c.redirect(`/?info=account_linked&provider=${encodeURIComponent(pending.profile.provider)}`);
}

export async function readPendingAccountMerge(c: Context<Env>, token: string): Promise<PendingAccountMerge | null> {
    if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
    const key = `pending_account_merge:${token}`;
    const raw = await c.env.KV.get(key);
    if (!raw) return null;
    const pending = parsePendingAccountMerge(raw);
    if (!pending) {
        await c.env.KV.delete(key);
        return null;
    }
    return getCookie(c, 'oauth_merge_nonce') === pending.browserNonce ? pending : null;
}

export async function handlePendingAccountMerge(
    c: Context<Env>,
    profile: OAuthProfile,
    state: OAuthStateData,
): Promise<Response> {
    const token = state.pendingMergeToken;
    if (!token) return c.redirect('/mypage?identity_error=invalid_merge_request');
    const pending = await readPendingAccountMerge(c, token);
    const currentUser = c.get('user');
    if (!pending || !currentUser || currentUser.id !== pending.survivorUserId) {
        return c.redirect('/mypage?identity_error=session_mismatch');
    }

    const survivor = await c.env.DB.prepare('SELECT provider, uid, email FROM users WHERE id = ?')
        .bind(pending.survivorUserId)
        .first<{ provider: string; uid: string; email: string | null }>();
    const absorbed = await c.env.DB.prepare('SELECT email FROM users WHERE id = ?')
        .bind(pending.absorbedUserId)
        .first<{ email: string | null }>();
    if (!survivor || !absorbed || profile.provider !== survivor.provider || profile.uid !== survivor.uid) {
        return c.redirect('/mypage?identity_error=merge_reauth_failed');
    }
    if (currentUser.role !== 'user' || isSuperAdmin(survivor.email, c.env) || isSuperAdmin(absorbed.email, c.env)) {
        return c.redirect('/mypage?identity_error=privileged_account');
    }

    const identityOwner = await findUserByIdentity(
        c.env.DB,
        pending.absorbedIdentity.provider,
        pending.absorbedIdentity.uid,
    );
    if (!identityOwner || identityOwner.id !== pending.absorbedUserId) {
        return c.redirect('/mypage?identity_error=merge_identity_changed');
    }

    const result = await mergeAccounts(c.env.DB, pending.survivorUserId, pending.absorbedUserId);
    await c.env.KV.delete(`pending_account_merge:${token}`);
    deleteCookie(c, 'oauth_merge_nonce', { path: '/auth', secure: true, sameSite: 'Lax' });
    if (result.status !== 'merged') {
        return c.redirect(`/mypage?identity_error=${encodeURIComponent(result.status)}`);
    }
    await Promise.all(result.revokedSessionIds.map(id => c.env.KV.delete(`session:${id}`)));
    return c.redirect(`/mypage?identity_merged=${encodeURIComponent(pending.absorbedIdentity.provider)}`);
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
