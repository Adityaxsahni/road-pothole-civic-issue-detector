import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("city dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "admin@civicpulse.dev", "/dashboard");
  });

  test("overview shows KPIs, priority queue and hotspots", async ({ page }) => {
    await expect(page.getByText("Total reports")).toBeVisible();
    await expect(page.getByText("Priority queue")).toBeVisible();
    await expect(page.getByText("Hotspot regions")).toBeVisible();
    await expect(page.getByText("Duplicates merged")).toBeVisible();
  });

  test("filters the issue queue and triages a report", async ({ page }) => {
    await page.goto("/dashboard/reports");
    await page.getByLabel("Status", { exact: true }).selectOption("open");
    await expect(page).toHaveURL(/status=NEW%2CVERIFIED%2CASSIGNED%2CIN_PROGRESS/);
    await page.getByRole("button", { name: "High", exact: true }).click();
    await expect(page).toHaveURL(/severity=HIGH/);
    await expect(page.getByText(/Showing \d+–\d+ of \d+/)).toBeVisible();

    // Open the top-priority report.
    await page.locator("table tbody tr a").first().click();
    for (const name of ["AI analysis", "Priority score", "Deduplication"]) {
      await expect(page.getByRole("heading", { name })).toBeVisible();
    }

    // Optimistic internal note.
    const note = `Inspection booked ${Date.now()}`;
    await page.getByLabel("Add a note").fill(note);
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText(note)).toBeVisible();

    // Resolve it.
    await page.getByRole("button", { name: "Mark resolved" }).click();
    await expect(page.getByText("Marked as resolved")).toBeVisible();
    await expect(page.getByText("Status changed to Resolved").first()).toBeVisible();
  });

  test("exports the filtered queue as CSV", async ({ page }) => {
    const res = await page.request.get("/api/reports/export?severity=CRITICAL,HIGH");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    const body = await res.text();
    expect(body.split("\r\n")[0]).toContain("Reference,Title,Category,Status,Severity");
  });

  test("analytics page renders trends, clusters and repeat zones", async ({ page }) => {
    await page.goto("/dashboard/analytics");
    for (const name of [
      "Issue trend",
      "Resolved vs unresolved by neighbourhood",
      "Repeat problem zones",
      "Problem clusters",
    ]) {
      await expect(page.getByRole("heading", { name })).toBeVisible();
    }
  });
});
