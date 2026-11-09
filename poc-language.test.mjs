import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nativeAudioAction } from './poc-language.mjs';
import { createTurnRouter } from './poc-route.mjs';
import { englishPlaybackPlan, replyLanguagePolicy } from './poc-english-mode.mjs';
test('English conversation stays on AI; direct mode never injects a native weather query', () => {
  const router = createTurnRouter();
  for (const q of ["WHAT'S THE WEATHER TODAY", 'How are you?', 'Can you speak English?']) assert.equal(router.route(q).owner, 'ai', q);
  const plan = englishPlaybackPlan("WHAT'S THE WEATHER TODAY", 'I cannot check live weather.', 'direct');
  assert.deepEqual(plan, { kind: 'text', text: 'I cannot check live weather.' });
  assert.match(replyLanguagePolicy('Hello', 'direct'), /只有用户明确要求翻译时才翻译/);
});
test('explicit translation already handled by native must not get a second AI answer', () => {
  const record = { answers: [
    { type: 'TTS', tts: { text: 'HOW ARE YOU TODAY的普通话是' } },
    { type: 'UNKNOWN', unknown: { header: 'AudioPlayer.Play' } },
  ] };
  const router = createTurnRouter();
  assert.equal(router.route('HOW ARE YOU TODAY怎么翻译', 0, record).capability, 'translation');
  assert.equal(router.route('HOW ARE YOU TODAY', 1, record).owner, 'ai');
  assert.equal(router.route('问AI HOW ARE YOU TODAY怎么翻译', 2, record).owner, 'ai');
  assert.equal(router.route('口尼奇瓦是什么意思', 3, { answers: [{ tts: { text: '被难住了' } }] }).owner, 'ai');
  const chineseToEnglish = { answers: [
    { type: 'TTS', tts: { text: '如果我想跟别人说你今天看起来很漂亮的英语是' } },
    { type: 'UNKNOWN', unknown: { header: 'AudioPlayer.Play' } },
  ] };
  assert.equal(router.route('如果我想跟别人说你今天看起来很漂亮怎么说', 4, chineseToEnglish).capability, 'translation');
  assert.equal(router.route('你今天很漂亮用英语怎么说', 5, chineseToEnglish).capability, 'translation');
  assert.equal(router.route('这个观点怎么说更委婉', 6, { answers: [{ tts: { text: '暂时回答不上' } }] }).owner, 'ai');
  assert.equal(router.route('这个观点怎么说更委婉', 7, { answers: [{ type: 'AUDIO' }] }).owner, 'ai');
});
test('translation AudioPlayer actions are identified even when type is UNKNOWN', () => {
  assert.equal(nativeAudioAction({ answers: [{ type: 'UNKNOWN', unknown: { header: 'AudioPlayer.Play' } }] }), true);
  assert.equal(nativeAudioAction({ answers: [{ type: 'TTS', tts: { text: '你好' } }] }), false);
});
