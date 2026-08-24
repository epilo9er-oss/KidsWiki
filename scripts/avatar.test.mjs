import assert from 'node:assert/strict';
import test from 'node:test';
import { avatarInitial, renderUserAvatar } from '../src/client/utils/avatar.ts';

globalThis.window = { location: { origin: 'https://kidswiki.example' } };

test('user avatars fall back to the display-name initial', () => {
    assert.equal(avatarInitial(' Eugene '), 'E');
    assert.equal(avatarInitial('키즈위키'), '키');
    assert.equal(avatarInitial(''), '?');

    const missing = renderUserAvatar(null, 'Eugene', 32);
    assert.match(missing, />E</);
    assert.doesNotMatch(missing, /<img/);

    const privatePicture = renderUserAvatar('/avatar-default.svg', 'Eugene', 32);
    assert.match(privatePicture, />E</);
    assert.doesNotMatch(privatePicture, /<img/);

    const unsafe = renderUserAvatar('javascript:alert(1)', 'Eugene', 32);
    assert.doesNotMatch(unsafe, /<img/);

    const escapedName = renderUserAvatar(null, '<script>', 32);
    assert.match(escapedName, /&lt;/);
    assert.doesNotMatch(escapedName, /<script>/);

    const photo = renderUserAvatar('https://images.example/eugene.jpg', 'Eugene', 32);
    assert.match(photo, /data-profile-avatar/);
    assert.match(photo, /<img src="https:\/\/images\.example\/eugene\.jpg"/);
});
