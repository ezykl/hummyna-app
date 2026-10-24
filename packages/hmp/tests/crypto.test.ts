import { describe, expect, it } from "vitest";
import { webCryptoAdapter } from "../src/adapters/crypto";

const bs = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

async function rsaPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["wrapKey", "unwrapKey"],
  );
}

async function ecPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
}

describe("webCryptoAdapter", () => {
  it("wraps and unwraps a 32-byte key", async () => {
    const pair = await rsaPair();
    const key = new Uint8Array(32).fill(7);
    const aes = await crypto.subtle.importKey("raw", bs(key), { name: "AES-GCM" }, true, ["wrapKey"]);
    const wrapped = new Uint8Array(
      await crypto.subtle.wrapKey("raw", aes, pair.publicKey, { name: "RSA-OAEP" }),
    );
    const back = await webCryptoAdapter.unwrapKey(wrapped, pair.privateKey);
    expect(Array.from(back)).toEqual(Array.from(key));
  });

  it("decrypts AES-GCM with AAD", async () => {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const aad = new Uint8Array([1, 2, 3, 4]);
    const pt = new TextEncoder().encode("hello karaoke");
    const ct = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv: bs(nonce), additionalData: bs(aad) }, key, bs(pt)),
    );
    const back = await webCryptoAdapter.decrypt(aad, nonce, ct, key);
    expect(new TextDecoder().decode(back)).toBe("hello karaoke");
  });

  it("verifies a P1363 ECDSA signature and rejects a tampered one", async () => {
    const pair = await ecPair();
    const index = new TextEncoder().encode("index-bytes");
    const sig = new Uint8Array(
      await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, bs(index)),
    );
    expect(sig.length).toBe(64);
    expect(await webCryptoAdapter.verifyIndex(index, sig, pair.publicKey)).toBe(true);
    const tampered = index.slice();
    tampered[0] ^= 1;
    expect(await webCryptoAdapter.verifyIndex(tampered, sig, pair.publicKey)).toBe(false);
  });
});
