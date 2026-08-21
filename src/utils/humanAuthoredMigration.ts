// revisions 테이블에 human_authored 컬럼이 누락된 기존 D1 데이터베이스를 위한
// idempotent 런타임 마이그레이션.
//
// human_authored: 작성자가 "인공지능이 아닌 사람이 쓴 글" 을 스스로 선언한 리비전 플래그.
// 문서 조회 응답과 문서 하단 배지 렌더가 이 컬럼을 참조하므로, 컬럼이 없는 레거시 환경에서는
// `no such column: human_authored` 로 실패한다.
//
// 신선한 환경에서는 migrations/schema.sql 의 CREATE TABLE 이 이미 컬럼을 포함하므로 본 함수는
// PRAGMA 조회만 하고 즉시 종료한다. 기존 배포 환경에서는 ALTER TABLE 로 컬럼을 추가한다.
// SQLite 의 ALTER ADD COLUMN 은 IF NOT EXISTS 를 지원하지 않으므로 PRAGMA table_info 로
// 미리 확인한 뒤 필요한 ALTER 만 실행한다.
//
// 기존 리비전은 DEFAULT 0 으로 채워진다 — 선언하지 않은 과거 편집에 배지를 소급 부여하지
// 않는 것이 의도된 동작이다(선언은 사람이 직접 한 것만 유효해야 한다).
//
// Workers 의 isolate 가 살아있는 동안은 결과를 캐시해 PRAGMA 조회를 한 번만 수행한다.
// 실패 시 캐시를 비워 다음 호출에서 재시도하도록 한다. 콜드 스타트마다 최대 1회만 실행.
// (구조는 revisionsVirtualMigration.ts 와 동일 — 같은 테이블의 컬럼 추가 선례다.)

let migrationDone = false;
let migrationInflight: Promise<void> | null = null;

export function resetHumanAuthoredMigrationCacheForTests() {
    migrationDone = false;
    migrationInflight = null;
}

export async function ensureHumanAuthoredMigration(db: D1Database): Promise<void> {
    if (migrationDone) return;
    if (migrationInflight) return migrationInflight;
    migrationInflight = (async () => {
        try {
            const cols = await db.prepare('PRAGMA table_info(revisions)').all<{ name: string }>();
            const have = new Set(cols.results.map(c => c.name));
            if (!have.has('human_authored')) {
                await db.prepare('ALTER TABLE revisions ADD COLUMN human_authored INTEGER NOT NULL DEFAULT 0').run();
            }
            migrationDone = true;
        } catch (e) {
            migrationInflight = null;
            console.error('ensureHumanAuthoredMigration failed:', e);
            return;
        } finally {
            migrationInflight = null;
        }
    })();
    return migrationInflight!;
}
