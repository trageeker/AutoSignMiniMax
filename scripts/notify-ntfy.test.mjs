import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNotification } from './notify-ntfy.mjs';

const row = (status, message, extra = {}) => ({ account: 1, name: 'me', status, message, currentPoints: 753.02, siteStreak: 2, ...extra });

test('stays silent when every account was already checked in', () => {
  assert.equal(buildNotification({ rows: [row('checked_in', 'MiniMax reports today as already checked in.')] }), null);
});

test('reports a fresh claim', () => {
  const note = buildNotification({ rows: [row('checked_in', 'MiniMax accepted the daily check-in for day 2 (+100 credits).')] });
  assert.equal(note.title, 'MiniMax 签到成功');
  assert.match(note.message, /签到成功，连续 2 天，积分 753.02/);
});

test('reports failures with high priority', () => {
  const note = buildNotification({ rows: [row('failed', 'Login expired')] });
  assert.equal(note.priority, 4);
  assert.match(note.title, /失败 1/);
});

test('manual runs report even when already checked in', () => {
  assert.ok(buildNotification({ rows: [row('checked_in', 'MiniMax reports today as already checked in.')] }, { notifyAlready: true }));
});

test('ignores skipped accounts', () => {
  assert.equal(buildNotification({ rows: [{ account: 2, status: 'skipped' }] }, { notifyAlready: true }), null);
});
