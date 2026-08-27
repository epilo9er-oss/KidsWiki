export const USER_BADGE_CATALOG = Object.freeze({
    verified_expert: Object.freeze({
        key: 'verified_expert',
        label: '자격 확인 전문가',
        description: '운영진이 외부 전문 자격을 확인한 사용자입니다.',
        icon: 'mdi mdi-certificate-outline',
        className: 'bg-primary',
    }),
});

export type UserBadgeKey = keyof typeof USER_BADGE_CATALOG;
export type PublicUserBadge = (typeof USER_BADGE_CATALOG)[UserBadgeKey];

let schemaReady = false;
let schemaInflight: Promise<void> | null = null;

export function resetUserBadgesSchemaCacheForTests() {
    schemaReady = false;
    schemaInflight = null;
}

export async function ensureUserBadgesSchema(db: D1Database): Promise<void> {
    if (schemaReady) return;
    if (schemaInflight) return schemaInflight;
    schemaInflight = db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS user_badges (
            user_id TEXT NOT NULL,
            badge_key TEXT NOT NULL COLLATE BINARY,
            assigned_by TEXT,
            assigned_at INTEGER NOT NULL DEFAULT (unixepoch()),
            PRIMARY KEY (user_id, badge_key),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`),
        db.prepare('CREATE INDEX IF NOT EXISTS idx_user_badges_key ON user_badges(badge_key, assigned_at DESC)'),
    ]).then(() => {
        schemaReady = true;
    }).catch((error) => {
        schemaInflight = null;
        throw error;
    }).finally(() => {
        schemaInflight = null;
    });
    return schemaInflight;
}

export function isUserBadgeKey(value: string): value is UserBadgeKey {
    return Object.prototype.hasOwnProperty.call(USER_BADGE_CATALOG, value);
}

export async function getPublicUserBadges(db: D1Database, userId: string): Promise<PublicUserBadge[]> {
    await ensureUserBadgesSchema(db);
    const { results } = await db.prepare(
        'SELECT badge_key FROM user_badges WHERE user_id = ? ORDER BY assigned_at, badge_key'
    ).bind(userId).all<{ badge_key: string }>();
    return (results || [])
        .map(row => isUserBadgeKey(row.badge_key) ? USER_BADGE_CATALOG[row.badge_key] : null)
        .filter((badge): badge is PublicUserBadge => badge !== null);
}

export async function setUserBadge(
    db: D1Database,
    userId: string,
    badgeKey: UserBadgeKey,
    enabled: boolean,
    assignedBy: string,
): Promise<PublicUserBadge[]> {
    await ensureUserBadgesSchema(db);
    if (enabled) {
        await db.prepare(
            `INSERT INTO user_badges (user_id, badge_key, assigned_by)
             VALUES (?, ?, ?)
             ON CONFLICT(user_id, badge_key) DO UPDATE SET
                assigned_by = excluded.assigned_by,
                assigned_at = unixepoch()`
        ).bind(userId, badgeKey, assignedBy).run();
    } else {
        await db.prepare('DELETE FROM user_badges WHERE user_id = ? AND badge_key = ?')
            .bind(userId, badgeKey).run();
    }
    return getPublicUserBadges(db, userId);
}
