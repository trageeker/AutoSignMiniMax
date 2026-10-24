import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectSession } from './session-store.mjs';

const now = Date.UTC(2026, 9, 24);
const inDays = (d) => now / 1000 + d * 86_400;

test('ignores ad/analytics cookies such as Bing _uetsid when estimating expiry', () => {
  const info = inspectSession({
    cookies: [
      { name: '_uetsid', expires: inDays(1) },
      { name: '_twsid', expires: inDays(390) },
      { name: '_token', expires: inDays(30) },
      { name: '_sid', expires: inDays(40) },
    ],
    origins: [],
  }, now);
  assert.equal(info.source, 'cookie:_token');
  assert.equal(info.daysLeft, 30);
});
