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
    page.getByRole("button", { name: "Migraine starting now" }),
  ).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Mobile navigation" });
  const settings = page.getByRole("button", { name: "Settings", exact: true });
  const next = page.getByRole("button", { name: "Next", exact: true });
  await settings.click();
  await page
    .getByRole("navigation", { name: "Settings sections" })
    .getByRole("button", { name: "Account" })
    .click();
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
  // Details are added one page at a time; the back gesture returns to the previous step.
  await page.getByRole("button", { name: "Add details", exact: true }).click();
  await expect(page.getByText("Step 1 of 6")).toBeVisible();
  await page.getByRole("button", { name: "Severity 6", exact: true }).click();
  await next.click();
  await expect(page.getByText("Step 2 of 6")).toBeVisible();
  await page.getByRole("button", { name: "Nausea", exact: true }).click();
  await page
    .getByRole("button", { name: "Light sensitivity", exact: true })
    .click();
  await next.click();
  await page.goBack();
  await expect(page.getByText("Step 2 of 6")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Nausea", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await next.click();
  await page
    .getByRole("button", { name: "3 · Stopped normal activities" })
    .click();
  await next.click();
  // Enter in a text field adds the custom entry instead of saving or moving on.
  await page.getByLabel("Add your own").fill("Long drive");
  await page.getByLabel("Add your own").press("Enter");
  await expect(page.getByText("Step 4 of 6")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Long drive", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await next.click();
  // Hours slept are calculated from clock times across midnight.
  await page.getByLabel("Went to bed around").fill("23:30");
  await page.getByLabel("Woke up around").fill("07:00");
  await expect(page.getByText("That’s about 7h 30m of sleep.")).toBeVisible();
  await expect(page.getByLabel("Or estimate hours slept")).toHaveCount(0);
  await next.click();
  await expect(
    page.getByText("11:30 PM to 7:00 AM · about 7h 30m"),
  ).toBeVisible();
  const accessibilityInFlow = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibilityInFlow.violations).toEqual([]);
  await page.getByRole("button", { name: "Save migraine" }).click();
  await expect(
    page.getByText("Migraine active", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Take medication" }).click();
  await page.getByLabel("Dose taken").fill("1");
  await page.getByRole("button", { name: "Save dose" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "End migraine" }).click();
  await expect(
    page.getByText("Migraine active", { exact: true }),
  ).not.toBeVisible();
  // A daily check-in can be saved from any step.
  await page.getByRole("button", { name: "Check in", exact: true }).click();
  await next.click();
  await page.getByLabel("Went to bed around").fill("22:00");
  await page.getByLabel("Woke up around").fill("06:00");
  await page.getByRole("button", { name: "Save now" }).click();
  await expect(page.getByText("You’ve checked in today")).toBeVisible();
  await nav.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    page.getByText("Test acute medication · High impact"),
  ).toBeVisible();
  await page.getByText("Test acute medication · High impact").click();
  await expect(page.getByText("Long drive")).toBeVisible();
  await expect(
    page.getByText("11:30 PM to 7:00 AM · about 7h 30m"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page
    .getByRole("navigation", { name: "History sections" })
    .getByRole("button", { name: "Calendar", exact: true })
    .click();
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
  await expect(page.getByRole("dialog")).not.toBeVisible();
  // Preferences save immediately and stay in step with the Low stimulation button.
  await settings.click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const comfort = page.getByRole("button", {
    name: "Low stimulation",
    exact: true,
  });
  const switchControl = page.getByRole("switch", {
    name: /^Low-stimulation mode/,
  });
  await comfort.click();
  await expect(switchControl).toBeChecked();
  await page.reload();
  await expect(switchControl).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Dark", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await switchControl.click();
  await expect(comfort).toHaveAttribute("aria-pressed", "false");
  await nav.getByRole("button", { name: "Home", exact: true }).click();
  await comfort.click();
  await expect(page.locator("html")).toHaveAttribute("data-stimulation", "low");
  // Low-stimulation mode shortens a new entry to the essentials and a review.
  await nav.getByRole("button", { name: /^Log/ }).click();
  await expect(page.getByText("Step 1 of 2")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Migraine starting now" }),
  ).toBeVisible();
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
    page.getByRole("button", { name: "Migraine starting now" }),
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
