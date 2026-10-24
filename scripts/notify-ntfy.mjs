// Push the check-in outcome to an ntfy topic.
//
// Sends one message per run when at least one account failed or actually
// claimed today's reward. Runs that only find "already checked in" stay
// silent (the workflow fires several times a day), unless
// NTFY_NOTIFY_ALREADY=true (set for manual runs so a test always reports).
//
// Env: NTFY_URL (base URL), NTFY_TOPIC, NTFY_USER, NTFY_PASSWORD (Basic auth),
//      MINIMAX_SUMMARY_DIR (default ./artifacts), NTFY_NOTIFY_ALREADY.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ALREADY_RE = /already checked in/i;

export function buildNotification(summary, { notifyAlready = false, runUrl = null } = {}) {
  const rows = (summary?.rows ?? []).filter((row) => row.status !== 'skipped');
  if (!rows.length) return null;

  const failed = rows.filter((row) => row.status === 'failed');
  const fresh = rows.filter((row) => row.status === 'checked_in' && !ALREADY_RE.test(row.message ?? ''));
  if (!failed.length && !fresh.length && !notifyAlready) return null;

  const credits = (row) => (typeof row.currentPoints === 'number' && row.currentPoints >= 0
    ? `，积分 ${row.currentPoints.toLocaleString('en-US')}` : '');
  const lines = rows.map((row) => {
    if (row.status === 'failed') return `❌ ${row.name}：失败 - ${String(row.message ?? '').slice(0, 200)}`;
    const what = ALREADY_RE.test(row.message ?? '') ? '今日已签到' : '签到成功';
    const streak = Number.isInteger(row.siteStreak) ? `，连续 ${row.siteStreak} 天` : '';
    return `✅ ${row.name}：${what}${streak}${credits(row)}`;
  });
  const expiring = summary?.sessions?.expiringSoon ?? [];
  for (const item of expiring) {
    lines.push(`⏳ ${item.name}：登录约 ${item.daysLeft} 天后过期，请更新 Storage State`);
  }

  return {
    title: failed.length ? `MiniMax 签到失败 ${failed.length} 个` : 'MiniMax 签到成功',
    message: lines.join('\n'),
    priority: failed.length ? 4 : 3,
    tags: [failed.length ? 'warning' : 'white_check_mark'],
    ...(runUrl ? { click: runUrl, actions: [{ action: 'view', label: '查看运行', url: runUrl }] } : {}),
  };
}

async function main() {
  const base = (process.env.NTFY_URL || '').replace(/\/+$/, '');
  const topic = process.env.NTFY_TOPIC || '';
  if (!base || !topic) {
    console.log('ntfy not configured (NTFY_URL / NTFY_TOPIC); skipping notification.');
    return;
  }
  const file = join(process.env.MINIMAX_SUMMARY_DIR || 'artifacts', 'minimax-daily-summary.json');
  if (!existsSync(file)) {
    console.log(`No summary at ${file}; skipping notification.`);
    return;
  }
  const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null;
  const note = buildNotification(JSON.parse(readFileSync(file, 'utf8')), {
    notifyAlready: process.env.NTFY_NOTIFY_ALREADY === 'true',
    runUrl,
  });
  if (!note) {
    console.log('Nothing new to report (already checked in earlier today); no notification sent.');
    return;
  }

  const headers = { 'Content-Type': 'application/json' };
  if (process.env.NTFY_USER && process.env.NTFY_PASSWORD) {
    headers.Authorization = `Basic ${Buffer.from(`${process.env.NTFY_USER}:${process.env.NTFY_PASSWORD}`).toString('base64')}`;
  }
  // JSON publishing goes to the base URL so non-ASCII titles survive intact.
  const response = await fetch(base, { method: 'POST', headers, body: JSON.stringify({ topic, ...note }) });
  if (!response.ok) {
    throw new Error(`ntfy rejected the notification: HTTP ${response.status} ${await response.text()}`);
  }
  console.log(`Sent ntfy notification to topic "${topic}": ${note.title}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`::warning::${error.message}`);
    // A notification failure must never fail the check-in workflow.
  });
}
