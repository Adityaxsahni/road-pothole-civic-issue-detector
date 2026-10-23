import { expect, test } from "@playwright/test";
import { renderScene } from "../../server/media/synthetic";
import { login } from "./helpers";

test.use({
  geolocation: { latitude: 12.9279, longitude: 77.6271 },
  permissions: ["geolocation"],
});

test("citizen reports a pothole through the wizard with AI assistance", async ({ page }) => {
  await login(page, "citizen@civicpulse.dev", "/report");
  await expect(page).toHaveURL(/\/report$/);
  await expect(page.getByRole("heading", { name: "Show us the problem" })).toBeVisible();

  // Step 1 — photo + AI suggestion. A unique seed keeps the image from matching earlier runs.
  const photo = await renderScene("pothole", Date.now() % 100_000);
  await page
    .getByTestId("media-input")
    .setInputFiles({ name: "pothole.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(page.getByText(/Looks like a pothole/)).toBeVisible();
  await page.getByRole("button", { name: /Continue/ }).click();

  // Step 2 — AI pre-selected the category; the citizen confirms.
  await expect(page.getByRole("radio", { name: /Pothole/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: /Continue/ }).click();

  // Step 3 — GPS fix (mocked) and road context.
  await expect(page.getByText(/12\.9279\d*, 77\.6271/)).toBeVisible();
  await page.getByLabel("Type of road").selectOption("ARTERIAL");
  await page.getByLabel("Traffic at this spot").selectOption("HEAVY");
  await page.getByRole("button", { name: /Continue/ }).click();

  // Step 4 — details with validation.
  await page.getByLabel("What's the problem?").fill("short");
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByText(/at least 10 characters/)).toBeVisible();
  await page
    .getByLabel("What's the problem?")
    .fill("Deep pothole in the left lane right after the signal, about a metre wide.");
  await page.getByRole("button", { name: /Continue/ }).click();

  // Step 5 — review and submit.
  await expect(page.getByRole("heading", { name: "Review and submit" })).toBeVisible();
  await page.getByRole("button", { name: /Submit report/ }).click();

  await expect(page).toHaveURL(/\/report\/submitted\//);
  await expect(page.getByRole("heading", { name: /report received/ })).toBeVisible();
  await expect(page.getByTestId("ref-code")).toHaveText(/^CP-[A-Z0-9]{6}$/);
  await expect(page.getByText(/AI detected pothole/)).toBeVisible();

  await page.getByRole("link", { name: /Track this report/ }).click();
  await expect(page.getByText("Report submitted").first()).toBeVisible();
});
