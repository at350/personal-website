/* Types for the beacon plugin so vite.config.ts and the tests can import the
   plain-JS script under strict TypeScript without turning allowJs on. */
import type { Plugin } from "vite";

export const BEACON_SRC: "https://static.cloudflareinsights.com/beacon.min.js";

export const beaconTag: (token: string | undefined | null) => string;

export interface CloudflareBeaconPlugin extends Plugin {
  name: "cloudflare-beacon";
  transformIndexHtml: (html: string) => string;
}

export const cloudflareBeacon: (
  token: string | undefined | null,
) => CloudflareBeaconPlugin;
