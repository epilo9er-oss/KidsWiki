import type { Context } from 'hono';
import type { Env } from '../../../types';
import type { OAuthCallbackResult, OAuthProvider, OAuthStateData } from './base';
import { consumeOAuthState, createOAuthState } from './state';

export const kakaoProvider: OAuthProvider = {
    name: 'kakao',
    label: '카카오',

    async handleLogin(c: Context<Env>, stateData?: Partial<OAuthStateData>): Promise<Response> {
        if (!c.env.KAKAO_CLIENT_ID || !c.env.KAKAO_REDIRECT_URI) {
            return c.redirect('/?error=oauth_not_configured&provider=kakao');
        }

        const state = await createOAuthState(c, 'kakao', stateData);
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: c.env.KAKAO_CLIENT_ID,
            redirect_uri: c.env.KAKAO_REDIRECT_URI,
            state,
        });
        if (stateData?.intent === 'link' || stateData?.intent === 'confirm_link') {
            params.set('prompt', 'select_account');
        }
        return c.redirect(`https://kauth.kakao.com/oauth/authorize?${params.toString()}`);
    },

    async handleCallback(c: Context<Env>): Promise<OAuthCallbackResult | Response> {
        if (!c.env.KAKAO_CLIENT_ID || !c.env.KAKAO_REDIRECT_URI) {
            return c.redirect('/?error=oauth_not_configured&provider=kakao');
        }
        const stateData = await consumeOAuthState(c, 'kakao');
        if (stateData instanceof Response) return stateData;

        const code = c.req.query('code');
        if (!code || c.req.query('error')) {
            return c.redirect('/?error=auth_missing_code&provider=kakao');
        }

        const tokenBody = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: c.env.KAKAO_CLIENT_ID,
            redirect_uri: c.env.KAKAO_REDIRECT_URI,
            code,
        });
        if (c.env.KAKAO_CLIENT_SECRET) tokenBody.set('client_secret', c.env.KAKAO_CLIENT_SECRET);

        const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenBody,
        });
        if (!tokenRes.ok) {
            console.error('Kakao token exchange failed:', await tokenRes.text());
            return c.redirect('/?error=auth_token_exchange_failed&provider=kakao');
        }
        const token = await tokenRes.json<{ access_token?: string }>();
        if (!token.access_token) return c.redirect('/?error=auth_token_exchange_failed&provider=kakao');

        const userRes = await fetch('https://kapi.kakao.com/v2/user/me', {
            headers: { Authorization: `Bearer ${token.access_token}` },
        });
        if (!userRes.ok) return c.redirect('/?error=auth_user_info_failed&provider=kakao');

        const data = await userRes.json<{
            id?: number;
            kakao_account?: {
                email?: string;
                is_email_valid?: boolean;
                is_email_verified?: boolean;
                profile?: { nickname?: string; profile_image_url?: string };
            };
            properties?: { nickname?: string; profile_image?: string };
        }>();
        if (data.id === undefined) return c.redirect('/?error=auth_user_info_failed&provider=kakao');

        const account = data.kakao_account;
        const verifiedEmail = account?.email && account.is_email_valid && account.is_email_verified
            ? account.email
            : undefined;
        return {
            profile: {
                provider: 'kakao',
                uid: String(data.id),
                email: verifiedEmail,
                name: account?.profile?.nickname || data.properties?.nickname || '카카오 사용자',
                picture: account?.profile?.profile_image_url || data.properties?.profile_image || undefined,
            },
            state: stateData,
        };
    },
};
