import "dotenv/config";
import { z } from "zod";
import { resolve } from "node:path";
import { timezone } from "../shared/validation.js";
/** Parse only explicit true/false environment values, applying the supplied default when absent. */
const bool = (fallback: boolean) =>
  z
    .enum(["true", "false"])
    .default(String(fallback) as "true" | "false")
    .transform((v) => v === "true");
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  APP_NAME: z.string().min(1).max(60).default("Migraine Tracker"),
  APP_ORIGIN: z.url().default("http://localhost:3000"),
  DATA_DIR: z.string().default("./app-data"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  SETUP_SECRET: z.string().min(32),
  DEFAULT_TIMEZONE: timezone.default("Australia/Sydney"),
  COOKIE_SECURE: bool(true),
  LOCAL_AUTH_ENABLED: bool(true),
  TRUSTED_PROXIES: z.string().default(""),
  LOG_LEVEL: z.enum(["error", "warn", "info"]).default("info"),
  BACKUP_RETENTION_DAYS: z.coerce.number().int().min(0).max(36500).default(30),
  OIDC_ENABLED: bool(false),
  OIDC_ISSUER_URL: z.string().default(""),
  OIDC_CLIENT_ID: z.string().default(""),
  OIDC_CLIENT_SECRET: z.string().default(""),
  OIDC_REDIRECT_URI: z.string().default(""),
  OIDC_ALLOWED_SUBJECT: z.string().default(""),
});
/** Validate deployment configuration and reject unsafe authentication or origin combinations. */
export function readConfig(env = process.env) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success)
    throw new Error(
      `Invalid configuration: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  const c = parsed.data;
  if (c.SETUP_SECRET.startsWith("replace-with-"))
    throw new Error(
      "Invalid configuration: replace the example SETUP_SECRET with a random secret",
    );
  if (new URL(c.APP_ORIGIN).origin !== c.APP_ORIGIN)
    throw new Error(
      "APP_ORIGIN must be an origin without a trailing slash/path",
    );
  if (
    c.NODE_ENV === "production" &&
    (!c.COOKIE_SECURE || !c.APP_ORIGIN.startsWith("https://"))
  )
    throw new Error(
      "Production requires HTTPS APP_ORIGIN and COOKIE_SECURE=true",
    );
  if (!c.LOCAL_AUTH_ENABLED && !c.OIDC_ENABLED)
    throw new Error("At least one authentication method must be enabled");
  if (
    c.OIDC_ENABLED &&
    [
      c.OIDC_ISSUER_URL,
      c.OIDC_CLIENT_ID,
      c.OIDC_CLIENT_SECRET,
      c.OIDC_REDIRECT_URI,
      c.OIDC_ALLOWED_SUBJECT,
    ].some((v) => !v)
  )
    throw new Error("OIDC configuration incomplete");
  if (
    c.OIDC_ENABLED &&
    (!c.OIDC_ISSUER_URL.startsWith("https://") ||
      new URL(c.OIDC_REDIRECT_URI).origin !== c.APP_ORIGIN ||
      new URL(c.OIDC_REDIRECT_URI).pathname !== "/api/auth/oidc/callback")
  )
    throw new Error(
      "OIDC requires HTTPS issuer and same-origin callback /api/auth/oidc/callback",
    );
  return {
    ...c,
    DATA_DIR: resolve(c.DATA_DIR),
    trustedProxies: c.TRUSTED_PROXIES.split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  };
}
export type Config = ReturnType<typeof readConfig>;
/** Emit an operational event at the configured level; callers must never pass health data or secrets. */
export function log(level: "info" | "warn" | "error", event: string) {
  const order = { error: 0, warn: 1, info: 2 };
  if (
    order[level] <=
    order[(process.env.LOG_LEVEL || "info") as keyof typeof order]
  )
    console.log(
      JSON.stringify({ time: new Date().toISOString(), level, event }),
    );
}
