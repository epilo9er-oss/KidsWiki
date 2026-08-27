import type { OAuthProfile } from './providers/base';
import { createUserId, type UserId } from '../../shared/userId.ts';
import { isSuperAdminEmail } from '../../utils/auth.ts';

export interface IdentityUser {
    id: UserId;
    role: string;
    provider: string;
    uid: string;
    picture_private: number;
}

export interface UserIdentity {
    provider: string;
    provider_email: string | null;
    primary: boolean;
}

export interface UserIdentityRecord extends UserIdentity {
    uid: string;
}

export type IdentityUnlinkDecision =
    | 'allowed'
    | 'not_found'
    | 'last_identity'
    | 'primary_super_admin'
    | 'protected_super_admin_email';
export type AccountDeletionDecision =
    | 'allowed'
    | 'links_remaining'
    | 'last_super_admin'
    | 'protected_super_admin_email';

export function getIdentityUnlinkDecision(
    identities: UserIdentity[],
    provider: string,
    superAdmin: boolean,
    superAdminEmails: ReadonlySet<string> = new Set(),
): IdentityUnlinkDecision {
    const identity = identities.find(item => item.provider === provider);
    if (!identity) return 'not_found';
    if (identities.length <= 1) return 'last_identity';
    if (isSuperAdminEmail(identity.provider_email, superAdminEmails)) return 'protected_super_admin_email';
    if (superAdmin && identity.primary) return 'primary_super_admin';
    return 'allowed';
}

export function getAccountDeletionDecision(
    identityCount: number,
    lastActiveSuperAdmin: boolean,
    protectedSuperAdminEmail = false,
): AccountDeletionDecision {
    if (identityCount !== 1) return 'links_remaining';
    if (protectedSuperAdminEmail) return 'protected_super_admin_email';
    return lastActiveSuperAdmin ? 'last_super_admin' : 'allowed';
}

export type LinkIdentityResult =
    | 'linked'
    | 'already_linked'
    | 'identity_in_use'
    | 'provider_already_linked'
    | 'user_not_found';

/** 이메일이 없거나, 제공된 이메일을 다른 계정이 사용하지 않을 때 신규 가입을 허용한다. */
export function canOfferOAuthSignup(email: string | undefined, emailInUse: boolean): boolean {
    return !email?.trim() || !emailInUse;
}

export function buildOAuthAccountChoiceRedirect(
    provider: string,
    token: string,
    canSignup: boolean,
    reauthFailed = false,
): string {
    const query = new URLSearchParams({
        info: 'oauth_account_choice',
        provider,
        identity_token: token,
        can_signup: canSignup ? '1' : '0',
    });
    if (reauthFailed) query.set('reauth_failed', '1');
    return `/?${query.toString()}`;
}

export interface PendingOAuthIdentity {
    profile: OAuthProfile;
    remember: boolean;
    redirectUrl?: string;
    browserNonce: string;
}

export function parsePendingOAuthIdentity(raw: string): PendingOAuthIdentity | null {
    try {
        const value = JSON.parse(raw) as Partial<PendingOAuthIdentity>;
        const profile = value.profile;
        if (!profile || typeof profile.provider !== 'string' || !profile.provider) return null;
        if (typeof profile.uid !== 'string' || !profile.uid) return null;
        if (profile.email !== undefined && (typeof profile.email !== 'string' || !profile.email.trim())) return null;
        if (typeof profile.name !== 'string') return null;
        if (profile.picture !== undefined && typeof profile.picture !== 'string') return null;
        if (typeof value.remember !== 'boolean') return null;
        if (value.redirectUrl !== undefined
            && (!value.redirectUrl.startsWith('/') || value.redirectUrl.startsWith('//') || /[\x00-\x1f\x7f]/.test(value.redirectUrl))) return null;
        if (typeof value.browserNonce !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.browserNonce)) return null;
        return value as PendingOAuthIdentity;
    } catch {
        return null;
    }
}

let schemaReady: Promise<void> | null = null;

/** 배포된 기존 D1에도 첫 요청에서 안전하게 테이블과 기본 identity를 보장한다. */
export function ensureUserIdentities(db: D1Database): Promise<void> {
    if (!schemaReady) {
        schemaReady = db.batch([
            db.prepare(`CREATE TABLE IF NOT EXISTS user_identities (
                user_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                provider_uid TEXT NOT NULL,
                provider_email TEXT,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                PRIMARY KEY (provider, provider_uid),
                UNIQUE (user_id, provider),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )`),
            db.prepare('CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities(user_id)'),
            db.prepare(`INSERT OR IGNORE INTO user_identities (user_id, provider, provider_uid, provider_email)
                        SELECT id, provider, uid, email FROM users`),
        ]).then(() => undefined).catch((error) => {
            schemaReady = null;
            throw error;
        });
    }
    return schemaReady;
}

