/** biome-ignore-all lint/style/useNamingConvention: Manifest keys use the WebExtension names. */
import { resolve } from "node:path";
import { defineConfig } from "wxt";
import { LOCAL_POE_BOATS_MATCHES, POE_BOATS_MATCHES, TRADE_MATCHES } from "./lib/origins";

const icons = {
    16: "icon/16.png",
    32: "icon/32.png",
    48: "icon/48.png",
    96: "icon/96.png",
    128: "icon/128.png",
};

// See https://wxt.dev/api/config.html
export default defineConfig({
    // Firefox defaults to MV2, whose content scripts cannot run in the page's main world.
    manifestVersion: 3,
    manifest: ({ browser, mode }) => ({
        name: "poe.boats Trade Pricing",
        description:
            "Prices poe.boats crafting steps from the official Path of Exile trade site in your own browser. Your pathofexile.com session never leaves your browser.",
        permissions: ["storage"],
        host_permissions: [
            ...TRADE_MATCHES,
            ...POE_BOATS_MATCHES,
            ...(mode === "production" ? [] : LOCAL_POE_BOATS_MATCHES),
        ],
        icons,
        ...(browser === "firefox"
            ? {
                  browser_specific_settings: {
                      gecko: {
                          id: "trade-pricing@poe.boats",
                          // Main-world content scripts need 128; built-in data consent needs 140.
                          strict_min_version: "140.0",
                          data_collection_permissions: { required: ["websiteContent"] },
                      },
                  },
              }
            : {}),
    }),
    hooks: {
        "build:manifestGenerated": (wxt, manifest) => {
            if (wxt.config.mode !== "production") return;
            for (const script of manifest.content_scripts ?? [])
                script.matches = script.matches?.filter(
                    (match) => !LOCAL_POE_BOATS_MATCHES.includes(match),
                );
        },
    },
    zip: {
        name: "poe-boats-trade-pricing",
        artifactTemplate: "{{name}}-{{version}}-{{browser}}{{modeSuffix}}.zip",
        // Firefox reviewers rebuild from source, which needs the shared bridge package too.
        sourcesRoot: resolve(import.meta.dirname, "../.."),
        includeSources: [
            "apps/poe.boats-extension/**",
            "packages/poe-trade-bridge/**",
            "package.json",
            "pnpm-workspace.yaml",
            "pnpm-lock.yaml",
        ],
    },
    webExt: {
        startUrls: ["https://www.pathofexile.com/trade"],
    },
});
