import { expect, test } from "@playwright/test";

test("opens the Scalar reference from integrations and loads the API contract", async ({
    page,
}) => {
    await page.goto("/integrations");
    const reference = page.getByRole("link", { name: "Browse the Scalar API reference" });
    await expect(reference).toHaveAttribute("href", "/api/docs");
    const documentResponse = page.waitForResponse(
        (response) => new URL(response.url()).pathname === "/api/openapi.json",
    );
    await reference.click();
    expect((await documentResponse).status()).toBe(200);
    await expect(page).toHaveURL(/\/api\/docs/);
    await expect(page).toHaveTitle("API Reference · POE.BOATS");
    await expect(page.getByRole("heading", { name: "POE.BOATS API", exact: true })).toBeVisible();
    await expect(
        page.getByText("/api/v1/arbitrage/scenario", { exact: true }).first(),
    ).toBeVisible();
});
