import { chromium, devices } from 'playwright';
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const m = await (await nav.newContext({ ...devices['iPhone SE'], viewport: { width: 375, height: 667 },
  httpCredentials: { username: 'carlos', password: 'probando' } })).newPage();
await m.goto('http://127.0.0.1:3000/probar-ui', { waitUntil: 'networkidle' });
console.log('clases de paneles:', await m.evaluate(() =>
  [...document.querySelectorAll('[role="tabpanel"]')].map(e => [e.className, (e.textContent||'').slice(0,28)])));
