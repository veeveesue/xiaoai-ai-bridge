import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

function readObject(path) {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error();
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error(`配置文件格式无效：${path}`);
  }
}
export function loadSettings(env = process.env, home = homedir()) {
  const configDir = resolve(env.POC_CONFIG_DIR || join(home, '.config', 'xiaoai-poc'));
  const dataDir = resolve(env.POC_DATA_DIR || join(home, '.local', 'share', 'xiaoai-poc'));
  const model = readObject(join(configDir, 'model.json'));
  const speaker = readObject(join(configDir, 'speaker.json'));
  const actions = { tts: [5, 3], wake: [5, 1], execute: [5, 4], ...(speaker.actions || {}) };
  for (const [name, pair] of Object.entries(actions)) {
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(value => Number.isSafeInteger(value) && value > 0)) throw new Error(`音箱动作 ${name} 应为两个正整数`);
  }
  const englishReplyMode = env.POC_ENGLISH_MODE || model.englishReplyMode || 'direct';
  if (!['direct', 'native-translation'].includes(englishReplyMode)) throw new Error('英语回复模式只能是 direct 或 native-translation');
  return {
    configDir, dataDir, cacheDir: join(dataDir, 'device-cache'), actions,
    speaker: {
      did: env.POC_MI_DID || speaker.did || '',
      userId: env.POC_MI_USER_ID || speaker.userId,
      password: env.POC_MI_PASSWORD || speaker.password,
      passToken: env.POC_MI_PASS_TOKEN || speaker.passToken,
      debug: false, timeout: 10000,
    },
    model: {
      baseURL: env.POC_API_BASE || model.baseURL || 'https://api.deepseek.com',
      apiKey: env.POC_API_KEY || model.apiKey,
      model: env.POC_MODEL || model.model,
    },
    englishReplyMode,
    continuousTrial: env.POC_CONTINUOUS === '1' || (env.POC_CONTINUOUS !== '0' && model.continuousTrial === true),
  };
}
