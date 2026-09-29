import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { ZodError } from "zod";
import type { Config } from "./config.js";
import { log } from "./config.js";
import type { Store } from "./database.js";
import { authTools } from "./auth.js";
import { apiRoutes } from "./routes.js";
export function createApp(store: Store, config: Config) {
  const app = express();
  app.disable("x-powered-by");
  app.set(
    "trust proxy",
    config.trustedProxies.length ? config.trustedProxies : false,
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["\u0027self\u0027"],
          scriptSrc: ["\u0027self\u0027"],
          styleSrc: ["\u0027self\u0027"],
          imgSrc: ["\u0027self\u0027", "data:"],
          connectSrc: ["\u0027self\u0027"],
          fontSrc: ["\u0027self\u0027"],
          objectSrc: ["\u0027none\u0027"],
          frameAncestors: ["\u0027none\u0027"],
          baseUri: ["\u0027self\u0027"],
          formAction: ["\u0027self\u0027"],
          upgradeInsecureRequests: config.COOKIE_SECURE ? [] : null,
        },
      },
      referrerPolicy: { policy: "no-referrer" },
      strictTransportSecurity: config.COOKIE_SECURE
        ? { maxAge: 31536000 }
        : false,
    }),
  );
  app.use((_req, res, next) => {
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    next();
  });
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.get("/api/health", (_req, res) => {
    try {
      store.sqlite.prepare("SELECT 1").get();
      res.json({ status: "ok", database: "ok" });
    } catch {
      res.status(503).json({ status: "unavailable", database: "unavailable" });
    }
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Please wait a moment and try again." },
    }),
  );
  app.use("/api", (req, res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      (req.headers.origin !== config.APP_ORIGIN || !req.is("application/json"))
    ) {
      res
        .status(403)
        .json({ error: "Request origin or content type not allowed." });
      return;
    }
    next();
  });
  app.use(express.json({ limit: "2mb" }));
  const auth = authTools(store, config);
  app.use("/api/auth", auth.router);
  app.use("/api", auth.requireAuth, apiRoutes(store, config));
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof ZodError) {
        res
          .status(400)
          .json({
            error: error.issues
              .map((i) => `${i.path.join(".") || "Entry"}: ${i.message}`)
              .join("; "),
          });
        return;
      }
      if (error instanceof SyntaxError) {
        res.status(400).json({ error: "Invalid JSON." });
        return;
      }
      if ((error as { type?: string })?.type === "entity.too.large") {
        res.status(413).json({ error: "Request too large." });
        return;
      }
      if (
        String((error as { code?: string })?.code).startsWith(
          "SQLITE_CONSTRAINT",
        )
      ) {
        res
          .status(409)
          .json({
            error:
              "This change conflicts with an existing record. Refresh and try again.",
          });
        return;
      }
      log("error", "request.unexpected_error");
      if (!res.headersSent)
        res
          .status(500)
          .json({
            error:
              "Something went wrong. Your last change may not have saved. Refresh before trying again.",
          });
    },
  );
  return app;
}