export async function findUserByIdentity(
    db: D1Database,
    provider: string,
    uid: string,
): Promise<IdentityUser | null> {
    await ensureUserIdentities(db);
    return db.prepare(`
        SELECT u.id, u.role, u.provider, u.uid, u.picture_private
        FROM user_identities i
        JOIN users u ON u.id = i.user_id
        WHERE i.provider = ? AND i.provider_uid = ?
    `).bind(provider, uid).first<IdentityUser>();
}

export async function hasProviderIdentity(db: D1Database, userId: UserId, provider: string): Promise<boolean> {
    await ensureUserIdentities(db);
    return !!await db.prepare('SELECT 1 FROM user_identities WHERE user_id = ? AND provider = ?')
        .bind(userId, provider)
        .first();
}

export async function updateIdentityEmail(
    db: D1Database,
    provider: string,
    uid: string,
    email?: string,
): Promise<void> {
    if (!email) return;
    await db.prepare(`UPDATE user_identities SET provider_email = ? WHERE provider = ? AND provider_uid = ?`)
        .bind(email, provider, uid)
        .run();
}

/** 대표 이메일은 기준 Identity와 맞추되, 연결된 최고관리자 Identity가 있으면 그것을 기준으로 삼는다. */
export async function reconcilePrimaryIdentity(
    db: D1Database,
    userId: UserId,
    superAdminEmails: ReadonlySet<string>,
): Promise<boolean> {
    await ensureUserIdentities(db);
    const user = await db.prepare('SELECT provider, uid, email FROM users WHERE id = ?')
        .bind(userId)
        .first<{ provider: string; uid: string; email: string | null }>();
    if (!user) return false;

    const { results } = await db.prepare(`
        SELECT provider, provider_uid AS uid, provider_email, created_at
        FROM user_identities
        WHERE user_id = ?
        ORDER BY created_at ASC, provider ASC
    `).bind(userId).all<{
        provider: string;
        uid: string;
        provider_email: string | null;
        created_at: number;
    }>();
    const identities = results ?? [];
    if (identities.length === 0) return false;

    const current = identities.find(identity => identity.provider === user.provider && identity.uid === user.uid);
    const currentEmail = current?.provider_email ?? user.email;
    const protectedIdentity = current && isSuperAdminEmail(currentEmail, superAdminEmails)
        ? current
        : identities.find(identity => isSuperAdminEmail(identity.provider_email, superAdminEmails));
    const target = protectedIdentity ?? current ?? identities[0];
    if (!target) return false;
    const targetEmail = target.provider_email ?? (target === current ? user.email : null);
    if (user.provider === target.provider && user.uid === target.uid && user.email === targetEmail) return false;

    const batch = await db.batch([
        db.prepare(`UPDATE users SET provider = 'retired', uid = id
                    WHERE id != ? AND role = 'deleted' AND provider = ? AND uid = ?`)
            .bind(userId, target.provider, target.uid),
        db.prepare(`UPDATE users SET provider = ?, uid = ?, email = ?
                    WHERE id = ? AND EXISTS (
                        SELECT 1 FROM user_identities
                        WHERE user_id = ? AND provider = ? AND provider_uid = ?
                    )`)
            .bind(target.provider, target.uid, targetEmail, userId, userId, target.provider, target.uid),
    ]);
    return Number(batch[1]?.meta.changes ?? 0) > 0;
}

export async function linkIdentity(
    db: D1Database,
    userId: UserId,
    profile: OAuthProfile,
): Promise<LinkIdentityResult> {
    await ensureUserIdentities(db);
    const owner = await db.prepare('SELECT user_id FROM user_identities WHERE provider = ? AND provider_uid = ?')
        .bind(profile.provider, profile.uid)
        .first<{ user_id: UserId }>();
    if (owner) return owner.user_id === userId ? 'already_linked' : 'identity_in_use';

    const target = await db.prepare("SELECT role FROM users WHERE id = ?")
        .bind(userId)
        .first<{ role: string }>();
    if (!target || target.role === 'deleted') return 'user_not_found';

    if (await hasProviderIdentity(db, userId, profile.provider)) return 'provider_already_linked';

    try {
        await db.prepare(`
            INSERT INTO user_identities (user_id, provider, provider_uid, provider_email)
            VALUES (?, ?, ?, ?)
        `).bind(userId, profile.provider, profile.uid, profile.email ?? null).run();
        return 'linked';
    } catch (error) {
        const ownerAfterRace = await db.prepare('SELECT user_id FROM user_identities WHERE provider = ? AND provider_uid = ?')
            .bind(profile.provider, profile.uid)
            .first<{ user_id: UserId }>();
        if (ownerAfterRace) return ownerAfterRace.user_id === userId ? 'already_linked' : 'identity_in_use';
        if (await hasProviderIdentity(db, userId, profile.provider)) return 'provider_already_linked';
        throw error;
    }
}

