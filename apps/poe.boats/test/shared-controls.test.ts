import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";

it("keeps native form controls inside the shared UI components", () => {
    const nativeControls: string[] = [];
    function inspect(directory: string) {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) {
                if (path !== join("app", "components", "ui")) inspect(path);
            } else if (
                path.endsWith(".tsx") &&
                /<(input|select|textarea|button)\b/.test(readFileSync(path, "utf8"))
            ) {
                nativeControls.push(path);
            }
        }
    }
    inspect("app");
    expect(nativeControls).toEqual([]);
});
