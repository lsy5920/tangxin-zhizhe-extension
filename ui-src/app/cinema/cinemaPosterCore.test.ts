import { createCipheriv, webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";

await import("../../../cinema_poster_core.js");

const core = (globalThis as typeof globalThis & { TxzzCinemaPosterCore: any }).TxzzCinemaPosterCore;

function encryptFixture(bytes: Uint8Array) {
  const cipher = createCipheriv("aes-128-ecb", Buffer.from("525202f9149e061d", "utf8"), null);
  return Buffer.concat([cipher.update(bytes), cipher.final()]);
}

describe("cinema poster core", () => {
  it("recognizes only encrypted HTTPS image URLs with supported output types", () => {
    expect(core.describeEncryptedPosterUrl("https://cdn.example/source/cover.bnc?ext=.jpg")).toMatchObject({
      extension: "jpg",
      mimeType: "image/jpeg"
    });
    expect(core.describeEncryptedPosterUrl("http://cdn.example/cover.bnc?ext=.jpg")).toBeNull();
    expect(core.describeEncryptedPosterUrl("https://127.0.0.1/cover.bnc?ext=.jpg")).toBeNull();
    expect(core.describeEncryptedPosterUrl("https://2130706433/cover.bnc?ext=.jpg")).toBeNull();
    expect(core.describeEncryptedPosterUrl("https://0177.0.0.1/cover.bnc?ext=.jpg")).toBeNull();
    expect(core.describeEncryptedPosterUrl("https://[::ffff:127.0.0.1]/cover.bnc?ext=.jpg")).toBeNull();
    expect(core.describeEncryptedPosterUrl("https://192.168.1.8/cover.bnc?ext=.jpg")).toBeNull();
    expect(core.describeEncryptedPosterUrl("https://cdn.example/cover.svg")).toBeNull();
    expect(core.describeEncryptedPosterUrl("https://cdn.example/cover.bnc?ext=.svg")).toBeNull();
  });

  it("decrypts the target AES-128-ECB/PKCS7 format and verifies image magic", async () => {
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
    const result = await core.decryptPosterBytes(encryptFixture(jpeg), webcrypto);
    expect(Array.from(result.bytes)).toEqual(Array.from(jpeg));
    expect(result.mimeType).toBe("image/jpeg");
    expect(core.toDataUrl(result.bytes, result.mimeType)).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("rejects malformed ciphertext and decrypted non-images", async () => {
    await expect(core.decryptPosterBytes(Uint8Array.from([1, 2, 3]), webcrypto)).rejects.toThrow("大小或分块格式无效");
    await expect(core.decryptPosterBytes(encryptFixture(new TextEncoder().encode("not an image")), webcrypto)).rejects.toThrow("图片格式不受支持");
  });
});
