import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-plugin';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: { bindings: { TURNSTILE_SECRET: 'test-turnstile', PSI_API_KEY: 'test-psi', DATAFORSEO_LOGIN: 'test-dfs-login', DATAFORSEO_PASSWORD: 'test-dfs-password', RESEND_API_KEY: 'test-resend', LEAD_EMAIL_TO: 'owner@test.example' } },
    }),
  ],
});
