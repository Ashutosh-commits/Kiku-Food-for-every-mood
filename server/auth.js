import { OAuth2Client } from "google-auth-library";
import { collection, memoryStore, oid, ObjectId } from "./db.js";
import { config } from "./config.js";
import { hashPassword, randomToken, sha256, verifyPassword } from "./lib/crypto.js";
import { parseCookies, serializeCookie } from "./lib/cookies.js";
import { sendAuthEmail } from "./email.js";

const SESSION_COOKIE = config.nodeEnv === "production" ? "__Host-kiku_session" : "kiku_session";
const googleClient = new OAuth2Client();

function cleanUser(user) {
  if (!user) return null;
  return {
    id: String(user._id || user.id),
    name: user.name || "Kiku member",
    email: user.email,
    avatar: user.avatar || null,
    provider: user.provider || "password",
    emailVerified: Boolean(user.emailVerified),
    createdAt: user.createdAt,
  };
}

function sessionExpiry() {
  return new Date(Date.now() + config.sessionTtlDays * 86400000);
}

async function findToken(token, type, consume = false) {
  const tokenHash = sha256(token);
  const tokens = collection("emailTokens");
  let document = tokens ? await tokens.findOne({ tokenHash, type }) : memoryStore("emailTokens").get(tokenHash);
  if (!document || new Date(document.expiresAt).getTime() <= Date.now()) return null;
  if (consume) {
    if (tokens) await tokens.deleteOne({ tokenHash, type });
    else memoryStore("emailTokens").delete(tokenHash);
  }
  return document;
}

async function issueAuthToken(userId, type, ttlMs) {
  const rawToken = randomToken(32);
  const document = { tokenHash: sha256(rawToken), userId: String(userId), type, createdAt: new Date(), expiresAt: new Date(Date.now() + ttlMs) };
  const tokens = collection("emailTokens");
  if (tokens) await tokens.insertOne(document);
  else memoryStore("emailTokens").set(document.tokenHash, document);
  return rawToken;
}

export async function createUser({ name, email, password, provider = "password", googleSub = null, avatar = null, emailVerified = false }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const now = new Date();
  const passwordHash = password ? await hashPassword(password) : null;
  const user = { name: String(name || "Kiku member").trim() || "Kiku member", email: normalizedEmail, avatar, provider, googleSub, passwordHash, emailVerified, createdAt: now, updatedAt: now };
  const users = collection("users");
  if (!users) {
    const id = new ObjectId(); user._id = id;
    if ([...memoryStore("users").values()].some((item) => item.email === normalizedEmail)) { const error = new Error("An account with that email already exists."); error.code = "EMAIL_EXISTS"; throw error; }
    memoryStore("users").set(String(id), user);
    return cleanUser(user);
  }
  try {
    const result = await users.insertOne(user);
    return cleanUser({ ...user, _id: result.insertedId });
  } catch (error) {
    if (error?.code === 11000) { const err = new Error("An account with that email already exists."); err.code = "EMAIL_EXISTS"; throw err; }
    throw error;
  }
}

export async function findUserByEmail(email) {
  const normalized = String(email).trim().toLowerCase();
  const users = collection("users");
  if (!users) return [...memoryStore("users").values()].find((user) => user.email === normalized) || null;
  return users.findOne({ email: normalized });
}

export async function findUserByGoogleSub(sub) {
  const users = collection("users");
  if (!users) return [...memoryStore("users").values()].find((user) => user.googleSub === sub) || null;
  return users.findOne({ googleSub: sub });
}

export async function findUserById(id) {
  const users = collection("users");
  if (!users) return memoryStore("users").get(String(id)) || null;
  const objectId = oid(id);
  return objectId ? users.findOne({ _id: objectId }) : null;
}

export async function updateUser(id, patch) {
  const users = collection("users");
  if (!users) {
    const user = memoryStore("users").get(String(id));
    if (!user) return null;
    Object.assign(user, patch, { updatedAt: new Date() });
    return user;
  }
  const objectId = oid(id); if (!objectId) return null;
  await users.updateOne({ _id: objectId }, { $set: { ...patch, updatedAt: new Date() } });
  return users.findOne({ _id: objectId });
}

export async function createSession(userId, res) {
  const rawToken = randomToken(32);
  const tokenHash = sha256(rawToken);
  const expiresAt = sessionExpiry();
  const sessions = collection("sessions");
  const document = { tokenHash, userId: String(userId), createdAt: new Date(), expiresAt };
  if (sessions) await sessions.insertOne(document); else memoryStore("sessions").set(tokenHash, document);
  res.append("Set-Cookie", serializeCookie(SESSION_COOKIE, rawToken, { maxAge: config.sessionTtlDays * 86400, httpOnly: true, secure: config.nodeEnv === "production", sameSite: "Lax" }));
}

