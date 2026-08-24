import { escapeHtml } from './html.ts';
import { isSafeUrl } from './url.ts';

const PRIVATE_AVATAR_PATH = '/avatar-default.svg';

export function avatarInitial(name: string | null | undefined): string {
    const first = Array.from(name?.trim() || '')[0];
    return first ? first.toLocaleUpperCase() : '?';
}

function usablePictureUrl(picture: string | null | undefined): string | null {
    if (!isSafeUrl(picture)) return null;

    const url = new URL(picture!, window.location.origin);
    if (url.origin === window.location.origin && url.pathname === PRIVATE_AVATAR_PATH) return null;
    return picture!;
}

export function renderUserAvatar(
    picture: string | null | undefined,
    name: string | null | undefined,
    size = 32,
    className = '',
): string {
    const avatarSize = Number.isFinite(size) && size > 0 ? Math.round(size) : 32;
    const initial = escapeHtml(avatarInitial(name));
    const label = escapeHtml(`${name?.trim() || '사용자'} 프로필 사진`);
    const classes = className.trim() ? ` ${escapeHtml(className.trim())}` : '';
    const pictureUrl = usablePictureUrl(picture);
    const image = pictureUrl
        ? `<img src="${escapeHtml(pictureUrl)}" alt="" data-profile-avatar>`
        : '';

    return `<span class="profile-avatar-fallback${classes}" style="width:${avatarSize}px;height:${avatarSize}px;font-size:${Math.max(11, Math.round(avatarSize * 0.4))}px" role="img" aria-label="${label}">${initial}${image}</span>`;
}

if (typeof document !== 'undefined') {
    document.addEventListener('error', (event) => {
        const image = event.target;
        if (image instanceof HTMLImageElement && image.hasAttribute('data-profile-avatar')) image.remove();
    }, true);
}
