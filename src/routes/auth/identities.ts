import type { OAuthProfile } from './providers/base';
import { createUserId, isUserId, type UserId } from '../../shared/userId.ts';

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

export type LinkIdentityResult =
    | 'linked'
    | 'already_linked'
    | 'identity_in_use'
    | 'provider_already_linked'
    | 'user_not_found';

export interface PendingIdentityLink {
    targetUserId: UserId;
    candidate: Pick<OAuthProfile, 'provider' | 'uid' | 'email'>;
    remember: boolean;
    browserNonce: string;
}

export function parsePendingIdentityLink(raw: string): PendingIdentityLink | null {
    try {
        const value = JSON.parse(raw) as Partial<PendingIdentityLink>;
        const candidate = value.candidate;
        if (!isUserId(value.targetUserId)) return null;
        if (!candidate || typeof candidate.provider !== 'string' || !candidate.provider) return null;
        if (typeof candidate.uid !== 'string' || !candidate.uid) return null;
        if (typeof candidate.email !== 'string' || !candidate.email) return null;
        if (typeof value.remember !== 'boolean') return null;
        if (typeof value.browserNonce !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.browserNonce)) return null;
        return value as PendingIdentityLink;
    } catch {
        return null;
    }
}

export function decideUnknownIdentity(
    emailMatchCount: number,
    targetAlreadyHasProvider: boolean,
): 'create_user' | 'require_reauthentication' | 'conflict' {
    if (emailMatchCount === 0) return 'create_user';
    if (emailMatchCount === 1 && !targetAlreadyHasProvider) return 'require_reauthentication';
    return 'conflict';
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

export async function findUsersByEmail(db: D1Database, email: string): Promise<IdentityUser[]> {
    const result = await db.prepare(`
        SELECT id, role, provider, uid, picture_private
        FROM users
        WHERE role != 'deleted' AND LOWER(email) = LOWER(?)
        LIMIT 2
    `).bind(email.trim()).all<IdentityUser>();
    return result.results ?? [];
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

export async function unlinkSecondaryIdentity(
    db: D1Database,
    userId: UserId,
    provider: string,
): Promise<'unlinked' | 'primary' | 'not_found'> {
    await ensureUserIdentities(db);
    const user = await db.prepare('SELECT provider FROM users WHERE id = ?').bind(userId).first<{ provider: string }>();
    if (!user) return 'not_found';
    if (user.provider === provider) return 'primary';
    const result = await db.prepare('DELETE FROM user_identities WHERE user_id = ? AND provider = ?')
        .bind(userId, provider)
        .run();
    return Number(result.meta.changes ?? 0) > 0 ? 'unlinked' : 'not_found';
}

export async function createUserWithIdentity(db: D1Database, input: {
    provider: string;
    uid: string;
    email: string;
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
        `).bind(userId, input.provider, input.uid, input.email, input.name, input.picture ?? null, input.picturePrivate ? 1 : 0),
        db.prepare(`
            INSERT INTO user_identities (user_id, provider, provider_uid, provider_email)
            VALUES (?, ?, ?, ?)
        `).bind(userId, input.provider, input.uid, input.email),
    ]);
    return userId;
}
