import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  /* Camera needs a secure context - localhost counts; LAN testing on
     a phone needs https (use `vite --host` + a tunnel or mkcert). */
  server: { host: true },
});
