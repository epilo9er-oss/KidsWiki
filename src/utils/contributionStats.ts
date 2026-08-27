import type { D1Database } from '@cloudflare/workers-types';

export interface PublicContributionItem {
    revision_id: number;
    summary: string | null;
    created_at: number;
    slug: string;
}

export interface TopicContribution {
    category: string;
    document_count: number;
    edit_count: number;
    last_contributed_at: number;
}

export interface TopicContributionOverview extends TopicContribution {
    contributor_count: number;
}

const PUBLIC_CONTRIBUTION_FILTER = `
    r.author_id IS NOT NULL
    AND r.is_virtual = 0
    AND r.deleted_at IS NULL
    AND r.purged_at IS NULL
    AND p.deleted_at IS NULL
    AND p.is_private = 0`;

/** 공개 프로필에 노출해도 되는 일반 리비전과 분야별 기여 통계를 함께 반환한다. */
export async function getPublicUserContributions(
    db: D1Database,
    userId: string,
    limit: number,
    offset: number,
): Promise<{
    contributions: PublicContributionItem[];
    total: number;
    topic_contributions: TopicContribution[];
}> {
    const [contributionResult, countResult, topicResult] = await Promise.all([
        db.prepare(
            `SELECT r.id AS revision_id, r.summary, r.created_at, p.slug
             FROM revisions r
             JOIN pages p ON p.id = r.page_id
             WHERE r.author_id = ? AND ${PUBLIC_CONTRIBUTION_FILTER}
             ORDER BY r.created_at DESC
             LIMIT ? OFFSET ?`
        ).bind(userId, limit, offset).all<PublicContributionItem>(),
        db.prepare(
            `SELECT COUNT(*) AS total
             FROM revisions r
             JOIN pages p ON p.id = r.page_id
             WHERE r.author_id = ? AND ${PUBLIC_CONTRIBUTION_FILTER}`
        ).bind(userId).first<{ total: number }>(),
        db.prepare(
            `SELECT pc.category,
                    COUNT(DISTINCT r.page_id) AS document_count,
                    COUNT(DISTINCT r.id) AS edit_count,
                    MAX(r.created_at) AS last_contributed_at
             FROM revisions r
             JOIN pages p ON p.id = r.page_id
             JOIN page_categories pc ON pc.page_id = p.id
             WHERE r.author_id = ? AND ${PUBLIC_CONTRIBUTION_FILTER}
               AND TRIM(pc.category) <> ''
             GROUP BY pc.category
             ORDER BY document_count DESC, last_contributed_at DESC, pc.category COLLATE NOCASE
             LIMIT 8`
        ).bind(userId).all<TopicContribution>(),
    ]);

    return {
        contributions: contributionResult.results || [],
        total: Number(countResult?.total || 0),
        topic_contributions: (topicResult.results || []).map(row => ({
            ...row,
            document_count: Number(row.document_count || 0),
            edit_count: Number(row.edit_count || 0),
            last_contributed_at: Number(row.last_contributed_at || 0),
        })),
    };
}

/** 관리자 실험 화면용: 공개 기여가 쌓인 분야를 누적 활동순으로 보여준다. */
export async function getPublicTopicContributionOverview(
    db: D1Database,
    limit = 20,
): Promise<TopicContributionOverview[]> {
    const { results } = await db.prepare(
        `SELECT pc.category,
                COUNT(DISTINCT p.id) AS document_count,
                COUNT(DISTINCT r.author_id) AS contributor_count,
                COUNT(DISTINCT r.id) AS edit_count,
                MAX(r.created_at) AS last_contributed_at
         FROM revisions r
         JOIN pages p ON p.id = r.page_id
         JOIN page_categories pc ON pc.page_id = p.id
         JOIN users u ON u.id = r.author_id
         WHERE ${PUBLIC_CONTRIBUTION_FILTER}
           AND u.role <> 'deleted'
           AND TRIM(pc.category) <> ''
         GROUP BY pc.category
         ORDER BY edit_count DESC, document_count DESC, pc.category COLLATE NOCASE
         LIMIT ?`
    ).bind(limit).all<TopicContributionOverview>();

    return (results || []).map(row => ({
        ...row,
        document_count: Number(row.document_count || 0),
        contributor_count: Number(row.contributor_count || 0),
        edit_count: Number(row.edit_count || 0),
        last_contributed_at: Number(row.last_contributed_at || 0),
    }));
}