export async function listUserIdentities(db: D1Database, userId: UserId): Promise<UserIdentity[]> {
    await ensureUserIdentities(db);
    const result = await db.prepare(`
        SELECT i.provider, i.provider_email,
               CASE WHEN i.provider = u.provider AND i.provider_uid = u.uid THEN 1 ELSE 0 END AS is_primary
        FROM user_identities i
        JOIN users u ON u.id = i.user_id
        WHERE i.user_id = ?
        ORDER BY is_primary DESC, i.created_at ASC
    `).bind(userId).all<{ provider: string; provider_email: string | null; is_primary: number }>();
    return (result.results ?? []).map(row => ({
        provider: row.provider,
        provider_email: row.provider_email,
        primary: !!row.is_primary,
    }));
}

export async function findUserIdentity(
    db: D1Database,
    userId: UserId,
    provider: string,
): Promise<UserIdentityRecord | null> {
    await ensureUserIdentities(db);
    return db.prepare(`
        SELECT i.provider, i.provider_uid AS uid, i.provider_email,
               CASE WHEN i.provider = u.provider AND i.provider_uid = u.uid THEN 1 ELSE 0 END AS is_primary
        FROM user_identities i
        JOIN users u ON u.id = i.user_id
        WHERE i.user_id = ? AND i.provider = ?
    `).bind(userId, provider).first<{
        provider: string;
        uid: string;
        provider_email: string | null;
        is_primary: number;
    }>().then(row => row ? {
        provider: row.provider,
        uid: row.uid,
        provider_email: row.provider_email,
        primary: !!row.is_primary,
    } : null);
}

export type UnlinkIdentityResult = Exclude<IdentityUnlinkDecision, 'allowed'> | 'unlinked';

export async function unlinkIdentity(
    db: D1Database,
    userId: UserId,
    provider: string,
    superAdmin: boolean,
    superAdminEmails: ReadonlySet<string> = new Set(),
): Promise<UnlinkIdentityResult> {
    const identities = await listUserIdentities(db, userId);
    const decision = getIdentityUnlinkDecision(identities, provider, superAdmin, superAdminEmails);
    if (decision !== 'allowed') return decision;

    const target = await findUserIdentity(db, userId, provider);
    if (!target) return 'not_found';

    if (!target.primary) {
        const result = await db.prepare(`
            DELETE FROM user_identities
            WHERE user_id = ? AND provider = ?
              AND (SELECT COUNT(*) FROM user_identities WHERE user_id = ?) > 1
        `).bind(userId, provider, userId).run();
        if (Number(result.meta.changes ?? 0) > 0) return 'unlinked';
    } else {
        const next = identities.find(identity => !identity.primary);
        const nextRecord = next && await findUserIdentity(db, userId, next.provider);
        if (!nextRecord) return 'last_identity';

        const results = await db.batch([
            // 병합되어 삭제된 예전 사용자 row가 동일 provider/uid를 점유한 경우 해제한다.
            db.prepare(`UPDATE users SET provider = 'retired', uid = id
                        WHERE id != ? AND role = 'deleted' AND provider = ? AND uid = ?`)
                .bind(userId, nextRecord.provider, nextRecord.uid),
            db.prepare(`UPDATE users SET provider = ?, uid = ?, email = ?
                        WHERE id = ? AND provider = ? AND uid = ?
                          AND (SELECT COUNT(*) FROM user_identities WHERE user_id = ?) > 1
                          AND EXISTS (
                              SELECT 1 FROM user_identities
                              WHERE user_id = ? AND provider = ? AND provider_uid = ?
                          )`)
                .bind(
                    nextRecord.provider,
                    nextRecord.uid,
                    nextRecord.provider_email,
                    userId,
                    target.provider,
                    target.uid,
                    userId,
                    userId,
                    nextRecord.provider,
                    nextRecord.uid,
                ),
            db.prepare(`DELETE FROM user_identities
                        WHERE user_id = ? AND provider = ?
                          AND EXISTS (
                              SELECT 1 FROM users
                              WHERE id = ? AND provider = ? AND uid = ?
                          )`)
                .bind(userId, provider, userId, nextRecord.provider, nextRecord.uid),
        ]);
        if (Number(results[2]?.meta.changes ?? 0) > 0) return 'unlinked';
    }

    const after = getIdentityUnlinkDecision(
        await listUserIdentities(db, userId),
        provider,
        superAdmin,
        superAdminEmails,
    );
    if (after !== 'allowed') return after;
    throw new Error('OAuth identity unlink did not change the database');
}

export async function createUserWithIdentity(db: D1Database, input: {
    provider: string;
    uid: string;
    email?: string | null;
    name: string;
    picture?: string | null;
    picturePrivate?: boolean;
}): Promise<UserId> {
    await ensureUserIdentities(db);
    const userId = createUserId();
    await db.batch([
        db.prepare(`
            INSERT INTO users (id, provider, uid, email, name, picture, picture_private)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(userId, input.provider, input.uid, input.email ?? null, input.name, input.picture ?? null, input.picturePrivate ? 1 : 0),
        db.prepare(`
            INSERT INTO user_identities (user_id, provider, provider_uid, provider_email)
            VALUES (?, ?, ?, ?)
        `).bind(userId, input.provider, input.uid, input.email ?? null),
    ]);
    return userId;
}
