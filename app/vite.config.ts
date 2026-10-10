import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// Serves api/*.ts in dev with the same Request -> Response handlers Vercel runs in production.
function devApi(): Plugin {
  return {
    name: "rocksign-dev-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const m = req.url?.match(/^\/api\/([a-z-]+)/);
        if (!m) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${m[1]}.ts`);
          const handler = mod[req.method ?? "GET"];
          if (!handler) {
            res.statusCode = 405;
            return res.end();
          }
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const request = new Request(`http://localhost${req.url}`, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: chunks.length ? Buffer.concat(chunks) : undefined,
          });
          const response: Response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: (e as Error).message }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  return {
    plugins: [react(), nodePolyfills({ include: ["buffer"], globals: { Buffer: true, global: true, process: false } }), devApi()],
    worker: { format: "es" },
  };
});
