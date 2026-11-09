import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pauseNativeMedia } from './poc-media.mjs';
import { createTurnRouter } from './poc-route.mjs';
test('a conversational song-title collision stays on AI and media is paused on the MiNA channel', async () => {
  const record = { answers: [{ type: 'AUDIO', audio: { audioInfoList: [{ title: '我要上班' }] } }] };
  const router = createTurnRouter();
  assert.equal(router.route('我要上班呢', 0, record).owner, 'ai');
  assert.equal(router.route('你怎么突然开始放歌了', 1, record).owner, 'ai');
  const calls = [];
  assert.equal(await pauseNativeMedia({ callUbus: async (...args) => { calls.push(args); return { code: 0 }; } }), true);
  assert.deepEqual(calls, [['mediaplayer', 'player_play_operation', { action: 'pause', media: 'app_ios' }]]);
});
test('failed pause falls back to stop; failure is not reported as success', async () => {
  const actions = [];
  const ok = await pauseNativeMedia({ callUbus: async (scope, method, message) => { actions.push(message.action); return { code: message.action === 'stop' ? 0 : -1 }; } });
  assert.equal(ok, true); assert.deepEqual(actions, ['pause', 'stop']);
  assert.equal(await pauseNativeMedia({ callUbus: async () => ({ code: -1 }) }), false);
  assert.equal(await pauseNativeMedia({ callUbus: async () => { throw new Error('must not run'); } }, () => false), false);
});
