export interface CryptoAdapter {
  unwrapKey(wrapped: Uint8Array, wrapPrivate: CryptoKey): Promise<Uint8Array>;
  decrypt(aad: Uint8Array, nonce: Uint8Array, ct: Uint8Array, key: CryptoKey): Promise<Uint8Array>;
  verifyIndex(index: Uint8Array, sig: Uint8Array, signPublic: CryptoKey): Promise<boolean>;
}

const bs = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

export const webCryptoAdapter: CryptoAdapter = {
  async unwrapKey(wrapped: Uint8Array, wrapPrivate: CryptoKey): Promise<Uint8Array> {
    const key = await crypto.subtle.unwrapKey(
      "raw",
      bs(wrapped),
      wrapPrivate,
      { name: "RSA-OAEP" },
      { name: "AES-GCM", length: 256 },
      true,
      ["decrypt"],
    );
    return new Uint8Array(await crypto.subtle.exportKey("raw", key));
  },

  async decrypt(aad: Uint8Array, nonce: Uint8Array, ct: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: bs(nonce), additionalData: bs(aad) },
        key,
        bs(ct),
      ),
    );
  },

  async verifyIndex(index: Uint8Array, sig: Uint8Array, signPublic: CryptoKey): Promise<boolean> {
    return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, signPublic, bs(sig), bs(index));
  },
};
