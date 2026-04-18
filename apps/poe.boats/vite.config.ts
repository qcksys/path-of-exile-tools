import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite-plus";

export default defineConfig({
    resolve: {
        tsconfigPaths: true,
    },
    plugins: [
        cloudflare({
            viteEnvironment: { name: "ssr" },
        }),
        tailwindcss(),
        reactRouter(),
    ],
    ssr: {
        resolve: {
            conditions: ["workerd", "worker", "browser"],
        },
    },
    server: {
        cors: {
            preflightContinue: true,
        },
        hmr: true,
    },
});
