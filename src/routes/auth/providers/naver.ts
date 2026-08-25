import type { Context } from 'hono';
import type { Env } from '../../../types';
import type { OAuthCallbackResult, OAuthProvider, OAuthStateData } from './base';
import { consumeOAuthState, createOAuthState } from './state';

export const naverProvider: OAuthProvider = {
    name: 'naver',
    label: '네이버',

    async handleLogin(c: Context<Env>, stateData?: Partial<OAuthStateData>): Promise<Response> {
        if (!c.env.NAVER_CLIENT_ID || !c.env.NAVER_CLIENT_SECRET || !c.env.NAVER_REDIRECT_URI) {
            return c.redirect('/?error=oauth_not_configured&provider=naver');
        }

        const state = await createOAuthState(c, 'naver', stateData);
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: c.env.NAVER_CLIENT_ID,
            redirect_uri: c.env.NAVER_REDIRECT_URI,
            state,
        });
        return c.redirect(`https://nid.naver.com/oauth2.0/authorize?${params.toString()}`);
    },

    async handleCallback(c: Context<Env>): Promise<OAuthCallbackResult | Response> {
        if (!c.env.NAVER_CLIENT_ID || !c.env.NAVER_CLIENT_SECRET || !c.env.NAVER_REDIRECT_URI) {
            return c.redirect('/?error=oauth_not_configured&provider=naver');
        }
        const stateData = await consumeOAuthState(c, 'naver');
        if (stateData instanceof Response) return stateData;

        const code = c.req.query('code');
        if (!code || c.req.query('error')) {
            return c.redirect('/?error=auth_missing_code&provider=naver');
        }

        const tokenRes = await fetch('https://nid.naver.com/oauth2.0/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: c.env.NAVER_CLIENT_ID,
                client_secret: c.env.NAVER_CLIENT_SECRET,
                code,
                state: c.req.query('state') || '',
            }),
        });
        if (!tokenRes.ok) {
            console.error('Naver token exchange failed:', await tokenRes.text());
            return c.redirect('/?error=auth_token_exchange_failed&provider=naver');
        }
        const token = await tokenRes.json<{ access_token?: string; error?: string }>();
        if (!token.access_token) {
            console.error('Naver token exchange failed:', token.error || 'missing access_token');
            return c.redirect('/?error=auth_token_exchange_failed&provider=naver');
        }

        const userRes = await fetch('https://openapi.naver.com/v1/nid/me', {
            headers: { Authorization: `Bearer ${token.access_token}` },
        });
        if (!userRes.ok) return c.redirect('/?error=auth_user_info_failed&provider=naver');

        const data = await userRes.json<{
            resultcode: string;
            response?: {
                id?: string;
                email?: string;
                name?: string;
                nickname?: string;
                profile_image?: string;
            };
        }>();
        if (data.resultcode !== '00' || !data.response?.id) {
            return c.redirect('/?error=auth_user_info_failed&provider=naver');
        }

        return {
            profile: {
                provider: 'naver',
                uid: data.response.id,
                email: data.response.email || undefined,
                name: data.response.nickname || data.response.name || '네이버 사용자',
                picture: data.response.profile_image || undefined,
            },
            state: stateData,
        };
    },
};
