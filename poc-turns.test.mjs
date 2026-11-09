import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TurnCoordinator, commitAcceptedReply } from './poc-turns.mjs';
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };

test('native command is handled without waiting for the old AI; stale reply cannot play', async () => {
  const turns = new TurnCoordinator();
  const model = deferred();
  const effects = [];
  const old = turns.submit(async turn => { await model.promise; if (turn.current()) effects.push('old audio'); });
  await Promise.resolve();
  await turns.submit(async () => effects.push('native music'));
  model.resolve(); await old;
  assert.deepEqual(effects, ['native music']);
});
test('unplayed cancelled replies do not enter the history; accepted current ones do', () => {
  const history = [];
  assert.equal(commitAcceptedReply(history, { current: () => false }, '旧问题', '未播出的回答'), false);
  assert.deepEqual(history, []);
  assert.equal(commitAcceptedReply(history, { current: () => true }, '新问题', '已接受播报的回答'), true);
  assert.equal(history.length, 2);
  assert.equal(history[1].content, '已接受播报的回答');
});
test('shutdown aborts in-flight requests and forbids late speech', async () => {
  const turns = new TurnCoordinator(); const model = deferred(); let speech = false; let signal;
  const old = turns.submit(async turn => { signal = turn.signal; await model.promise; if (turn.current()) speech = true; });
  await Promise.resolve(); turns.stop(); model.resolve(); await old;
  assert.equal(signal.aborted, true); assert.equal(speech, false);
});
