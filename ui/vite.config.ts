import { existsSync } from "node:fs"
import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
import { type LoadedConfig, loadConfig, starterConfig } from "../src/config.ts"
import { startServer } from "../src/server.ts"

function devBackendPlugin(): Plugin {
  return {
    name: "e2e-dev-backend",
    apply: "serve",
    async configureServer(server) {
      // Check if backend runner server is already listening on 4173
      let isUp = false
      try {
        const check = await fetch("http://127.0.0.1:4173/api/config", {
          signal: AbortSignal.timeout(300),
        })
        if (check.ok) isUp = true
      } catch {
        isUp = false
      }

      if (!isUp) {
        const config: LoadedConfig = await loadConfig(process.cwd()).catch(() => starterConfig(process.cwd()))

        const { server: apiServer } = await startServer(config, {
          port: 4173,
          host: "127.0.0.1",
          open: false,
        })


        server.httpServer?.on("close", () => {
          apiServer.close()
        })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devBackendPlugin()],
  root: resolve(import.meta.dirname),
  base: "./",
  build: {
    outDir: resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4173",
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("error", (_err, _req, res) => {
            if (res && "writeHead" in res && !res.headersSent) {
              res.writeHead(503, { "Content-Type": "application/json" })
              res.end(JSON.stringify({ error: "Backend server is starting up or unreachable" }))
            }
          })
        },
      },
    },
  },
})

