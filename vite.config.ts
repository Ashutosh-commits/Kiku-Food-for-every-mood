import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
<<<<<<< HEAD
  server: {
    host: process.env.VITE_DEV_HOST || "127.0.0.1",
    // In dev, the Vite server (this process) renders the frontend, and
    // forwards anything under /api to the Node middleware (server/index.js)
    // running separately on its own port. This means frontend code always
    // calls the same relative path (e.g. fetch("/api/compare")) in both
    // dev and production - it never needs to know the middleware's port,
    // let alone the Python comparison service's.
    proxy: {
      "/api": {
        target: process.env.MIDDLEWARE_URL || "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
=======
>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc
});
