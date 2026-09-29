import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("phone journal critical path, export, accessibility, PWA installability and offline privacy", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByLabel("Email or username")).toBeVisible();
  if (
    await page.getByRole("button", { name: "Create my journal" }).isVisible()
  ) {
    await page
      .getByLabel("Setup secret")
      .fill("browser-test-setup-secret-32-characters");
    await page.getByLabel("Email or username").fill("phone-owner");
    await page
      .getByLabel("Password", { exact: true })
      .fill("browser-only-test-password");
    await page.getByRole("button", { name: "Create my journal" }).click();
  } else {
    await page.getByLabel("Email or username").fill("phone-owner");
    await page
      .getByLabel("Password", { exact: true })
      .fill("browser-only-test-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }
  await expect(
    page.getByRole("button", { name: "Log Migraine", exact: true }),
  ).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Mobile navigation" });
  await nav.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByLabel("Email or username").fill("phone-owner");
  await page
    .getByLabel("Password", { exact: true })
    .fill("browser-only-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await nav.getByRole("button", { name: "Medications", exact: true }).click();
  await page.getByRole("button", { name: "Add medication" }).click();
  await page.getByLabel("Medication name").fill("Test acute medication");
  await page.getByLabel("Your prescribed dose (optional)").fill("1");
  await page.getByRole("button", { name: "Save medication" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await nav.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Migraine starting now" }).click();
  await expect(
    page.getByText("Migraine active", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await page.getByRole("button", { name: "Severity 6", exact: true }).click();
  await page.getByRole("button", { name: "Nausea", exact: true }).click();
  await page
    .getByRole("button", { name: "Light sensitivity", exact: true })
    .click();
  await page.getByText("Impact on your day", { exact: true }).click();
  await page.getByLabel("How much did this affect your day?").selectOption("3");
  await page.getByRole("button", { name: "Save migraine" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Take medication" }).click();
  await page.getByLabel("Dose taken").fill("1");
  await page.getByRole("button", { name: "Save dose" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "End Migraine" }).click();
  await expect(
    page.getByText("Migraine active", { exact: true }),
  ).not.toBeVisible();
  await nav.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    page.getByText("Test acute medication · High impact"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.locator(".calendar-day.level-moderate")).toHaveCount(1);
  await nav.getByRole("button", { name: "Trends", exact: true }).click();
  await expect(
    page
      .locator(".metric")
      .filter({ hasText: "Average severity" })
      .locator("strong"),
  ).toHaveText("6/10");
  await expect(
    page
      .locator(".metric")
      .filter({ hasText: "Acute doses" })
      .locator("strong"),
  ).toHaveText("1");
  await page.getByRole("button", { name: "Doctor report" }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  expect((await downloaded).suggestedFilename()).toBe("migraine-report.pdf");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await nav.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Theme", { exact: true }).selectOption("dark");
  // External preference updates must reach the form without losing the unsaved theme.
  const comfort = page.getByRole("button", {
    name: "Low stimulation",
    exact: true,
  });
  const switchControl = page.getByRole("switch", {
    name: /^Low-stimulation mode/,
  });
  await comfort.click();
  await expect(switchControl).toBeChecked();
  await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("dark");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(comfort).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(switchControl).toBeChecked();
  await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("dark");
  await comfort.click();
  await expect(switchControl).not.toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await nav.getByRole("button", { name: "Home", exact: true }).click();
  await page
    .getByRole("button", { name: "Low stimulation", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-stimulation", "low");
  await page.getByRole("button", { name: "Log Migraine", exact: true }).click();
  expect(await page.locator("dialog details[open]").count()).toBe(0);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.screenshot({
    path: "test-results/mobile-dark.png",
    fullPage: true,
  });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Page.enable");
  const manifest = await cdp.send("Page.getAppManifest");
  expect(manifest.errors).toEqual([]);
  const installability = await cdp.send("Page.getInstallabilityErrors"); // Playwright contexts are private; a separate persistent-context test verifies actual installability.
  expect(
    installability.installabilityErrors.filter(
      (e) => e.errorId !== "in-incognito",
    ),
  ).toEqual([]);
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    return (
      await Promise.all(
        keys.map(async (key) =>
          (await (await caches.open(key)).keys()).map((r) => r.url),
        ),
      )
    ).flat();
  });
  expect(cached.some((url) => url.includes("/api/"))).toBe(false);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "A quiet pause." }),
  ).toBeVisible();
  await expect(
    page.getByText("Nothing entered offline will be saved.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A quiet pause." }),
  ).toBeVisible();
  await context.setOffline(false);
  await page.getByRole("link", { name: "Try reconnecting" }).click();
  await expect(
    page.getByRole("button", { name: "Log Migraine", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("PWA has no installability errors in a non-private Chromium profile", async () => {
  const directory = mkdtempSync(join(tmpdir(), "tracker-installability-"));
  const browser = await chromium.launchPersistentContext(directory, {
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}),
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const page = await browser.newPage();
    await page.goto("http://localhost:3100/");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    const cdp = await browser.newCDPSession(page);
    await cdp.send("Page.enable");
    expect((await cdp.send("Page.getAppManifest")).errors).toEqual([]);
    expect(
      (await cdp.send("Page.getInstallabilityErrors")).installabilityErrors,
    ).toEqual([]);
  } finally {
    await browser.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
