const USER_ID_LENGTH = 22;
const USER_ID_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const USER_ID_PATTERN = new RegExp(`^[1-9A-HJ-NP-Za-km-z]{${USER_ID_LENGTH}}$`);

export type UserId = string;

export function isUserId(value: unknown): value is UserId {
    return typeof value === 'string' && USER_ID_PATTERN.test(value);
}

export function createUserId(): UserId {
    let id = '';
    const bytes = new Uint8Array(USER_ID_LENGTH);
    while (id.length < USER_ID_LENGTH) {
        crypto.getRandomValues(bytes);
        for (const byte of bytes) {
            // 232 = 58 × 4. 나머지 24개 값을 버려 modulo 편향을 없앤다.
            if (byte >= 232) continue;
            id += USER_ID_ALPHABET[byte % USER_ID_ALPHABET.length];
            if (id.length === USER_ID_LENGTH) break;
        }
    }
    return id;
}
