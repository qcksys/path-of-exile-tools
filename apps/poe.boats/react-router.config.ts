import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  future: {
    // biome-ignore lint/style/useNamingConvention: package
    v8_viteEnvironmentApi: true,
    // biome-ignore lint/style/useNamingConvention: package
    v8_middleware: true,
  },
} satisfies Config;
