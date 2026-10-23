import { expect, test } from "@playwright/test";

test.describe("public experience", () => {
  test("landing page shows the call to action and live stats", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Spot a pothole?");
    await expect(page.getByRole("link", { name: "Report an issue" }).first()).toBeVisible();
    await expect(page.getByText("Reports filed")).toBeVisible();
  });

  test("issue map renders clustered, severity-coloured markers", async ({ page }) => {
    await page.goto("/map");
    await expect(page.getByText(/issues? shown/)).toBeVisible();
    // Clusters or individual markers appear once Leaflet has loaded.
    await expect(page.locator(".cp-cluster, .cp-marker").first()).toBeVisible();
    await expect(page.getByText("Larger dots = higher priority")).toBeVisible();

    await page.getByRole("button", { name: /Heatmap/ }).click();
    await expect(page.getByText("Issue density (severity-weighted)")).toBeVisible();
  });

  test("protected routes redirect anonymous visitors to sign-in", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fdashboard/);
    const media = await page.request.get("/api/media/seed/pothole-1.jpg");
    expect(media.status()).toBe(401);
  });
});
