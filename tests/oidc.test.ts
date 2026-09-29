import { afterEach, expect, it, vi } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readConfig } from "../src/server/config";
import { openDatabase } from "../src/server/database";
import { createApp } from "../src/server/app";
import * as s from "../src/server/schema";
afterEach(() => vi.unstubAllGlobals());
it("validates signed OIDC tokens, PKCE/state/nonce, links only allowed subject and rejects replay", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tracker-oidc-"));
  const store = openDatabase(dir);
  const issuer = "https://identity.example/",
    origin = "http://localhost:3000",
    secret = "oidc-test-setup-secret-32-characters";
  const config = readConfig({
    NODE_ENV: "test",
    SETUP_SECRET: secret,
    APP_ORIGIN: origin,
    COOKIE_SECURE: "false",
    DATA_DIR: dir,
    OIDC_ENABLED: "true",
    OIDC_ISSUER_URL: issuer,
    OIDC_CLIENT_ID: "test-client",
    OIDC_CLIENT_SECRET: "test-client-secret",
    OIDC_REDIRECT_URI: `${origin}/api/auth/oidc/callback`,
    OIDC_ALLOWED_SUBJECT: "allowed-owner",
  });
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk = {
    ...publicKey.export({ format: "jwk" }),
    kid: "test-key",
    use: "sig",
    alg: "RS256",
  };
  let nonce = "",
    subject = "allowed-owner",
    audience = "test-client",
    sentVerifier = "";
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  vi.stubGlobal(
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes(".well-known"))
        return Response.json({
          issuer,
          authorization_endpoint: `${issuer}authorize`,
          token_endpoint: `${issuer}token`,
          jwks_uri: `${issuer}jwks`,
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"],
          token_endpoint_auth_methods_supported: ["client_secret_post"],
          code_challenge_methods_supported: ["S256"],
        });
      if (url === `${issuer}jwks`) return Response.json({ keys: [jwk] });
      if (url === `${issuer}token`) {
        sentVerifier =
          new URLSearchParams(String(init?.body)).get("code_verifier") || "";
        const data = `${encode({ alg: "RS256", kid: "test-key" })}.${encode({ iss: issuer, sub: subject, aud: audience, nonce, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300 })}`;
        return Response.json({
          access_token: "synthetic-access-token",
          token_type: "Bearer",
          expires_in: 300,
          id_token: `${data}.${sign("RSA-SHA256", Buffer.from(data), privateKey).toString("base64url")}`,
        });
      }
      throw new Error("Unexpected provider request");
    },
  );
  try {
    const app = createApp(store, config);
    const local = request.agent(app);
    const setup = await local
      .post("/api/auth/setup")
      .set("Origin", origin)
      .send({
        username: "owner",
        password: "oidc-local-test-password",
        setupSecret: secret,
        timezone: "UTC",
      });
    expect(setup.status).toBe(201);
    const browser = request.agent(app);
    const begin = await browser.get("/api/auth/oidc/start");
    expect(begin.status).toBe(302);
    const location = new URL(begin.headers.location);
    nonce = location.searchParams.get("nonce")!;
    const state = location.searchParams.get("state")!;
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("code_challenge")).toBeTruthy();
    const callback = await browser.get(
      `/api/auth/oidc/callback?state=${state}&code=test-code`,
    );
    expect(callback.headers.location).toBe("/");
    expect(sentVerifier.length).toBeGreaterThan(20);
    expect((await browser.get("/api/data")).status).toBe(200);
    expect(store.db.select().from(s.users).get()?.oidcSubject).toBe(
      "allowed-owner",
    );
    expect(
      (
        await browser.get(
          `/api/auth/oidc/callback?state=${state}&code=test-code`,
        )
      ).headers.location,
    ).toBe("/?authError=1");
    // A second login by the already-linked owner remains valid.
    const repeat = request.agent(app);
    const repeatUrl = new URL(
      (await repeat.get("/api/auth/oidc/start")).headers.location,
    );
    nonce = repeatUrl.searchParams.get("nonce")!;
    expect(
      (
        await repeat.get(
          `/api/auth/oidc/callback?state=${repeatUrl.searchParams.get("state")}&code=test-code`,
        )
      ).headers.location,
    ).toBe("/");
    expect((await repeat.get("/api/data")).status).toBe(200);

    // Simulate another DB connection changing identity between callback read and write.
    const racing = request.agent(app);
    const raceUrl = new URL(
      (await racing.get("/api/auth/oidc/start")).headers.location,
    );
    nonce = raceUrl.searchParams.get("nonce")!;
    const update = store.db.update.bind(store.db);
    const spy = vi.spyOn(store.db, "update").mockImplementationOnce((table) => {
      store.sqlite
        .prepare("UPDATE users SET oidcSubject = ?")
        .run("concurrently-linked-owner");
      return update(table);
    });
    try {
      expect(
        (
          await racing.get(
            `/api/auth/oidc/callback?state=${raceUrl.searchParams.get("state")}&code=test-code`,
          )
        ).headers.location,
      ).toBe("/?authError=1");
      expect((await racing.get("/api/data")).status).toBe(401);
      expect(store.db.select().from(s.users).get()?.oidcSubject).toBe(
        "concurrently-linked-owner",
      );
    } finally {
      spy.mockRestore();
      store.db
        .update(s.users)
        .set({ oidcSubject: "allowed-owner" })
        .where(eq(s.users.username, "owner"))
        .run();
    }
    for (const mode of [
      "wrong-subject",
      "wrong-nonce",
      "wrong-audience",
      "wrong-browser",
    ]) {
      const attacker = request.agent(app);
      const next = new URL(
        (await attacker.get("/api/auth/oidc/start")).headers.location,
      );
      nonce =
        mode === "wrong-nonce" ? "forged" : next.searchParams.get("nonce")!;
      subject = mode === "wrong-subject" ? "other-user" : "allowed-owner";
      audience = mode === "wrong-audience" ? "other-client" : "test-client";
      const client = mode === "wrong-browser" ? request.agent(app) : attacker;
      const denied = await client.get(
        `/api/auth/oidc/callback?state=${next.searchParams.get("state")}&code=test-code`,
      );
      expect(denied.headers.location).toBe("/?authError=1");
      expect((await client.get("/api/data")).status).toBe(401);
    }
  } finally {
    store.sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
