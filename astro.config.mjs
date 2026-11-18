// @ts-check
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
  security: {
    checkOrigin: true,
    // In production Caddy terminates TLS. Unless Astro trusts its X-Forwarded-Proto for this host it sees
    // http:// and the origin check rejects every form post from https://. Baked in at build time
    // (Dockerfile ARG PUBLIC_HOSTNAME); empty in dev, where nothing sits in front.
    allowedDomains: process.env.PUBLIC_HOSTNAME ? [{ hostname: process.env.PUBLIC_HOSTNAME, protocol: "https" }] : [],
  },
  devToolbar: { enabled: false },
});
