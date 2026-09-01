/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { cloudflareBeacon } from "./scripts/cf-beacon-plugin.mjs";

export default defineConfig({
  base: process.env.VITE_BASE?.trim() || "/",
  plugins: [
    react(),
    // Cloudflare Web Analytics prints only when the deploy sets a site token;
    // local builds and forks ship no counter (see README, "Analytics").
    cloudflareBeacon(process.env.CF_BEACON_TOKEN?.trim()),
  ],
  server: {
    port: Number(process.env.PORT) || 5173,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    globals: false,
  },
});
