import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const BASE32_LOOKUP: Record<string, number> = Object.fromEntries(
  BASE32_ALPHABET.split("").map((ch, idx) => [ch, idx])
);

const OTP_DEFAULT_STEP = 30;
const OTP_DEFAULT_DIGITS = 6;

function normalizeSecret(secret: string) {
  return secret.replace(/[^A-Z2-7]/gi, "").toUpperCase();
}

export function normalizeOtpToken(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/[^0-9]/g, "").trim();
}

export function normalizeBackupCode(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(input: string) {
  const normalized = normalizeSecret(input);
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of normalized) {
    const idx = BASE32_LOOKUP[ch];
    if (idx === undefined) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateOtpSecret(bytes = 20) {
  return base32Encode(randomBytes(bytes));
}

export function buildOtpAuthUrl(params: { issuer: string; account: string; secret: string; digits?: number; period?: number }) {
  const issuer = params.issuer.trim() || "NULL";
  const account = params.account.trim() || "user";
  const digits = params.digits ?? OTP_DEFAULT_DIGITS;
  const period = params.period ?? OTP_DEFAULT_STEP;
  const label = encodeURIComponent(`${issuer}:${account}`);
  const issuerParam = encodeURIComponent(issuer);
  return `otpauth://totp/${label}?secret=${params.secret}&issuer=${issuerParam}&algorithm=SHA1&digits=${digits}&period=${period}`;
}

function hotp(secret: string, counter: number, digits = OTP_DEFAULT_DIGITS) {
  const key = base32Decode(secret);
  const msg = Buffer.alloc(8);
  msg.writeBigInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return code.toString().padStart(digits, "0");
}

export function generateTotp(params: { secret: string; timestamp?: number; step?: number; digits?: number }) {
  const step = params.step ?? OTP_DEFAULT_STEP;
  const digits = params.digits ?? OTP_DEFAULT_DIGITS;
  const counter = Math.floor((params.timestamp ?? Date.now()) / 1000 / step);
  return hotp(params.secret, counter, digits);
}

export function verifyTotp(params: {
  secret: string;
  token: string;
  timestamp?: number;
  window?: number;
  step?: number;
  digits?: number;
}) {
  const token = normalizeOtpToken(params.token);
  const step = params.step ?? OTP_DEFAULT_STEP;
  const digits = params.digits ?? OTP_DEFAULT_DIGITS;
  if (!token || token.length !== digits) return { valid: false as const };

  const window = Math.max(0, params.window ?? 1);
  const baseCounter = Math.floor((params.timestamp ?? Date.now()) / 1000 / step);

  for (let offset = -window; offset <= window; offset += 1) {
    const counter = baseCounter + offset;
    const expected = hotp(params.secret, counter, digits);
    if (timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
      return { valid: true as const, counter };
    }
  }
  return { valid: false as const };
}

export function generateBackupCodes(count = 8, length = 10) {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const bytes = randomBytes(length);
    let code = "";
    for (let j = 0; j < length; j += 1) {
      code += BASE32_ALPHABET[bytes[j] % BASE32_ALPHABET.length];
    }
    codes.push(code);
  }
  return codes;
}

export function hashBackupCode(code: string) {
  const normalized = normalizeBackupCode(code);
  const salt = randomBytes(16);
  const hash = scryptSync(normalized, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyBackupCode(code: string, stored: string) {
  const normalized = normalizeBackupCode(code);
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(normalized, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

export function consumeBackupCode(hashes: string[], code: string) {
  const normalized = normalizeBackupCode(code);
  if (!normalized) return { ok: false as const, remaining: hashes };
  const next: string[] = [];
  let matched = false;
  for (const hash of hashes) {
    if (!matched && verifyBackupCode(normalized, hash)) {
      matched = true;
      continue;
    }
    next.push(hash);
  }
  return { ok: matched, remaining: next };
}
