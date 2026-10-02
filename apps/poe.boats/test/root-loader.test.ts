import { readFile } from "node:fs/promises";
import { RouterContextProvider } from "react-router";
import { Theme } from "remix-themes";
import { describe, expect, it } from "vite-plus/test";
import { localeContext } from "../app/context";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "../app/i18n/types";
import { loader } from "../app/root";

describe("root locale loader", () => {
    it.each(SUPPORTED_LOCALES)("provides SSR translations for %s", async (locale) => {
        const context = new RouterContextProvider();
        context.set(localeContext, locale);

        const result = await loader({
            request: new Request("https://poe.boats/"),
            params: {},
            context,
            // biome-ignore lint/style/useNamingConvention: React Router defines this field name.
            unstable_pattern: "/",
            // biome-ignore lint/style/useNamingConvention: React Router defines this field name.
            unstable_url: new URL("https://poe.boats/"),
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
