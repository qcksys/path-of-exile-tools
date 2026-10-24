import { expect, it } from "vite-plus/test";
import { openDatabase } from "~/db/client";

it("shares the HTTP database across requests but isolates different database URLs", async () => {
    const first = await openDatabase("mysql://test:test@localhost/first");
    await first.close();
    const next = await openDatabase("mysql://test:test@localhost/first");
    expect(next.db).toBe(first.db);
    const other = await openDatabase("mysql://test:test@localhost/second");
    expect(other.db).not.toBe(first.db);
    expect((await openDatabase("mysql://test:test@localhost/second")).db).toBe(other.db);
});
