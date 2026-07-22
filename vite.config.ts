import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    tanstackStart({
      importProtection: {
        client: {
          files: ["**/db/**", "**/middleware/**"],
        },
      },
    }),
    viteReact(),
  ],
});

export default config;
