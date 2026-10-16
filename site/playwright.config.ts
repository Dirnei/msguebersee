import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  use: { baseURL: 'http://127.0.0.1:4329' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4329',
    url: 'http://127.0.0.1:4329',
    env: { PUBLIC_RELAY_URL: 'https://relay.test', BASE_PATH: '/', WHATSAPP_NUMMER: '+49 151 00000000' },
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
