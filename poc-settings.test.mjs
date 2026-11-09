import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSettings } from './poc-settings.mjs';
test('configuration is independent of checkout location and environment overrides private files', () => {
  const home = mkdtempSync(join(tmpdir(), 'xiaoai-config-'));
  const dir = join(home, 'private'); mkdirSync(dir);
  writeFileSync(join(dir, 'model.json'), JSON.stringify({ apiKey: 'file-secret', model: 'file-model', englishReplyMode: 'native-translation', continuousTrial: true }));
  writeFileSync(join(dir, 'speaker.json'), JSON.stringify({ did: 'test-device', userId: 'test-user', actions: { tts: [7, 3] } }));
  const s = loadSettings({ POC_CONFIG_DIR: dir, POC_DATA_DIR: join(home, 'data'), POC_API_KEY: 'env-secret', POC_CONTINUOUS: '0' }, home);
  assert.equal(s.model.apiKey, 'env-secret'); assert.equal(s.model.model, 'file-model');
  assert.equal(s.speaker.did, 'test-device'); assert.deepEqual(s.actions.tts, [7, 3]);
  assert.equal(s.continuousTrial, false); assert.equal(s.cacheDir, join(home, 'data/device-cache'));
});
test('missing config has no real account defaults, and invalid actions fail clearly', () => {
  const home = mkdtempSync(join(tmpdir(), 'xiaoai-empty-'));
  assert.equal(loadSettings({}, home).speaker.did, '');
  writeFileSync(join(home, 'speaker.json'), JSON.stringify({ actions: { wake: [0, 1] } }));
  assert.throws(() => loadSettings({ POC_CONFIG_DIR: home }, home), /音箱动作/);
});
