import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { buildAllowedBrowserOrigins } from '@yucp/shared/authOrigins';
import { parse as parseDotenv } from 'dotenv';
import { defineConfig } from 'vite';
import tsConfigPaths from 'vite-tsconfig-paths';

const APP_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT_DIR = join(APP_DIR, '..', '..');
const LOCAL_WORKER_ENV_FILES = [join(APP_DIR, '.dev.vars'), join(REPO_ROOT_DIR, '.env.local')];

function loadLocalWorkerEnvFiles(): void {
  let loaded = 0;
  const loadedFiles: string[] = [];

  for (const filePath of LOCAL_WORKER_ENV_FILES) {
    if (!existsSync(filePath)) {
      continue;
    }

    const parsed = parseDotenv(readFileSync(filePath, 'utf8'));
    let fileLoaded = false;
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
        loaded++;
        fileLoaded = true;
      }
    }

    if (fileLoaded) {
      loadedFiles.push(filePath);
    }
  }

  if (loaded > 0) {
    // eslint-disable-next-line no-console
    console.log(`[web] Loaded ${loaded} local Worker env values from ${loadedFiles.join(', ')}`);
  }
}

function buildViteAllowedHosts(): string[] {
  return Array.from(
    new Set(
      buildAllowedBrowserOrigins({
        siteUrl: process.env.SITE_URL,
        frontendUrl: process.env.FRONTEND_URL,
      }).map((origin) => new URL(origin).hostname)
    )
  );
}

export default defineConfig(async () => {
  loadLocalWorkerEnvFiles();

  const allowedHosts = buildViteAllowedHosts();

  return {
    // Expose CONVEX_URL to client code via import.meta.env.CONVEX_URL.
    // This is a public URL (not a secret) so it's safe to embed in the client bundle.
    // The value comes from Worker bindings or local Worker env files.
    define: {
      'import.meta.env.CONVEX_URL': JSON.stringify(process.env.CONVEX_URL),
      'import.meta.env.CONVEX_SITE_URL': JSON.stringify(process.env.CONVEX_SITE_URL),
      'import.meta.env.HYPERDX_API_KEY': JSON.stringify(process.env.HYPERDX_API_KEY),
      'import.meta.env.HYPERDX_OTLP_HTTP_URL': JSON.stringify(
        process.env.HYPERDX_OTLP_HTTP_URL ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT
      ),
      'import.meta.env.HYPERDX_APP_URL': JSON.stringify(process.env.HYPERDX_APP_URL),
      // Injected at build time for version skew detection (see versionPoller.ts).
      // In CI/CD, set BUILD_ID to the git SHA or pipeline run ID.
      'import.meta.env.VITE_BUILD_ID': JSON.stringify(process.env.BUILD_ID ?? 'dev'),
    },
    server: {
      allowedHosts,
      port: 3000,
    },
    preview: {
      allowedHosts,
      port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
      host: '0.0.0.0',
    },
    ssr: {
      noExternal: ['@convex-dev/better-auth'],
    },
    plugins: [
      cloudflare({ viteEnvironment: { name: 'ssr' } }),
      tsConfigPaths(),
      tailwindcss(),
      tanstackStart({
        tsr: {
          appDirectory: './src',
          autoCodeSplitting: true,
        },
      }),
      viteReact(),
    ],
  };
});
