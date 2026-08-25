/**
 * 사용자 멘션 문법 파서 (서버·클라이언트 공용).
 *
 * 문법: `@[user:123456789ABCDEFGHJKLMN]` — 값은 `users.id`.
 * 식별자는 항상 사용자 id 기준이며(이름 변경에 안전), 토론·티켓 댓글 본문에서만 사용된다.
 */

/** 멘션 토큰 매칭용 정규식. `g` 플래그를 쓰는 호출부는 `lastIndex` 공유를 피하기 위해 새 인스턴스를 만든다. */
export const MENTION_PATTERN = String.raw`@\[user:([1-9A-HJ-NP-Za-km-z]{22})\]`;

/**
 * 마크다운 코드(펜스 ```/~~~ 및 인라인 백틱)를 제거한다.
 * 알림 수신자 추출 전에 호출해, 코드 예시 안의 `@[user:N]` 이 잘못된 멘션 알림(가짜 핑)을
 * 보내지 않도록 한다. 프론트 렌더는 DOM 조상 검사로 코드 내 멘션을 별도 처리한다.
 */
export function stripMarkdownCode(content: string): string {
    if (!content) return '';
    return content
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/~~~[\s\S]*?~~~/g, ' ')
        .replace(/(`+)[\s\S]*?\1/g, ' ');
}

/**
 * 본문에서 멘션된 사용자 id 목록을 중복 없이 추출한다(등장 순서 유지).
 */
export function extractMentionIds(content: string): string[] {
    if (!content) return [];
    const re = new RegExp(MENTION_PATTERN, 'g');
    const ids: string[] = [];
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
        const id = m[1];
        if (seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
    }
    return ids;
}
