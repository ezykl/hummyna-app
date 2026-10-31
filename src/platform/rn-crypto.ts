import type { CryptoAdapter } from "@hummyna/hmp";
import { Crypto } from "@peculiar/webcrypto";

// Pure-JS WebCrypto: runs on React Native (no native module) and is Node-testable.
const subtle = new Crypto().subtle;

const bs = (u: Uint8Array): BufferSource => u as unknown as BufferSource;
const key = (k: unknown): CryptoKey => k as CryptoKey;

export const rnCryptoAdapter: CryptoAdapter = {
  async importWrapPrivate(jwk: JsonWebKey): Promise<CryptoKey> {
    return key(
      await subtle.importKey("jwk", jwk, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["unwrapKey"]),
    );
  },

  async importSignPublic(jwk: JsonWebKey): Promise<CryptoKey> {
    return key(
      await subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]),
    );
  },

  async unwrapKey(wrapped: Uint8Array, wrapPrivate: CryptoKey): Promise<Uint8Array> {
    const unwrapped = await subtle.unwrapKey(
      "raw",
      bs(wrapped),
      key(wrapPrivate),
      { name: "RSA-OAEP" },
      { name: "AES-GCM", length: 256 },
      true,
      ["decrypt"],
    );
    return new Uint8Array(await subtle.exportKey("raw", unwrapped));
  },

  async decrypt(aad: Uint8Array, nonce: Uint8Array, ct: Uint8Array, rawKey: Uint8Array): Promise<Uint8Array> {
    const aes = await subtle.importKey("raw", bs(rawKey), { name: "AES-GCM" }, false, ["decrypt"]);
    return new Uint8Array(
      await subtle.decrypt(
        { name: "AES-GCM", iv: bs(nonce), additionalData: bs(aad) },
        aes,
        bs(ct),
      ),
    );
  },

  async verifyIndex(index: Uint8Array, sig: Uint8Array, signPublic: CryptoKey): Promise<boolean> {
    return subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key(signPublic), bs(sig), bs(index));
  },
};
