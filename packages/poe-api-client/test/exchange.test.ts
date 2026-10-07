import ky from "ky";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { createClient } from "../src/client.ts";

afterEach(() => vi.unstubAllGlobals());

it("uses the public CDN without resolving OAuth for both games and console realms", async () => {
    const requests: Request[] = [];
    const fetch = vi.fn(async (request: Request) => {
        requests.push(request);
        // biome-ignore lint/style/useNamingConvention: Upstream API field name.
        return Response.json({ next_change_id: 1722034800, markets: [] });
    });
    vi.stubGlobal("fetch", fetch);
    const token = vi.fn(() => {
        throw new Error("OAuth must not be requested");
    });
    for (const realm of ["pc", "poe2", "xbox", "sony"] as const) {
        const client = createClient({ userAgent: "test-client", token, realm });
        await client.public.currencyExchange({ id: 1722031200 });
        const request = requests.at(-1)!;
        const segment = realm === "pc" ? "" : `/${realm}`;
        expect(request.url).toBe(
            `https://web.poecdn.com/api/currency-exchange${segment}/1722031200`,
        );
        expect(request.headers.has("Authorization")).toBe(false);
        expect(request.headers.get("User-Agent")).toBe("test-client");
        await client.public.currencyExchange({ realm: "pc" });
        expect(requests.at(-1)!.url).toBe("https://web.poecdn.com/api/currency-exchange");
    }
    expect(token).not.toHaveBeenCalled();
});

it("preserves fixture transports, removes inherited bearer headers, and authenticates account calls", async () => {
    const requests: Request[] = [];
    const transport = ky.create({
        baseUrl: "https://fixture.example/",
        headers: { authorization: "Bearer inherited-test-token" },
        fetch: async (request) => {
            requests.push(new Request(request));
            return Response.json({ name: "Example", uuid: "example" });
        },
    });
    const token = vi.fn(() => "account-test-token");
    const client = createClient({
        userAgent: "test-client",
        token,
        ky: transport,
        baseUrl: "https://fixture.example/api/",
    });
    await client.public.currencyExchange({ realm: "poe2", id: 1722031200 });
    expect(requests[0]!.url).toBe("https://fixture.example/api/currency-exchange/poe2/1722031200");
    expect(requests[0]!.headers.has("Authorization")).toBe(false);
    expect(token).not.toHaveBeenCalled();
    await client.profile.get();
    expect(requests[1]!.url).toBe("https://fixture.example/profile");
    expect(requests[1]!.headers.get("Authorization")).toBe("Bearer account-test-token");
    expect(token).toHaveBeenCalledOnce();
});
