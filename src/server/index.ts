import express from "express";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readConfig, log } from "./config.js";
import { openDatabase } from "./database.js";
import { createApp } from "./app.js";
process.umask(0o077);
try {
  const config = readConfig();
  const store = openDatabase(config.DATA_DIR);
  const app = createApp(store, config);
  app.get("/manifest.webmanifest", (_req, res) => {
    const manifest = JSON.parse(
      readFileSync(
        resolve(
          config.NODE_ENV === "development"
            ? "public/manifest.webmanifest"
            : "dist/client/manifest.webmanifest",
        ),
        "utf8",
      ),
    );
    res.setHeader("Cache-Control", "no-cache");
    res
      .type("application/manifest+json")
      .json({
        ...manifest,
        name: config.APP_NAME,
        short_name: config.APP_NAME,
      });
  });
  if (config.NODE_ENV === "development") {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(
      express.static(resolve("dist/client"), {
        index: false,
        setHeaders(res, path) {
          res.setHeader(
            "Cache-Control",
            path.includes("/assets/")
              ? "public, max-age=31536000, immutable"
              : "no-cache",
          );
        },
      }),
    );
    app.get("/{*path}", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(resolve("dist/client/index.html"));
    });
  }
  const server = app.listen(config.PORT, "0.0.0.0", () =>
    log("info", "server.started"),
  );
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    log("info", "server.stopping");
    server.close(() => {
      store.sqlite.close();
      log("info", "server.stopped");
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
} catch (error) {
  log("error", "startup.failed");
  console.error(
    error instanceof Error &&
      /configuration|requires|OIDC|authentication|migration|APP_ORIGIN/.test(
        error.message,
      )
      ? error.message
      : "Startup failed. Check configuration and data directory permissions.",
  );
  process.exitCode = 1;
}