export async function clearSession(req, res) {
  const token = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  if (token) {
    const key = sha256(token); const sessions = collection("sessions");
    if (sessions) await sessions.deleteOne({ tokenHash: key }); else memoryStore("sessions").delete(key);
  }
  res.append("Set-Cookie", serializeCookie(SESSION_COOKIE, "", { maxAge: 0, httpOnly: true, secure: config.nodeEnv === "production", sameSite: "Lax" }));
}

export async function getSessionUser(req) {
  const token = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  if (!token) return null;
  const key = sha256(token); const sessions = collection("sessions");
  const session = sessions ? await sessions.findOne({ tokenHash: key }) : memoryStore("sessions").get(key);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    if (sessions) await sessions.deleteOne({ tokenHash: key }); else memoryStore("sessions").delete(key);
    return null;
  }
  return findUserById(session.userId);
}

export async function loginWithPassword(email, password, res) {
  const user = await findUserByEmail(email);
  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) { const error = new Error("Invalid email or password."); error.code = "INVALID_CREDENTIALS"; throw error; }
  if (config.requireEmailVerification && !user.emailVerified) { const error = new Error("Please verify your email before signing in."); error.code = "EMAIL_NOT_VERIFIED"; throw error; }
  await createSession(String(user._id), res);
  return cleanUser(user);
}

export async function loginWithGoogle(idToken, res) {
  if (!config.googleClientId) { const error = new Error("Google sign-in is not configured."); error.code = "GOOGLE_NOT_CONFIGURED"; throw error; }
  const ticket = await googleClient.verifyIdToken({ idToken, audience: config.googleClientId });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email || payload.email_verified !== true) { const error = new Error("Google identity is incomplete or unverified."); error.code = "GOOGLE_INVALID"; throw error; }
  let user = await findUserByGoogleSub(payload.sub);
  if (!user) {
    user = await findUserByEmail(payload.email);
    if (user) user = await updateUser(String(user._id), { googleSub: payload.sub, avatar: user.avatar || payload.picture || null, provider: user.provider === "password" ? "password+google" : "google", emailVerified: true });
    else user = await createUser({ name: payload.name || payload.given_name || "Google member", email: payload.email, provider: "google", googleSub: payload.sub, avatar: payload.picture || null, emailVerified: true });
  }
  await createSession(String(user._id), res);
  return cleanUser(user);
}

export async function issueVerificationEmail(userId, email) {
  const token = await issueAuthToken(userId, "verify_email", 24 * 3600000);
  return sendAuthEmail({ to: email, type: "verify_email", token });
}

export async function verifyEmail(token) {
  const document = await findToken(token, "verify_email", true);
  if (!document) { const error = new Error("This verification link is invalid or expired."); error.code = "INVALID_TOKEN"; error.status = 400; throw error; }
  const user = await findUserById(document.userId);
  if (!user) { const error = new Error("Account not found."); error.code = "NOT_FOUND"; error.status = 404; throw error; }
  const updated = await updateUser(document.userId, { emailVerified: true });
  return cleanUser(updated || user);
}

export async function requestPasswordReset(email) {
  const user = await findUserByEmail(email);
  if (!user) return;
  const token = await issueAuthToken(String(user._id), "reset_password", 30 * 60000);
  await sendAuthEmail({ to: user.email, type: "reset_password", token });
}

export async function resetPassword(token, password) {
  const document = await findToken(token, "reset_password", true);
  if (!document) { const error = new Error("This password reset link is invalid or expired."); error.code = "INVALID_TOKEN"; error.status = 400; throw error; }
  const passwordHash = await hashPassword(password);
  const user = await updateUser(document.userId, { passwordHash, emailVerified: true });
  if (!user) { const error = new Error("Account not found."); error.code = "NOT_FOUND"; error.status = 404; throw error; }
  await revokeAllSessions(document.userId);
  return cleanUser(user);
}

export async function revokeAllSessions(userId) {
  const sessions = collection("sessions");
  if (sessions) await sessions.deleteMany({ userId: String(userId) });
  else for (const [key, session] of memoryStore("sessions")) if (session.userId === String(userId)) memoryStore("sessions").delete(key);
}

export async function authMiddleware(req, _res, next) {
  try {
    req.user = await getSessionUser(req);
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Sign in required." } });
  next();
}

export { cleanUser };
