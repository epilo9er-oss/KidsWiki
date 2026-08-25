import type { Context } from 'hono';
import type { Env } from '../../../types';
import type { OAuthStateData } from './base';

const STATE_TTL_SECONDS = 300;

function safeRelativeUrl(value?: string): string | undefined {
    return value && value.startsWith('/') && !value.startsWith('//') && !/[\x00-\x1f\x7f]/.test(value)
        ? value
        : undefined;
}

export async function createOAuthState(
    c: Context<Env>,
    provider: string,
    stateData?: Partial<OAuthStateData>,
): Promise<string> {
    const state = crypto.randomUUID();
    const payload: OAuthStateData = {
        provider,
        intent: stateData?.intent ?? 'login',
        userId: stateData?.userId,
        expectedUid: stateData?.expectedUid,
        redirectUrl: safeRelativeUrl(stateData?.redirectUrl ?? c.req.query('redirect')),
        remember: stateData?.remember ?? (c.req.query('remember') === '1'),
        pendingLinkToken: stateData?.pendingLinkToken,
    };
    await c.env.KV.put(`oauth_state:${state}`, JSON.stringify(payload), { expirationTtl: STATE_TTL_SECONDS });
    return state;
}

export async function consumeOAuthState(
    c: Context<Env>,
    provider: string,
): Promise<OAuthStateData | Response> {
    const state = c.req.query('state');
    if (!state) {
        return c.redirect('/error?reason=' + encodeURIComponent('로그인 요청이 올바르지 않습니다. 다시 시도해주세요.'));
    }

    const key = `oauth_state:${state}`;
    const storedRaw = await c.env.KV.get(key);
    if (!storedRaw) {
        return c.redirect('/error?reason=' + encodeURIComponent('로그인 세션이 만료되었거나 유효하지 않습니다. 다시 시도해주세요.'));
    }

    let stateData: OAuthStateData;
    if (storedRaw === provider) {
        stateData = { provider, intent: 'login' };
    } else {
        try {
            stateData = JSON.parse(storedRaw) as OAuthStateData;
        } catch {
            await c.env.KV.delete(key);
            return c.redirect('/error?reason=' + encodeURIComponent('로그인 세션이 올바르지 않습니다. 다시 시도해주세요.'));
        }
    }

    await c.env.KV.delete(key);
    if (stateData.provider !== provider) {
        return c.redirect('/error?reason=' + encodeURIComponent('로그인 세션이 유효하지 않습니다. 다시 시도해주세요.'));
    }
    return stateData;
}
