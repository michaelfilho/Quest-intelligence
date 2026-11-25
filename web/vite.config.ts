import react from "@vitejs/plugin-react";
import process from "node:process";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    fs: { allow: [".."] }, // ../shared
    // changeOrigin: false preserva o Host do navegador — a proteção CSRF compara Origin × Host
    // (o atalho em string do Vite liga changeOrigin e quebraria o login). Vale também para `vite preview`.
    proxy: { "/api": { target: process.env.RINNE_API_TARGET ?? "http://127.0.0.1:3333", changeOrigin: false } },
  },
  test: { include: ["src/**/*.test.ts"] },
});
