import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import argon2 from "argon2";
import { eq, lt } from "drizzle-orm";
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { rateLimit } from "express-rate-limit";
import * as oidc from "openid-client";
import { z } from "zod";
import type { Store } from "./database.js";
import type { Config } from "./config.js";
import { log } from "./config.js";
import * as s from "./schema.js";
import {
  loginSchema,
  password,
  settingsSchema,
  setupSchema,
} from "../shared/validation.js";
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const secretEqual = (a: string, b: string) =>
  timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
const passwordOptions = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} as const;
export const hashPassword = (value: string) =>
  argon2.hash(value, passwordOptions);
function cookie(req: Request, name: string) {
  return (
    req.headers.cookie
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${name}=`))
      ?.slice(name.length + 1) || ""
  );
}
export function authTools(store: Store, config: Config) {
  const { db } = store;
  const cookieName = config.COOKIE_SECURE ? "__Host-session" : "session";
  const opts = {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: "lax" as const,
    path: "/",
  };
  function issueSession(res: Response, userId: string) {
    db.delete(s.sessions).where(lt(s.sessions.expiresAt, Date.now())).run();
    const token = randomBytes(32).toString("hex"),
      csrf = randomBytes(32).toString("hex");
    db.insert(s.sessions)
      .values({
        tokenHash: hash(token),
        userId,
        csrf,
        expiresAt: Date.now() + 7 * 86400000,
      })
      .run();
    res.cookie(cookieName, token, { ...opts, maxAge: 7 * 86400000 });
    return csrf;
  }
  function requireAuth(req: Request, res: Response, next: NextFunction) {
    const token = cookie(req, cookieName);
    const session = token
      ? db
          .select()
          .from(s.sessions)
          .where(eq(s.sessions.tokenHash, hash(token)))
          .get()
      : null;
    if (!session || session.expiresAt <= Date.now()) {
      res.status(401).json({ error: "Please sign in." });
      return;
    }
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      (!req.headers["x-csrf-token"] ||
        !secretEqual(String(req.headers["x-csrf-token"]), session.csrf))
    ) {
      res
        .status(403)
        .json({ error: "Session verification failed. Reload and try again." });
      return;
    }
    res.locals.userId = session.userId;
    res.locals.csrf = session.csrf;
    res.locals.tokenHash = session.tokenHash;
    next();
  }
  const router = Router();
  const limiter = rateLimit({
    windowMs: 15 * 60000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many attempts. Try again in 15 minutes." },
  });
  router.get("/status", (_req, res) =>
    res.json({
      setupRequired: !db.select().from(s.users).get(),
      localEnabled: config.LOCAL_AUTH_ENABLED,
      oidcEnabled: config.OIDC_ENABLED,
      appName: config.APP_NAME,
      defaultTimezone: config.DEFAULT_TIMEZONE,
    }),
  );
  router.post("/setup", limiter, async (req, res) => {
    if (db.select().from(s.users).get()) {
      res.status(404).json({ error: "Setup is closed." });
      return;
    }
    const input = setupSchema.parse(req.body);
    if (!secretEqual(input.setupSecret, config.SETUP_SECRET)) {
      log("warn", "auth.setup.denied");
      res.status(403).json({ error: "Invalid setup secret." });
      return;
    }
    const passwordHash = await hashPassword(input.password);
    // Recheck inside a write transaction after asynchronous hashing.
    const id = randomUUID();
    const created = db.transaction(
      (tx) => {
        if (tx.select().from(s.users).get()) return false;
        tx.insert(s.users)
          .values({
            id,
            username: input.username,
            passwordHash,
            createdAt: new Date().toISOString(),
          })
          .run();
        tx.insert(s.settings)
          .values({
            userId: id,
            value: settingsSchema.parse({
              timezone: input.timezone,
              units: input.units,
            }),
          })
          .run();
        return true;
      },
      { behavior: "immediate" },
    );
    if (!created) {
      res.status(409).json({ error: "Setup has already finished." });
      return;
    }
    log("info", "auth.setup.success");
    res.status(201).json({ csrf: issueSession(res, id) });
  });
  // A real hash avoids a fast username enumeration path.
  const dummyHash = hashPassword(randomBytes(32).toString("hex"));
  router.post("/login", limiter, async (req, res) => {
    if (!config.LOCAL_AUTH_ENABLED) {
      res.status(404).json({ error: "Local login disabled." });
      return;
    }
    const input = loginSchema.parse(req.body);
    const key = hash(input.username);
    const attempt = db
      .select()
      .from(s.loginAttempts)
      .where(eq(s.loginAttempts.key, key))
      .get();
    if (attempt && attempt.lockedUntil > Date.now()) {
      res
        .status(429)
        .json({ error: "Sign-in temporarily paused. Try again later." });
      return;
    }
    const user = db
      .select()
      .from(s.users)
      .where(eq(s.users.username, input.username))
      .get();
    const valid = await argon2.verify(
      user?.passwordHash || (await dummyHash),
      input.password,
    );
    if (!user || !valid) {
      const failures =
        attempt && Date.now() - attempt.updatedAt < 3600000
          ? attempt.failures + 1
          : 1;
      const values = {
        failures,
        updatedAt: Date.now(),
        lockedUntil:
          failures >= 5
            ? Date.now() +
              Math.min(3600000, 30000 * 2 ** Math.min(failures - 5, 7))
            : 0,
      };
      db.delete(s.loginAttempts)
        .where(lt(s.loginAttempts.updatedAt, Date.now() - 86400000))
        .run();
      db.insert(s.loginAttempts)
        .values({ key, ...values })
        .onConflictDoUpdate({ target: s.loginAttempts.key, set: values })
        .run();
      log("warn", "auth.login.denied");
      res.status(401).json({ error: "Incorrect username or password." });
      return;
    }
    db.delete(s.loginAttempts).where(eq(s.loginAttempts.key, key)).run();
    log("info", "auth.login.success");
    res.json({ csrf: issueSession(res, user.id) });
  });
  router.get("/session", requireAuth, (_req, res) => {
    const user = db
      .select()
      .from(s.users)
      .where(eq(s.users.id, res.locals.userId))
      .get()!;
    res.json({ csrf: res.locals.csrf, username: user.username });
  });
  router.post("/logout", requireAuth, (_req, res) => {
    db.delete(s.sessions)
      .where(eq(s.sessions.tokenHash, res.locals.tokenHash))
      .run();
    res.clearCookie(cookieName, opts);
    res.json({ ok: true });
  });
  router.post("/password", limiter, requireAuth, async (req, res) => {
    const input = z
      .object({ currentPassword: z.string().max(128), password })
      .parse(req.body);
    const user = db
      .select()
      .from(s.users)
      .where(eq(s.users.id, res.locals.userId))
      .get()!;
    if (
      !user.passwordHash ||
      !(await argon2.verify(user.passwordHash, input.currentPassword))
    ) {
      res.status(403).json({ error: "Current password is incorrect." });
      return;
    }
    const passwordHash = await hashPassword(input.password);
    db.transaction((tx) => {
      tx.update(s.users)
        .set({ passwordHash })
        .where(eq(s.users.id, user.id))
        .run();
      tx.delete(s.sessions).where(eq(s.sessions.userId, user.id)).run();
    });
    log("info", "auth.password.changed");
    res.json({ csrf: issueSession(res, user.id) });
  });
  router.post("/revoke-sessions", requireAuth, (_req, res) => {
    db.delete(s.sessions).where(eq(s.sessions.userId, res.locals.userId)).run();
    res.json({ csrf: issueSession(res, res.locals.userId) });
  });
  let provider: Promise<oidc.Configuration> | undefined;
  const getProvider = () =>
    (provider ??= oidc
      .discovery(
        new URL(config.OIDC_ISSUER_URL),
        config.OIDC_CLIENT_ID,
        config.OIDC_CLIENT_SECRET,
      )
      .catch((e) => {
        provider = undefined;
        throw e;
      }));
  router.get("/oidc/start", limiter, async (_req, res) => {
    if (!config.OIDC_ENABLED || !db.select().from(s.users).get()) {
      res.sendStatus(404);
      return;
    }
    const client = await getProvider();
    const state = oidc.randomState(),
      nonce = oidc.randomNonce(),
      verifier = oidc.randomPKCECodeVerifier();
    db.delete(s.oidcStates).where(lt(s.oidcStates.expiresAt, Date.now())).run();
    db.insert(s.oidcStates)
      .values({ state, nonce, verifier, expiresAt: Date.now() + 600000 })
      .run();
    res.cookie("oidc_state", state, { ...opts, maxAge: 600000 });
    res.redirect(
      oidc.buildAuthorizationUrl(client, {
        redirect_uri: config.OIDC_REDIRECT_URI,
        scope: "openid profile",
        state,
        nonce,
        code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
        code_challenge_method: "S256",
      }).href,
    );
  });
  router.get("/oidc/callback", limiter, async (req, res) => {
    if (!config.OIDC_ENABLED) {
      res.sendStatus(404);
      return;
    }
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const saved = db
      .select()
      .from(s.oidcStates)
      .where(eq(s.oidcStates.state, state))
      .get();
    db.delete(s.oidcStates).where(eq(s.oidcStates.state, state)).run();
    res.clearCookie("oidc_state", opts);
    if (
      !saved ||
      saved.expiresAt < Date.now() ||
      !secretEqual(cookie(req, "oidc_state"), state)
    ) {
      res.redirect("/?authError=1");
      return;
    }
    try {
      const tokens = await oidc.authorizationCodeGrant(
        await getProvider(),
        new URL(req.originalUrl, config.APP_ORIGIN),
        {
          pkceCodeVerifier: saved.verifier,
          expectedState: state,
          expectedNonce: saved.nonce,
          idTokenExpected: true,
        },
      );
      const claims = tokens.claims();
      const user = db.select().from(s.users).get();
      if (
        !claims ||
        claims.sub !== config.OIDC_ALLOWED_SUBJECT ||
        !user ||
        (user.oidcSubject && user.oidcSubject !== claims.sub)
      )
        throw new Error("Subject not authorized");
      db.update(s.users)
        .set({ oidcSubject: claims.sub })
        .where(eq(s.users.id, user.id))
        .run();
      issueSession(res, user.id);
      log("info", "auth.oidc.success");
      res.redirect("/");
    } catch {
      log("warn", "auth.oidc.denied");
      res.redirect("/?authError=1");
    }
  });
  return { router, requireAuth };
}
