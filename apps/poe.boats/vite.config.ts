import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { Marked } from "marked";
import { defineConfig, type Plugin } from "vite-plus";

function embeddedMarkdown(entries: Record<string, string>): Plugin {
  const prefix = "virtual:markdown/";
  const resolved = "\0virtual:markdown/";
  const marked = new Marked({ gfm: true });
  return {
    name: "embedded-markdown",
    resolveId(id) {
      if (!id.startsWith(prefix)) return null;
      const name = id.slice(prefix.length);
      if (!(name in entries)) return null;
      return resolved + name;
    },
    load(id) {
      if (!id.startsWith(resolved)) return null;
      const name = id.slice(resolved.length);
      const filePath = entries[name];
      if (!filePath) return null;
      this.addWatchFile(filePath);
      const source = readFileSync(filePath, "utf8");
      const html = marked.parse(source, { async: false });
      return `export default ${JSON.stringify(html)};`;
    },
  };
}

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    embeddedMarkdown({
      "idol-planner-changelog": resolve(import.meta.dirname, "CHANGELOG-idol-planner.md"),
    }),
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
