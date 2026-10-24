export const AAD_SIZE = 16; // number u32LE | offset u64LE | length u32LE

export function aadBytes(number: number, offset: number, length: number): Uint8Array {
  const b = new Uint8Array(AAD_SIZE);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, number, true);
  dv.setBigUint64(4, BigInt(offset), true);
  dv.setUint32(12, length, true);
  return b;
}
