const BASE64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const BASE64_LOOKUP = new Int16Array(128).fill(-1);
for (let i = 0; i < BASE64.length; i++) {
  BASE64_LOOKUP[BASE64.charCodeAt(i)] = i;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let result = '';
  const len = bytes.length;

  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;

    result += BASE64[b0 >> 2];
    result += BASE64[((b0 & 3) << 4) | (b1 >> 4)];
    result += i + 1 < len ? BASE64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < len ? BASE64[b2 & 63] : '=';
  }

  return result;
}

export function base64ToBytes(base64: string): Uint8Array {
  const cleaned = base64.replace(/[\s\r\n]+/g, '');
  if (cleaned.length === 0 || cleaned.length % 4 !== 0) {
    throw new Error('Invalid base64 length');
  }

  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
  const outLen = Math.floor((cleaned.length * 3) / 4) - padding;
  const out = new Uint8Array(outLen);

  let outIdx = 0;
  for (let i = 0; i < cleaned.length; i += 4) {
    const c0 = cleaned.charCodeAt(i);
    const c1 = cleaned.charCodeAt(i + 1);
    const c2 = cleaned.charCodeAt(i + 2);
    const c3 = cleaned.charCodeAt(i + 3);

    const b0 = BASE64_LOOKUP[c0];
    const b1 = BASE64_LOOKUP[c1];
    const b2 = c2 === 61 ? 0 : BASE64_LOOKUP[c2];
    const b3 = c3 === 61 ? 0 : BASE64_LOOKUP[c3];

    if (b0 < 0 || b1 < 0 || (c2 !== 61 && b2 < 0) || (c3 !== 61 && b3 < 0)) {
      throw new Error('Invalid base64 character');
    }

    out[outIdx++] = (b0 << 2) | (b1 >> 4);
    if (c2 !== 61) out[outIdx++] = ((b1 & 15) << 4) | (b2 >> 2);
    if (c3 !== 61) out[outIdx++] = ((b2 & 3) << 6) | b3;
  }

  return out;
}

export function base64DecodedLength(base64: string): number {
  if (!base64 || base64.length % 4 !== 0) return -1;

  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}
