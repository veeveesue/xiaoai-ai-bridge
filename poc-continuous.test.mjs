import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ContinuousTrial, estimatedReplyWait } from './poc-continuous.mjs';
const task = () => ({ current: () => true, signal: new AbortController().signal });
test('automatic listening is bounded to three accepted wakeups and can be stopped', async () => {
  const trial = new ContinuousTrial(true, async () => true); let wakes = 0;
  for (let i=0; i<6; i++) await trial.afterReply('你今天想做什么？', task(), async () => { wakes++; return true; });
  assert.equal(wakes, 3);
  trial.stop(); await trial.afterReply('你好', task(), async () => { wakes++; return true; });
  assert.equal(wakes, 3);
});
test('a newer question cancels an old scheduled wakeup', async () => {
  let current = true; let wakes = 0;
  const trial = new ContinuousTrial(true, async () => { current = false; return true; });
  const result = await trial.afterReply('你好', { ...task(), current: () => current }, async () => { wakes++; return true; });
  assert.equal(result.result, 'cancelled'); assert.equal(wakes, 0);
});
test('timing is explicitly an estimate and bounded; wake failure disables the trial', async () => {
  assert.equal(estimatedReplyWait('你好'), 6000);
  assert.equal(estimatedReplyWait('好'.repeat(300)), 25000);
  const trial = new ContinuousTrial(true, async () => true);
  assert.equal((await trial.afterReply('你好', task(), async () => false)).result, 'wake-failed');
  assert.equal(trial.enabled, false);
});
test('Chinese text replies also schedule an automatic wakeup', async () => {
  let delay; let wakes = 0;
  const trial = new ContinuousTrial(true, async ms => { delay = ms; return true; });
  const result = await trial.afterReply('清炖鸡用姜片葱段即可。', task(), async () => { wakes++; return true; }, 'text');
  assert.equal(result.result, 'wake-accepted');
  assert.equal(wakes, 1);
  assert.equal(delay, estimatedReplyWait('清炖鸡用姜片葱段即可。', 'text'));
  assert.ok(delay >= 4000 && delay <= 20000);
});
