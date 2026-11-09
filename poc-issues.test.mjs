import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IssueStore, looksUnsupported, nativeText, tryRecordIssue } from './poc-issues.mjs';

test('unsupported responses are candidates; ordinary successful advice is not', () => {
  assert.equal(looksUnsupported('抱歉，我没法帮你做减脂计划'), true);
  assert.equal(looksUnsupported('我这边无法查询实时天气'), true);
  assert.equal(looksUnsupported('可以，我们先了解你的运动习惯'), false);
  assert.equal(looksUnsupported('减脂不能只靠节食'), false);
  assert.equal(nativeText({ answers: [{ tts: { text: '暂时回答不上' } }] }), '暂时回答不上');
});
test('a failed write is reported as failure, never success', () => {
  const broken = { add() { throw new Error('disk full'); } };
  assert.equal(tryRecordIssue(broken, { question: '记录刚才的问题' }), false);
});
test('issues persist, deduplicate, redact keys and produce a private readable todo', () => {
  const directory = mkdtempSync(join(tmpdir(), 'xiaoai-issues-'));
  const store = new IssueStore(directory);
  store.add({ category: '能力待补', question: '帮我做减脂计划？', aiAnswer: '我没法帮你' });
  store.add({ category: '能力待补', question: '帮我做减脂计划', detail: 'sk-' + '1'.repeat(20) });
  const restored = new IssueStore(directory);
  assert.equal(restored.items.length, 1);
  assert.equal(restored.items[0].count, 2);
  assert.match(restored.items[0].detail, /密钥已隐藏/);
  assert.match(readFileSync(join(directory, 'TODO.md'), 'utf8'), /2次/);
  assert.equal(statSync(join(directory, 'issues.json')).mode & 0o777, 0o600);
});
