// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { useItemPresentations } from "~/hooks/use-item-presentations";

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

it("shares one catalog request per game and never renders another game's stale artwork", async () => {
    const responses = new Map<string, (response: Response) => void>();
    const fetch = vi.fn(
        (url: string) => new Promise<Response>((resolve) => responses.set(url, resolve)),
    );
    vi.stubGlobal("fetch", fetch);
    const first = renderHook(({ game }: { game: "poe1" | "poe2" }) => useItemPresentations(game), {
        initialProps: { game: "poe1" },
    });
    const second = renderHook(() => useItemPresentations("poe1"));
    expect(fetch).toHaveBeenCalledTimes(1);
    const item = {
        name: "Base",
        itemClass: "Ring",
        art: "poe1.png",
        dropLevel: 1,
        requirements: null,
        implicits: [],
    };
    await act(async () =>
        responses.get("/game-data/items-poe1.json")!(Response.json({ base: item })),
    );
    await waitFor(() => expect(first.result.current.base?.art).toBe("poe1.png"));
    expect(second.result.current.base?.art).toBe("poe1.png");
    first.rerender({ game: "poe2" });
    expect(first.result.current).toEqual({});
    await act(async () =>
        responses.get("/game-data/items-poe2.json")!(
            Response.json({ base: { ...item, art: "poe2.png" } }),
        ),
    );
    await waitFor(() => expect(first.result.current.base?.art).toBe("poe2.png"));
    expect(second.result.current.base?.art).toBe("poe1.png");
    expect(fetch).toHaveBeenCalledTimes(2);
});
