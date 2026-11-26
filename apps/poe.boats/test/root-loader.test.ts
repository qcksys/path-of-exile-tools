import { readFile } from "node:fs/promises";
import { RouterContextProvider, type ShouldRevalidateFunctionArgs } from "react-router";
import { Theme } from "remix-themes";
import { describe, expect, it } from "vite-plus/test";
import { localeContext } from "../app/context";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "../app/i18n/types";
import { loader, shouldRevalidate } from "../app/root";

it("switches pages without requesting the theme and translations again, and refreshes them after actions", () => {
    const args = {
        currentUrl: new URL("https://example.invalid/1/crafting/simulate"),
        nextUrl: new URL("https://example.invalid/1/crafting/emulate"),
        defaultShouldRevalidate: true,
    } as ShouldRevalidateFunctionArgs;
    expect(shouldRevalidate(args)).toBe(false);
    expect(shouldRevalidate({ ...args, formMethod: "POST" })).toBe(true);
    expect(shouldRevalidate({ ...args, nextUrl: args.currentUrl })).toBe(true);
});

describe("root locale loader", () => {
    it.each(SUPPORTED_LOCALES)("provides SSR translations for %s", async (locale) => {
        const context = new RouterContextProvider();
        context.set(localeContext, locale);

        const result = await loader({
            request: new Request("https://poe.boats/"),
            params: {},
            context,
            pattern: "/",
            url: new URL("https://poe.boats/"),
        });

        const expected =
            locale === DEFAULT_LOCALE
                ? null
                : JSON.parse(
                      await readFile(
                          new URL(`../app/i18n/locales/${locale}.json`, import.meta.url),
                          "utf8",
                      ),
                  );

        expect(result).toEqual({ theme: Theme.DARK, locale, translations: expected });
    });
});
