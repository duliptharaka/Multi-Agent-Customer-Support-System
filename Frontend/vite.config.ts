import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_ADK_API_BASE_URL ?? "http://127.0.0.1:8000";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api/adk": {
          target,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/adk/, ""),
        },
      },
    },
  };
});
