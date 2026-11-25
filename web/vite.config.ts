import react from "@vitejs/plugin-react";
import process from "node:process";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { normalizeBasePath } from "../shared/base-path.js";

export default defineConfig(({ mode }) => {
  const base = normalizeBasePath(process.env.VITE_BASE_PATH ?? loadEnv(mode, "..", "VITE_").VITE_BASE_PATH ?? "/");
  return {
    base,
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      fs: { allow: [".."] },
      // Preserva Host para a proteção CSRF. Em /core/, o proxy local simula o strip do Traefik.
      proxy: {
        [base + "api"]: {
          target: process.env.RINNE_API_TARGET ?? "http://127.0.0.1:3333", changeOrigin: false,
          rewrite: (path) => base === "/" ? path : path.slice(base.length - 1),
        },
      },
    },
    test: { include: ["src/**/*.test.ts"] },
  };
});
