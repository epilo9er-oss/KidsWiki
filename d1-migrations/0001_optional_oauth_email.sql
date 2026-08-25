-- OAuth 공급자의 불변 ID가 로그인 식별자이므로 users.email은 선택 정보로 둔다.
-- D1은 ALTER COLUMN을 지원하지 않아 테이블을 재작성한다. 외래 키 검사는 트랜잭션
-- 끝까지 미룬다. DROP TABLE이 ON DELETE CASCADE/SET NULL을 실행하지 않도록 모든
-- 사용자 참조를 Base58에 없는 '~' 접두사로 잠시 분리했다가 새 부모 테이블 생성 후 복원한다.
PRAGMA defer_foreign_keys = ON;

-- 기존 운영 DB에는 계정 합치기 기능보다 먼저 생성되어 이 테이블이 없을 수 있다.
CREATE TABLE IF NOT EXISTS user_id_aliases (
  alias_id          TEXT NOT NULL PRIMARY KEY COLLATE BINARY,
  canonical_user_id TEXT NOT NULL,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK(alias_id != canonical_user_id),
  FOREIGN KEY (canonical_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_user_id_aliases_canonical
  ON user_id_aliases(canonical_user_id);

CREATE TABLE users_optional_email_new (
  id                TEXT NOT NULL PRIMARY KEY COLLATE BINARY
                    CHECK(length(id) = 22 AND id NOT GLOB '*[^1-9A-HJ-NP-Za-km-z]*'),
  provider          TEXT NOT NULL,
  uid               TEXT NOT NULL,
  email             TEXT UNIQUE,
  name              TEXT NOT NULL,
  picture           TEXT,
  picture_private   INTEGER NOT NULL DEFAULT 0,
  mcp_instant_apply INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER DEFAULT (unixepoch()),
  role              TEXT DEFAULT 'user',
  banned_until      INTEGER,
  last_namechange   INTEGER,
  UNIQUE(provider, uid)
);

INSERT INTO users_optional_email_new (
  id, provider, uid, email, name, picture, picture_private, mcp_instant_apply,
  created_at, role, banned_until, last_namechange
)
SELECT
  id, provider, uid, email, name, picture, picture_private, mcp_instant_apply,
  created_at, role, banned_until, last_namechange
FROM users;

UPDATE user_identities SET user_id = '~' || user_id;
UPDATE user_id_aliases SET canonical_user_id = '~' || canonical_user_id;
UPDATE sessions SET user_id = '~' || user_id;
UPDATE qr_login_sessions SET approved_user_id = '~' || approved_user_id WHERE approved_user_id IS NOT NULL;
UPDATE revisions SET author_id = '~' || author_id WHERE author_id IS NOT NULL;
UPDATE media SET uploader_id = '~' || uploader_id WHERE uploader_id IS NOT NULL;
UPDATE category_acl SET created_by = '~' || created_by WHERE created_by IS NOT NULL;
UPDATE notifications SET user_id = '~' || user_id;
UPDATE messages SET sender_id = '~' || sender_id, receiver_id = '~' || receiver_id;
UPDATE discussions SET author_id = '~' || author_id WHERE author_id IS NOT NULL;
UPDATE discussion_comments SET author_id = '~' || author_id WHERE author_id IS NOT NULL;
UPDATE tickets SET user_id = '~' || user_id;
UPDATE ticket_comments SET author_id = '~' || author_id WHERE author_id IS NOT NULL;
UPDATE admin_log SET user = '~' || user;
UPDATE mcp_drafts SET user_id = '~' || user_id;
UPDATE pending_edits SET author_id = '~' || author_id;
UPDATE signup_requests SET reviewed_by = '~' || reviewed_by WHERE reviewed_by IS NOT NULL;
UPDATE discussion_mutes SET user_id = '~' || user_id;
UPDATE page_watches SET user_id = '~' || user_id;
UPDATE category_watches SET user_id = '~' || user_id;
UPDATE category_prefix_rules SET created_by = '~' || created_by WHERE created_by IS NOT NULL;
UPDATE doc_setting_prefix_rules SET created_by = '~' || created_by WHERE created_by IS NOT NULL;
UPDATE palettes SET created_by = '~' || created_by WHERE created_by IS NOT NULL;
UPDATE push_subscriptions SET user_id = '~' || user_id WHERE user_id IS NOT NULL;
UPDATE oauth_codes SET user_id = '~' || user_id;
UPDATE oauth_tokens SET user_id = '~' || user_id;
UPDATE mcp_api_keys SET user_id = '~' || user_id;

DROP TABLE users;
ALTER TABLE users_optional_email_new RENAME TO users;
CREATE INDEX idx_users_created ON users(created_at DESC);

UPDATE user_identities SET user_id = substr(user_id, 2) WHERE user_id LIKE '~%';
UPDATE user_id_aliases SET canonical_user_id = substr(canonical_user_id, 2) WHERE canonical_user_id LIKE '~%';
UPDATE sessions SET user_id = substr(user_id, 2) WHERE user_id LIKE '~%';
UPDATE qr_login_sessions SET approved_user_id = substr(approved_user_id, 2) WHERE approved_user_id LIKE '~%';
UPDATE revisions SET author_id = substr(author_id, 2) WHERE author_id LIKE '~%';
UPDATE media SET uploader_id = substr(uploader_id, 2) WHERE uploader_id LIKE '~%';
UPDATE category_acl SET created_by = substr(created_by, 2) WHERE created_by LIKE '~%';
UPDATE notifications SET user_id = substr(user_id, 2) WHERE user_id LIKE '~%';
UPDATE messages SET sender_id = substr(sender_id, 2), receiver_id = substr(receiver_id, 2)
WHERE sender_id LIKE '~%' AND receiver_id LIKE '~%';
UPDATE discussions SET author_id = substr(author_id, 2) WHERE author_id LIKE '~%';
UPDATE discussion_comments SET author_id = substr(author_id, 2) WHERE author_id LIKE '~%';
UPDATE tickets SET user_id = substr(user_id, 2) WHERE user_id LIKE '~%';
UPDATE ticket_comments SET author_id = substr(author_id, 2) WHERE author_id LIKE '~%';
UPDATE admin_log SET user = substr(user, 2) WHERE user LIKE '~%';
UPDATE mcp_drafts SET user_id = substr(user_id, 2) WHERE user_id LIKE '~%';
UPDATE pending_edits SET author_id = substr(author_id, 2) WHERE author_id LIKE '~%';
UPDATE signup_requests SET reviewed_by = substr(reviewed_by, 2) WHERE reviewed_by LIKE '~%';
UPDATE discussion_mutes SET user_id = substr(user_id, 2) WHERE user_id LIKE '~%';
UPDATE page_watches SET user_id = substr(user_id, 2) WHERE user_id LIKE '~%';
UPDATE category_watches SET user_id = substr(user_id, 2) WHERE user_id LIKE '~%';
UPDATE category_prefix_rules SET created_by = substr(created_by, 2) WHERE created_by LIKE '~%';
UPDATE doc_setting_prefix_rules SET created_by = substr(created_by, 2) WHERE created_by LIKE '~%';
UPDATE palettes SET created_by = substr(created_by, 2) WHERE created_by LIKE '~%';
UPDATE push_subscriptions SET user_id = substr(user_id, 2) WHERE user_id LIKE '~%';
UPDATE oauth_codes SET user_id = substr(user_id, 2) WHERE user_id LIKE '~%';
UPDATE oauth_tokens SET user_id = substr(user_id, 2) WHERE user_id LIKE '~%';
UPDATE mcp_api_keys SET user_id = substr(user_id, 2) WHERE user_id LIKE '~%';

CREATE TABLE signup_requests_optional_email_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  provider        TEXT NOT NULL DEFAULT 'google',
  uid             TEXT NOT NULL,
  email           TEXT,
  name            TEXT NOT NULL,
  picture         TEXT,
  picture_private INTEGER NOT NULL DEFAULT 0,
  message         TEXT DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'pending',
  reviewed_by     TEXT,
  created_at      INTEGER DEFAULT (unixepoch()),
  reviewed_at     INTEGER,
  FOREIGN KEY (reviewed_by) REFERENCES users(id)
);

INSERT INTO signup_requests_optional_email_new (
  id, provider, uid, email, name, picture, picture_private, message, status,
  reviewed_by, created_at, reviewed_at
)
SELECT
  id, provider, uid, email, name, picture, picture_private, message, status,
  reviewed_by, created_at, reviewed_at
FROM signup_requests;

UPDATE push_subscriptions
SET signup_request_id = -signup_request_id
WHERE signup_request_id IS NOT NULL;

DROP TABLE signup_requests;
ALTER TABLE signup_requests_optional_email_new RENAME TO signup_requests;
CREATE INDEX idx_signup_requests_status ON signup_requests(status);
CREATE INDEX idx_signup_requests_provider_uid ON signup_requests(provider, uid);
CREATE INDEX idx_signup_requests_created ON signup_requests(created_at DESC);

UPDATE push_subscriptions
SET signup_request_id = -signup_request_id
WHERE signup_request_id IS NOT NULL AND signup_request_id < 0;
