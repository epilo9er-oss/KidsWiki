import assert from 'node:assert/strict';
import test from 'node:test';
import {
    canOfferOAuthSignup,
    createUserWithIdentity,
    getAccountDeletionDecision,
    getIdentityUnlinkDecision,
    parsePendingOAuthIdentity,
} from '../src/routes/auth/identities.ts';
import { parsePendingAccountMerge } from '../src/routes/auth/accountMerge.ts';
import { createUserId, isUserId } from '../src/shared/userId.ts';

test('사용자 ID는 22자리 Base58 문자열로 생성된다', () => {
    const ids = new Set(Array.from({ length: 100 }, createUserId));
    assert.equal(ids.size, 100);
    assert.ok([...ids].every(isUserId));
    assert.equal(isUserId('0OIl123456789ABCDEFGH'), false);
});

test('미등록 OAuth 후보는 서버가 만든 전체 형태만 허용한다', () => {
    const valid = JSON.stringify({
        profile: { provider: 'kakao', uid: 'kakao-user', name: '사용자' },
        remember: false,
        redirectUrl: '/w/문서',
        browserNonce: '00000000-0000-4000-8000-000000000000',
    });
    assert.equal(parsePendingOAuthIdentity(valid)?.profile.provider, 'kakao');
    assert.equal(parsePendingOAuthIdentity('{"profile":{"provider":"naver"}}'), null);
});

test('이메일이 없는 OAuth 사용자도 신규 가입 선택을 할 수 있다', () => {
    assert.equal(canOfferOAuthSignup(undefined, false), true);
    assert.equal(canOfferOAuthSignup('existing@example.com', true), false);
    assert.equal(canOfferOAuthSignup('new@example.com', false), true);
});

test('일반 사용자와 최고 관리자의 연결 해지·탈퇴 규칙을 구분한다', () => {
    const identities = [
        { provider: 'google', provider_email: null, primary: true },
        { provider: 'naver', provider_email: null, primary: false },
    ];

    assert.equal(getIdentityUnlinkDecision(identities, 'google', false), 'allowed');
    assert.equal(getIdentityUnlinkDecision(identities, 'google', true), 'primary_super_admin');
    assert.equal(getIdentityUnlinkDecision(identities, 'naver', true), 'allowed');
    assert.equal(getIdentityUnlinkDecision([identities[0]], 'google', false), 'last_identity');
    assert.equal(getAccountDeletionDecision(2, false), 'links_remaining');
    assert.equal(getAccountDeletionDecision(1, false), 'allowed');
    assert.equal(getAccountDeletionDecision(1, true), 'last_super_admin');
});

test('신규 사용자와 identity에는 이메일 없음이 NULL로 저장된다', async () => {
    const batches = [];
    const db = {
        prepare(sql) {
            return {
                sql,
                args: [],
                bind(...args) {
                    return { sql, args };
                },
            };
        },
        async batch(statements) {
            batches.push(statements);
            return [];
        },
    };

    await createUserWithIdentity(db, {
        provider: 'kakao',
        uid: 'kakao-user',
        name: '카카오 사용자',
    });

    const inserts = batches.at(-1);
    assert.equal(inserts[0].args[3], null);
    assert.equal(inserts[1].args[3], null);
});

test('계정 병합 후보는 서로 다른 유효 사용자와 OAuth 소유권 증명을 요구한다', () => {
    const valid = JSON.stringify({
        survivorUserId: '123456789ABCDEFGHJKLMN',
        absorbedUserId: '23456789ABCDEFGHJKLMNP',
        absorbedIdentity: { provider: 'naver', uid: 'naver-user' },
        browserNonce: '00000000-0000-4000-8000-000000000000',
    });
    assert.equal(parsePendingAccountMerge(valid)?.absorbedIdentity.provider, 'naver');
    assert.equal(parsePendingAccountMerge(valid.replace('23456789ABCDEFGHJKLMNP', '123456789ABCDEFGHJKLMN')), null);
});
