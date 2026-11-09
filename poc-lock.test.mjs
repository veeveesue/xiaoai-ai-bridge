import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireServiceLock } from './poc-lock.mjs';
test('a second instance is refused and a released lock can be acquired', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'xiaoai-lock-')), 'service.pid');
  const release = acquireServiceLock(path);
  assert.throws(() => acquireServiceLock(path), /拒绝重复启动/);
  release(); acquireServiceLock(path)();
});
