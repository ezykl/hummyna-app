const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64 without relying on a global `btoa` (not guaranteed on Hermes). */
export function toBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    parts.push(B64[b0 >> 2], B64[((b0 & 3) << 4) | (b1 >> 4)]);
    parts.push(i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : "=");
    parts.push(i + 2 < bytes.length ? B64[b2 & 63] : "=");
  }
  return parts.join("");
}
