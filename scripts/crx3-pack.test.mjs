import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildZipArchive, packCrx3 } from "./crx3-pack.mjs";

function readVarint(buffer, start) {
  let value = 0;
  let multiplier = 1;
  let offset = start;
  while (offset < buffer.length) {
    const byte = buffer[offset++];
    value += (byte & 0x7f) * multiplier;
    if ((byte & 0x80) === 0) return { value, offset };
    multiplier *= 128;
  }
  throw new Error("varint 越界");
}

function lengthFields(buffer) {
  const fields = new Map();
  let offset = 0;
  while (offset < buffer.length) {
    const tag = readVarint(buffer, offset);
    const length = readVarint(buffer, tag.offset);
    const end = length.offset + length.value;
    const field = Math.floor(tag.value / 8);
    fields.set(field, buffer.subarray(length.offset, end));
    offset = end;
  }
  return fields;
}

function verifyPackedCrx(buffer) {
  const headerLength = buffer.readUInt32LE(8);
  const zipOffset = 12 + headerLength;
  const header = lengthFields(buffer.subarray(12, zipOffset));
  const proof = lengthFields(header.get(2));
  const publicDer = proof.get(1);
  const signature = proof.get(2);
  const signedHeaderData = header.get(10000);
  const crxId = lengthFields(signedHeaderData).get(1);
  const expectedId = crypto.createHash("sha256").update(publicDer).digest().subarray(0, 16);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(signedHeaderData.length);
  const signedBytes = Buffer.concat([
    Buffer.from("CRX3 SignedData\0", "ascii"),
    size,
    signedHeaderData,
    buffer.subarray(zipOffset)
  ]);
  return {
    crxIdMatches: crxId.equals(expectedId),
    signatureValid: crypto.verify(
      "sha256",
      signedBytes,
      { key: crypto.createPublicKey({ key: publicDer, type: "spki", format: "der" }), padding: crypto.constants.RSA_PKCS1_PADDING },
      signature
    ),
    zipOffset
  };
}

describe("CRX3 deterministic packer", () => {
  it("相同条目按稳定顺序生成完全一致的 ZIP", () => {
    const left = buildZipArchive([
      { name: "nested/糖果.txt", data: Buffer.from("甜") },
      { name: "manifest.json", data: Buffer.from("{}") },
      { name: "empty.bin", data: Buffer.alloc(0) }
    ]);
    const right = buildZipArchive([
      { name: "empty.bin", data: Buffer.alloc(0) },
      { name: "manifest.json", data: Buffer.from("{}") },
      { name: "nested/糖果.txt", data: Buffer.from("甜") }
    ]);
    expect(left.equals(right)).toBe(true);
    expect(left.readUInt32LE(0)).toBe(0x04034b50);
  });

  it("拒绝目录穿越和大小写冲突", () => {
    expect(() => buildZipArchive([{ name: "../secret", data: Buffer.from("x") }])).toThrow(/不安全/);
    expect(() => buildZipArchive([
      { name: "A.txt", data: Buffer.from("a") },
      { name: "a.TXT", data: Buffer.from("b") }
    ])).toThrow(/大小写冲突/);
  });

  it("生成可验证的 CRX3 RSA proof 与 crx_id", () => {
    const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const packed = packCrx3({
      entries: [{ name: "manifest.json", data: Buffer.from('{"manifest_version":3}') }],
      privateKey
    });
    expect(packed.subarray(0, 4).toString("ascii")).toBe("Cr24");
    expect(packed.readUInt32LE(4)).toBe(3);
    const result = verifyPackedCrx(packed);
    expect(result.crxIdMatches).toBe(true);
    expect(result.signatureValid).toBe(true);
    expect(packed.readUInt32LE(result.zipOffset)).toBe(0x04034b50);
  });

  it("ZIP 任一字节被篡改后 CRX3 签名立即失效", () => {
    const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const packed = packCrx3({
      entries: [{ name: "manifest.json", data: Buffer.from('{"manifest_version":3}') }],
      privateKey
    });
    const tampered = Buffer.from(packed);
    tampered[tampered.length - 1] ^= 0x01;
    expect(verifyPackedCrx(tampered).signatureValid).toBe(false);
  });
});
