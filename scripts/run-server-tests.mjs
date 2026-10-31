// Runs the tests that need a live server against a separate TEST Firebase project.
// Usage: put the test project's keys in .env.test (never committed), build, then: npm run test:server
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const PRODUCTION_PROJECTS = ['maharaja-799bb'];
const PORT = 3200;

if (!fs.existsSync('.env.test')) {
  console.error('Missing .env.test. Copy the keys of a separate TEST Firebase project into it (see README).');
  process.exit(1);
}
const env = { ...process.env };
for (const line of fs.readFileSync('.env.test', 'utf8').split('\n')) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
}
// Next fills missing keys from .env.local (production). Blank them so nothing falls back to live keys.
if (fs.existsSync('.env.local')) {
  for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
    const key = line.match(/^\s*([A-Z0-9_]+)\s*=/)?.[1];
    if (key && !fs.readFileSync('.env.test', 'utf8').includes(`${key}=`)) env[key] = '';
  }
}
if (!env.FIREBASE_PROJECT_ID || PRODUCTION_PROJECTS.includes(env.FIREBASE_PROJECT_ID)) {
  console.error(`Refusing to run: .env.test must point at a TEST Firebase project, not "${env.FIREBASE_PROJECT_ID || 'none'}".`);
  process.exit(1);
}
env.BASE_URL = `http://localhost:${PORT}`;

const server = spawn('npx', ['next', 'start', '-p', String(PORT)], { env, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('The test server did not start within 60 s.')), 60_000);
  server.stdout.on('data', (chunk) => { if (/Ready/i.test(chunk.toString())) { clearTimeout(timer); resolve(); } });
});

let failed = 0;
for (const test of ['test-qr-handoffs', 'test-e2e-flow', 'test-live-provider']) {
  const code = await new Promise((resolve) => spawn('node', [`scripts/${test}.mjs`], { env, stdio: 'inherit' }).on('close', resolve));
  console.log(`${code === 0 ? '✓' : '✗'} ${test}`);
  if (code !== 0) failed += 1;
}
server.kill();
process.exit(failed ? 1 : 0);
