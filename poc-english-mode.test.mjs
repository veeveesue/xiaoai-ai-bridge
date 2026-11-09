import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useNativeEnglish, replyLanguagePolicy, englishPlaybackPlan, InternalCommands } from './poc-english-mode.mjs';
test('experimental English mode translates the assistant reply, not the user question', () => {
  const question = 'I want to go to work today';
  const reply = '好的，祝你今天工作顺利，你今天有什么安排？';
  const plan = englishPlaybackPlan(question, reply, 'native-translation');
  assert.equal(plan.kind, 'native-translation');
  assert.equal(plan.silent, true, 'suppress the Chinese preamble while keeping native English audio');
  assert.ok(plan.command.startsWith('好的，祝你今天工作顺利'));
  assert.ok(!plan.command.includes(question));
  assert.match(replyLanguagePolicy(question, 'native-translation'), /不要翻译或复述用户原句/);
  assert.equal(englishPlaybackPlan(question, 'Have a nice day!', 'direct').kind, 'text');
});
test('Chinese and explicit translation requests do not enter experimental English mode', () => {
  for (const text of ['今天想去上班', 'HOW ARE YOU TODAY什么意思', 'Translate hello into Chinese', 'What does hello mean?']) assert.equal(useNativeEnglish(text, 'native-translation'), false, text);
  assert.equal(useNativeEnglish('Hello there', 'native-translation'), true);
  assert.throws(() => englishPlaybackPlan('Hello there', 'Hello again', 'native-translation'));
});
test('internal translation echoes are skipped once, with timestamp and expiry bounds', () => {
  const commands = new InternalCommands();
  const command = '祝你工作顺利。这句话用英文怎么说';
  commands.expect(command, 10000);
  assert.equal(commands.consume({ query: command, time: 5000 }, 10001), false);
  assert.equal(commands.consume({ query: command, time: 11000 }, 11001), true);
  assert.equal(commands.consume({ query: command, time: 11000 }, 11002), false);
  commands.expect(command, 20000);
  assert.equal(commands.consume({ query: command, time: 20000 }, 60000), false);
});
