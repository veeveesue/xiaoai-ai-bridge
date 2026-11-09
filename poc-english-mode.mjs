export function useNativeEnglish(text, mode) {
  return mode === 'native-translation' && /[a-z]{2}/i.test(text) &&
    !/[\u3400-\u9fff]/u.test(text) && !/\btranslat(?:e|ion)\b|what does.+mean/i.test(text);
}
export function replyLanguagePolicy(text, mode) {
  if (useNativeEnglish(text, mode)) {
    return '英语练习试验模式：用户正在用英文与你对话。理解用户原意，生成你对用户的合适回复，但这一步只输出简短中文，不输出英文。不要翻译或复述用户原句，不输出翻译指令、引号、Markdown或小爱唤醒词。中文回复60字以内。之后程序会把你的回复交原生小爱翻译成英文并播报。';
  }
  return '自然简洁地交流。用户用英文提问时直接用英文对话，不要将其视为翻译请求，也不要附带中文回答。只有用户明确要求翻译时才翻译，并遵守其指定的目标语言。通常中文100字以内，英文80词以内，不使用Markdown。';
}
export function englishPlaybackPlan(question, answer, mode) {
  if (!useNativeEnglish(question, mode)) return { kind: 'text', text: answer };
  const text = answer.trim().replace(/[\r\n]+/g, ' ').replace(/[。！？!?]+$/, '');
  if (!/[\u3400-\u9fff]/u.test(text) || /[\u0000-\u0008]/u.test(text) || text.length > 150) {
    throw new Error('英语练习模式未生成可用的简短中文回复，未发送翻译指令');
  }
  return { kind: 'native-translation', command: `${text}。这句话用英文怎么说`, silent: true };
}

const normalize = text => text.normalize('NFKC').replace(/[\s，。！？、,.!?“”"'：:]/g, '').toLowerCase();
// Native text directives also appear as conversation records. Consume exactly
// one expected echo, so the program never treats its own playback as user speech.
export class InternalCommands {
  constructor() { this.expected = []; }
  expect(command, now = Date.now()) { this.expected.push({ text: normalize(command), start: now, expires: now + 30000 }); }
  consume(record, now = Date.now()) {
    this.expected = this.expected.filter(item => item.expires >= now);
    const i = this.expected.findIndex(item => item.text === normalize(record.query || '') && record.time >= item.start - 3000 && record.time <= item.expires);
    if (i < 0) return false;
    this.expected.splice(i, 1); return true;
  }
}
