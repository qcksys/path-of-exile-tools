import { expect, test } from "@playwright/test";

for (const cpuRate of [1, 4]) {
    test(`opens the Scalar reference from integrations and loads the API contract (${cpuRate}x CPU slowdown)`, async ({
        page,
    }) => {
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
            if (message.text().includes("invalid reference")) errors.push(message.text());
        });
        const session = await page.context().newCDPSession(page);
        await session.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
        await page.goto("/integrations");
        const reference = page.getByRole("link", { name: "Browse the Scalar API reference" });
        await expect(reference).toHaveAttribute("href", "/api/docs");
        const documentResponse = page.waitForResponse(
            (response) => new URL(response.url()).pathname === "/api/openapi.json",
        );
        await reference.click();
        const response = await documentResponse;
        expect(response.status()).toBe(200);
        expect((await response.body()).length).toBeLessThan(1_000_000);
        await expect(page).toHaveURL(/\/api\/docs/);
        await expect(page).toHaveTitle("API Reference · POE.BOATS");
        await expect(
            page.getByRole("heading", { name: "POE.BOATS API", exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText("/api/v1/arbitrage/scenario", { exact: true }).first(),
        ).toBeVisible();
        expect(errors).toEqual([]);
    });
}
