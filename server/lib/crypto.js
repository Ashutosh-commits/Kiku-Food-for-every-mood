import crypto from "node:crypto";
import { config } from "../config.js";
import { promisify } from "node:util";

const scryptAsync = promisify(crypto.scrypt);
const PASSWORD_N = 32768;
const PASSWORD_R = 8;
const PASSWORD_P = 1;
const PASSWORD_MAX_MEM = 64 * 1024 * 1024;

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(value) {
  return crypto.createHmac("sha256", config.sessionSecret || "kiku-dev-session-secret").update(String(value)).digest("hex");
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, 64, {
    N: PASSWORD_N,
    r: PASSWORD_R,
    p: PASSWORD_P,
    maxmem: PASSWORD_MAX_MEM,
  });
  return `scrypt$${PASSWORD_N}$${PASSWORD_R}$${PASSWORD_P}$${salt}$${Buffer.from(derived).toString("hex")}`;
}

export async function verifyPassword(password, encoded) {
  const [scheme, n, r, p, salt, hash] = String(encoded || "").split("$");
  const parsedN = Number(n);
  const parsedR = Number(r);
  const parsedP = Number(p);
  if (
    scheme !== "scrypt" ||
    !Number.isInteger(parsedN) || parsedN < 16384 || parsedN > 65536 || (parsedN & (parsedN - 1)) !== 0 ||
    !Number.isInteger(parsedR) || parsedR < 1 || parsedR > 16 ||
    !Number.isInteger(parsedP) || parsedP < 1 || parsedP > 4 ||
    !/^[0-9a-f]{32}$/.test(String(salt || "")) ||
    !/^[0-9a-f]+$/.test(String(hash || "")) ||
    hash.length < 64 || hash.length > 256 || hash.length % 2 !== 0
  ) return false;

  const requiredMemory = 128 * parsedN * parsedR;
  if (requiredMemory > PASSWORD_MAX_MEM) return false;

  try {
    const derived = await scryptAsync(password, salt, hash.length / 2, {
      N: parsedN,
      r: parsedR,
      p: parsedP,
      maxmem: PASSWORD_MAX_MEM,
    });
    const expected = Buffer.from(hash, "hex");
    const actual = Buffer.from(derived);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function secureEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
