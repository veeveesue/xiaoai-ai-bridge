import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RuntimeLog, RecoveringPoller, readHealth, failureKind } from './poc-runtime.mjs';
const temp = () => mkdtempSync(join(tmpdir(), 'xiaoai-runtime-'));

test('polling rebuilds clients after consecutive failures, then records recovery and keeps same cursor owner', async () => {
  let connects = 0, requests = 0;
  const directory = temp(), log = new RuntimeLog(directory);
  const poller = new RecoveringPoller({ log, connect: async () => {
    connects++;
    return { mina: { getConversations: async () => { requests++; return connects === 1 ? undefined : { records: [] }; } }, miot: {} };
  } });
  for (let i = 0; i < 3; i++) assert.ok((await poller.poll()).delayMs > 500);
  assert.equal(connects, 1);
  assert.deepEqual((await poller.poll()).data.records, []);
  assert.equal(connects, 2); assert.equal(requests, 4); assert.equal(poller.failures, 0);
  assert.match(readFileSync(log.path, 'utf8'), /poll_recovered/);
  assert.equal(readHealth(directory).healthy, true);
});

test('startup authentication failures retry and eventually request a bounded restart', async () => {
  const log = new RuntimeLog(temp());
  const poller = new RecoveringPoller({ log, maxFailures: 4, connect: async () => undefined });
  for (let i = 0; i < 3; i++) await poller.poll();
  await assert.rejects(poller.poll(), { code: 'RESTART_REQUIRED' });
  assert.equal(JSON.parse(readFileSync(log.healthPath)).status, 'restart_required');
  assert.match(readFileSync(log.path, 'utf8'), /authentication_unavailable/);
});

test('network failure is classified, recovered and not retried as a model or audio action', async () => {
  let broken = true;
  const poller = new RecoveringPoller({ log: new RuntimeLog(temp()), connect: async () => ({ mina: { getConversations: async () => {
    if (broken) throw Object.assign(new Error('private content'), { code: 'ENOTFOUND' });
    return { records: [{ time: 1 }] };
  } }, miot: {} }) });
  await poller.poll(); broken = false;
  assert.equal((await poller.poll()).data.records[0].time, 1);
  assert.equal(failureKind({ cause: { code: 'ECONNRESET' } }), 'network');
  assert.equal(failureKind({ name: 'TimeoutError' }), 'timeout');
  assert.equal(failureKind({ status: 402 }), 'http_402');
});

test('runtime files are private, rotated, redacted, and health detects stale polling', () => {
  let now = Date.now(); const directory = temp();
  const log = new RuntimeLog(directory, { now: () => now, maxBytes: 150, backups: 2, secrets: ['private-password'] });
  for (let i = 0; i < 8; i++) log.event('test', { message: 'private-password https://example.test/token' });
  const files = readdirSync(directory);
  assert.equal(files.length, 3);
  for (const file of files) { const path = join(directory, file); assert.equal(statSync(path).mode & 0o777, 0o600); assert.doesNotMatch(readFileSync(path, 'utf8'), /private-password|example.test/); }
  log.update({ status: 'running', lastPollAt: log.time() }, true);
  assert.equal(readHealth(directory, now).healthy, true);
  now += 91000;
  assert.equal(readHealth(directory, now).healthy, false);
});

test('diagnostic commands cannot overwrite running service health', () => {
  const log = new RuntimeLog(temp()); log.update({ status: 'running' }, true);
  const before = readFileSync(log.healthPath, 'utf8');
  log.healthEnabled = false; log.update({ status: 'failed' }, true);
  assert.equal(readFileSync(log.healthPath, 'utf8'), before);
});
