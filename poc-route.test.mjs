import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldUseNative, createTurnRouter, claimsReminderExecution } from './poc-route.mjs';
import { capabilities, capabilityPrompt, capabilityMarkdown, isCapabilityQuestion, findNativeCapability } from './poc-capabilities.mjs';

test('native media requests bypass AI, including the reported failures', () => {
  for (const query of ['你能播放音乐吗', '你能播放周杰伦的歌吗', '播放周杰伦的歌', '播放安静', '我想听晴天', '下一首', '暂停播放', '继续播放', '安静', '闭嘴', '声音小一点', '音量调到20', '调大音量']) {
    assert.equal(shouldUseNative(query), true, query);
  }
});
test('reminders route to native, explanations and explicit AI stay on AI', () => {
  for (const query of ['晚上八点提醒我喝水', '一分钟后提醒我关火', '三十秒后叫我一下', '明早七点叫我', '设置明早七点的闹钟', '取消闹钟', '倒计时十分钟']) {
    assert.equal(findNativeCapability(query)?.id, 'reminder', query);
  }
  for (const query of ['如何设置闹钟', '帮我写一个提醒我的程序', '问AI八点提醒我喝水']) {
    assert.equal(shouldUseNative(query), false, query);
  }
});
test('capability descriptions, prompt and routing share a registry', () => {
  assert.equal(new Set(capabilities.map(item => item.id)).size, capabilities.length);
  for (const item of capabilities) {
    assert.ok(capabilityPrompt().includes(item.name));
    assert.ok(capabilityMarkdown().includes(item.status));
  }
  assert.equal(isCapabilityQuestion('你有什么功能'), true);
  assert.equal(shouldUseNative('你有哪些功能，比如播放音乐和提醒我'), false);
  assert.match(capabilityPrompt(), /没有任何工具调用接口/);
  assert.match(capabilityPrompt(), /尚未到点验收/);
});
test('conversation and explicit AI requests remain on AI', () => {
  for (const query of ['我的暗号是什么', '记住暗号是红色苹果', '介绍一下周杰伦', '为什么播放音乐能放松心情', '如何播放本地音乐', '分析一下安静的歌词', '我喜欢安静的环境', '问AI你能播放音乐吗']) {
    assert.equal(shouldUseNative(query), false, query);
  }
});
test('live weather uses the native service while explanations stay on AI', () => {
  for (const query of ['天气怎么样', '明天天气怎么样', '上海今天天气如何', '今天温度多少', '现在空气质量怎么样', '明天会下雨吗', '周末要带伞吗']) {
    assert.equal(shouldUseNative(query), true, query);
  }
  for (const query of ['为什么天气会变冷', '解释天气预报的原理', '问AI明天天气怎么样', '空调温度怎么设置', '烘焙温度多少合适']) {
    assert.equal(shouldUseNative(query), false, query);
  }
});
test('acknowledgements follow the native interaction without creating AI promises', () => {
  const router = createTurnRouter();
  assert.equal(router.route('三十秒后叫我一下', 0).owner, 'native');
  assert.equal(router.route('我知道了', 31000).capability, 'acknowledgement');
  assert.equal(router.route('帮我草拟减脂计划', 32000).owner, 'ai');
  assert.equal(router.route('好的', 33000).owner, 'ai');
  assert.equal(router.route('播放音乐', 34000).owner, 'native');
  assert.equal(router.route('问AI我知道了', 35000).owner, 'ai');
  assert.equal(createTurnRouter().route('我知道了', 0).owner, 'native');
  assert.equal(shouldUseNative('取消提醒'), true);
  assert.equal(claimsReminderExecution('好的，那三十秒后我会提醒你'), true);
  assert.equal(claimsReminderExecution('已经设置好提醒了'), true);
  assert.equal(claimsReminderExecution('请对原生小爱说：提醒我喝水'), false);
  assert.equal(claimsReminderExecution('好的，已为你设定三十秒的提醒'), true);
  assert.equal(claimsReminderExecution('提醒已设置'), true);
});
test('realistic conversational negatives and native follow-ups', () => {
  for (const text of ['来首诗', '我想听你的建议', '今天天气不好，我心情低落']) assert.equal(shouldUseNative(text), false, text);
  const router = createTurnRouter();
  assert.equal(router.route('解释一下光合作用', 0).owner, 'ai');
  assert.equal(router.route('继续', 1000).owner, 'ai');
  assert.equal(router.route('播放音乐', 2000).owner, 'native');
  assert.equal(router.route('继续', 3000).owner, 'native');
  assert.equal(router.route('三十秒后提醒我', 4000).capability, 'reminder');
  assert.equal(router.route('我知道了', 5000).owner, 'native');
  assert.equal(router.route('那改成一分钟后', 6000).capability, 'reminder');
  assert.equal(router.route('取消吧', 7000).capability, 'reminder');
});
test('explicit household commands pass through without AI denying execution', () => {
  assert.equal(findNativeCapability('关闭吸顶灯')?.id, 'home');
  assert.equal(findNativeCapability('帮我打开客厅灯')?.id, 'home');
  assert.equal(shouldUseNative('怎么关闭吸顶灯'), false);
  assert.equal(shouldUseNative('介绍一下智能灯的原理'), false);
});
