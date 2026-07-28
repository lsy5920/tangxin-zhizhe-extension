import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const UINT16_MAX = 0xffff;
const UINT32_MAX = 0xffffffff;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_METHOD_STORE = 0;
const ZIP_METHOD_DEFLATE = 8;
const DOS_EPOCH_DATE = (1 << 5) | 1; // 1980-01-01，固定时间让相同源码生成稳定字节。

let crcTable = null;

export function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      }
      crcTable[index] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function encodeVarint(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Protobuf varint 数值无效：${value}`);
  const bytes = [];
  let remaining = value;
  do {
    let byte = remaining % 128;
    remaining = Math.floor(remaining / 128);
    if (remaining) byte |= 0x80;
    bytes.push(byte);
  } while (remaining);
  return Buffer.from(bytes);
}

function protobufBytesField(fieldNumber, value) {
  const data = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const tag = encodeVarint((fieldNumber * 8) + 2);
  return Buffer.concat([tag, encodeVarint(data.length), data]);
}

function normalizeEntryName(name) {
  const normalized = String(name || "").replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || /^[a-z]:\//i.test(normalized)) {
    throw new Error(`ZIP 路径无效：${name}`);
  }
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error(`ZIP 路径包含不安全片段：${name}`);
  }
  return normalized;
}

function assertClassicZipLimit(label, value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new Error(`${label} 超出传统 ZIP 上限，当前发布包禁止 ZIP64`);
  }
}

/**
 * 构造不依赖第三方归档库的传统 ZIP。
 *
 * 仅在压缩确实变小时使用 raw DEFLATE；路径、时间、extra/comment 和顺序均固定，
 * 避免旧 archiver/glob 依赖带来的路径遍历与资源耗尽风险。
 */
export function buildZipArchive(entries) {
  if (!Array.isArray(entries) || !entries.length) throw new Error("ZIP 至少需要一个文件");
  if (entries.length > UINT16_MAX) throw new Error("ZIP 文件数量超出传统 ZIP 上限");

  const normalizedEntries = entries.map((entry) => ({
    name: normalizeEntryName(entry.name),
    data: Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data)
  })).sort((left, right) => left.name.localeCompare(right.name, "en"));

  const seen = new Set();
  for (const entry of normalizedEntries) {
    const folded = entry.name.toLocaleLowerCase("en-US");
    if (seen.has(folded)) throw new Error(`ZIP 路径重复或大小写冲突：${entry.name}`);
    seen.add(folded);
  }

  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const entry of normalizedEntries) {
    const nameBytes = Buffer.from(entry.name, "utf8");
    if (nameBytes.length > UINT16_MAX) throw new Error(`ZIP 文件名过长：${entry.name}`);
    assertClassicZipLimit(`${entry.name} 文件大小`, entry.data.length);

    const deflated = zlib.deflateRawSync(entry.data, { level: 9 });
    const useDeflate = deflated.length < entry.data.length;
    const method = useDeflate ? ZIP_METHOD_DEFLATE : ZIP_METHOD_STORE;
    const payload = useDeflate ? deflated : entry.data;
    assertClassicZipLimit(`${entry.name} 压缩大小`, payload.length);
    assertClassicZipLimit(`${entry.name} 本地偏移`, localOffset);
    const checksum = crc32(entry.data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(ZIP_UTF8_FLAG, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(DOS_EPOCH_DATE, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, nameBytes, payload);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(ZIP_UTF8_FLAG, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(DOS_EPOCH_DATE, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, nameBytes);

    localOffset += localHeader.length + nameBytes.length + payload.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  assertClassicZipLimit("ZIP 中央目录偏移", localOffset);
  assertClassicZipLimit("ZIP 中央目录大小", centralDirectory.length);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(normalizedEntries.length, 8);
  end.writeUInt16LE(normalizedEntries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

export function collectDirectoryEntries(rootDir) {
  const root = path.resolve(rootDir);
  const entries = [];
  const walk = (current, relativeBase = "") => {
    for (const name of fs.readdirSync(current).sort((left, right) => left.localeCompare(right, "en"))) {
      const absolute = path.join(current, name);
      const relative = relativeBase ? `${relativeBase}/${name}` : name;
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error(`发布目录禁止符号链接：${relative}`);
      if (stat.isDirectory()) walk(absolute, relative);
      else if (stat.isFile()) entries.push({ name: relative, data: fs.readFileSync(absolute) });
      else throw new Error(`发布目录包含不支持的文件类型：${relative}`);
    }
  };
  walk(root);
  return entries;
}

export function packCrx3({ entries, privateKey }) {
  const privateKeyObject = privateKey instanceof crypto.KeyObject
    ? privateKey
    : crypto.createPrivateKey(privateKey);
  const publicDer = crypto.createPublicKey(privateKeyObject).export({ type: "spki", format: "der" });
  const crxId = crypto.createHash("sha256").update(publicDer).digest().subarray(0, 16);
  const signedHeaderData = protobufBytesField(1, crxId);
  const zip = buildZipArchive(entries);
  const signedHeaderSize = Buffer.alloc(4);
  signedHeaderSize.writeUInt32LE(signedHeaderData.length);
  const signedBytes = Buffer.concat([
    Buffer.from("CRX3 SignedData\0", "ascii"),
    signedHeaderSize,
    signedHeaderData,
    zip
  ]);
  const signature = crypto.sign("sha256", signedBytes, {
    key: privateKeyObject,
    padding: crypto.constants.RSA_PKCS1_PADDING
  });
  const proof = Buffer.concat([
    protobufBytesField(1, publicDer),
    protobufBytesField(2, signature)
  ]);
  const header = Buffer.concat([
    protobufBytesField(2, proof),
    protobufBytesField(10000, signedHeaderData)
  ]);
  assertClassicZipLimit("CRX3 头大小", header.length);

  const prefix = Buffer.alloc(12);
  prefix.write("Cr24", 0, "ascii");
  prefix.writeUInt32LE(3, 4);
  prefix.writeUInt32LE(header.length, 8);
  return Buffer.concat([prefix, header, zip]);
}

export function packCrx3Directory(rootDir, privateKey) {
  return packCrx3({ entries: collectDirectoryEntries(rootDir), privateKey });
}
