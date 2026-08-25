import assert from 'node:assert/strict';
import test from 'node:test';
import { decideUnknownIdentity, parsePendingIdentityLink } from '../src/routes/auth/identities.ts';
import { createUserId, isUserId } from '../src/shared/userId.ts';

test('사용자 ID는 22자리 Base58 문자열로 생성된다', () => {
    const ids = new Set(Array.from({ length: 100 }, createUserId));
    assert.equal(ids.size, 100);
    assert.ok([...ids].every(isUserId));
    assert.equal(isUserId('0OIl123456789ABCDEFGH'), false);
});

test('같은 이메일은 자동 병합하지 않고 기존 계정 재인증을 요구한다', () => {
    assert.equal(decideUnknownIdentity(0, false), 'create_user');
    assert.equal(decideUnknownIdentity(1, false), 'require_reauthentication');
    assert.equal(decideUnknownIdentity(1, true), 'conflict');
    assert.equal(decideUnknownIdentity(2, false), 'conflict');
});

test('계정 연결 후보는 서버가 만든 전체 형태만 허용한다', () => {
    const valid = JSON.stringify({
        targetUserId: '123456789ABCDEFGHJKLMN',
        candidate: { provider: 'naver', uid: 'naver-user', email: 'user@example.com' },
        remember: false,
        browserNonce: '00000000-0000-4000-8000-000000000000',
    });
    assert.equal(parsePendingIdentityLink(valid)?.candidate.provider, 'naver');
    assert.equal(parsePendingIdentityLink('{"targetUserId":"bad"}'), null);
});
