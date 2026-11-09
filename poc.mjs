// Independent POC; does not load the old market-query hook or print credentials.
import { mkdirSync } from 'node:fs';
import { RuntimeLog, RecoveringPoller, readHealth, failureKind } from './poc-runtime.mjs';
import { loadSettings } from './poc-settings.mjs';
import { createTurnRouter, claimsReminderExecution } from './poc-route.mjs';
import { IssueStore, looksUnsupported, nativeText, tryRecordIssue } from './poc-issues.mjs';
import { capabilityPrompt, isCapabilityQuestion, spokenCapabilities } from './poc-capabilities.mjs';
import { TurnCoordinator, commitAcceptedReply } from './poc-turns.mjs';
import { acquireServiceLock } from './poc-lock.mjs';
import { nativeAudioAction } from './poc-language.mjs';
import { replyLanguagePolicy, englishPlaybackPlan, InternalCommands } from './poc-english-mode.mjs';
import { ContinuousTrial } from './poc-continuous.mjs';
import { pauseNativeMedia } from './poc-media.mjs';

const settings = loadSettings();
const modelSettings = settings.model;
mkdirSync(settings.cacheDir, { recursive: true, mode: 0o700 });
process.chdir(settings.cacheDir);
const stdout = console.log.bind(console);
if (process.argv.includes('--status')) {
  try { const health = readHealth(settings.dataDir); stdout(JSON.stringify(health, null, 2)); process.exit(health.healthy ? 0 : 1); }
  catch { stdout('未找到可用健康状态，请检查服务是否启动。'); process.exit(1); }
}
const serviceMode = !process.argv.some(arg => ['--help', '--check-config', '--check-model', '--say', '--status'].includes(arg));
const runtime = new RuntimeLog(settings.dataDir, { secrets: [settings.model.apiKey, settings.speaker.password, settings.speaker.passToken, settings.speaker.userId, settings.speaker.did], stdout: message => { if (!serviceMode || process.stdout.isTTY || process.env.POC_LOG_STDOUT === '1') stdout(message); } });
runtime.healthEnabled = false;
const output = message => runtime.message(message);
// The legacy library can print authentication URLs. Keep its logs private.
console.log = console.warn = console.error = console.debug = () => {};
const { getMiNA, getMIoT } = await import('@mi-gpt/miot');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const echo = process.argv.includes('--echo');
const history = [];
const englishReplyMode = settings.englishReplyMode;
const internalCommands = new InternalCommands();
const continuous = new ContinuousTrial(settings.continuousTrial);
const turnRouter = createTurnRouter();
const turns = new TurnCoordinator();
const pendingReplacements = new Set();
const issues = new IssueStore(settings.dataDir);
let lastTurn;
function recordIssue(category, turn, detail, source = 'automatic') {
  const saved = tryRecordIssue(issues, { category, ...turn, detail, source });
  output(saved ? '已记入问题待办：' + category : '问题待办保存失败，请检查本地文件权限。');
  return saved;
}
let running = true;
let miotClient;
let minaClient;
// MiGPT's unWakeUp uses this text to replace speech without audible words.
// Validated separately on this L05C; media stop returned success without stopping TTS.
const silentReplacement = '¿ʞо ∩оʎ ǝɹɐ';
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { running = false; turns.stop(); });

async function speak(text) {
  if (!miotClient) miotClient = await getMIoT({ ...settings.speaker, debug: false, timeout: 10000 });
  if (!miotClient) throw new Error('米家播报服务认证失败');
  if (!await miotClient.doAction(...settings.actions.tts, [text.slice(0, 500)])) throw new Error('设备未接受播报指令');
}

async function ask(text, turn) {
  try {
  const { baseURL: base, apiKey: key, model } = modelSettings;
  if (!key || !model) throw new Error('请配置 POC_API_KEY 和 POC_MODEL');
  const messages = [
    { role: 'system', content: replyLanguagePolicy(text, englishReplyMode) + '\n' + capabilityPrompt() + (continuous.enabled ? '\n当前是连续对话试验：回复尽量短，中文25字以内，最多一句，适当接一个简短问题。' : '') },
    ...history,
    { role: 'user', content: text },
  ];
  const response = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: 300 }),
    signal: turn ? AbortSignal.any([turn.signal, AbortSignal.timeout(25000)]) : AbortSignal.timeout(25000),
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(`模型接口 HTTP ${response.status}`), { status: response.status });
  let answer = data.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error('模型未返回文本');
  if (turn && !turn.current()) throw new DOMException('Superseded', 'AbortError');
  if (claimsReminderExecution(answer)) {
    recordIssue('AI虚假执行承诺', { question: text, aiAnswer: answer }, '模型无提醒执行工具，却承诺创建或触发提醒；已拦截原回答。');
    answer = '提醒需要由原生小爱设置，以它的确认和实际响铃为准。我不能代替它承诺已经设置成功。';
  }
  runtime.event('model_response', { characters: answer.length });
  runtime.update({ lastModelAt: runtime.time() }, true);
  return answer;
  } catch (error) {
    if (error.name !== 'AbortError') {
      runtime.event('model_failed', { kind: failureKind(error) });
      runtime.update({ lastModelFailureAt: runtime.time(), lastModelFailureKind: failureKind(error) }, true);
    }
    throw error;
  }
}

async function handleRecord(record, receivedAt, pollMs, task) {
  if (!task.current()) return;
  const text = record.query?.trim();
  if (!text) return;
  runtime.event('question_received', { characters: text.length });
  runtime.update({ lastRecordAt: runtime.time() }, true);
  if (/^(?:结束(?:连续)?对话|停止连续对话|退出连续对话|stop conversation|end conversation|goodbye)[。.!！]?$/i.test(text)) {
    continuous.stop();
    await miotClient.doAction(...settings.actions.tts, [silentReplacement]);
    if (task.current()) await speak('连续对话已结束。');
    output('连续对话试验已关闭。');
    return;
  }
  if (/^(?:开始连续对话|start conversation)[。.!！]?$/i.test(text)) {
    continuous.start();
    await miotClient.doAction(...settings.actions.tts, [silentReplacement]);
    if (task.current()) await miotClient.doAction(...settings.actions.wake, []);
    output('连续对话试验已开启，主动进入聆听。');
    return;
  }
  continuous.onQuestion();
  if (/^(?:记录|记下|记一下)(?:刚才|上一个|这个)(?:的)?问题[。！]?$/u.test(text) || /^(?:刚才|上一个)(?:有冲突|打架了|回答不对)[。！]?$/u.test(text)) {
    const saved = lastTurn && recordIssue(/冲突|打架/.test(text) ? '用户确认冲突' : '用户反馈', lastTurn, text, 'user');
    if (task.current()) await speak(!lastTurn ? '还没有可以关联的上一轮问题。' : saved ? '已记下刚才的问题，后面一起检查。' : '没有保存成功，请稍后重试。');
    return;
  }
  if (/^(?:问题待办有哪些|查看问题待办|有哪些待办问题)[。？]?$/u.test(text)) {
    if (task.current()) await speak(issues.summary());
    return;
  }
  const turn = { question: text, nativeAnswer: nativeText(record), aiAnswer: '' };
  lastTurn = turn;
  const route = turnRouter.route(text, Date.now(), record);
  if (isCapabilityQuestion(text)) {
    await miotClient.doAction(...settings.actions.tts, [silentReplacement]);
    turn.aiAnswer = spokenCapabilities();
    if (task.current()) await speak(turn.aiAnswer);
    output('已根据功能表播报系统能力。');
    return;
  }
  if (route.owner === 'native') {
    output(`原生指令：${route.capability}，不发送模型或覆盖播报。`);
    if (pendingReplacements.size) recordIssue('疑似在途音频冲突', turn, '原生接管时旧占位请求仍在途；模型已取消，但已发往小米的音频指令无法撤回。');
    if (looksUnsupported(turn.nativeAnswer)) recordIssue('原生能力或分流待查', turn, '原生返回不支持，可能应交给AI；需复核。');
    if (route.capability === 'media' && /安静|闭嘴|别说|不要说|停|别放|不要放/.test(text)) {
      const accepted = await pauseNativeMedia(minaClient, task.current);
      output('用户要求安静，媒体暂停：' + (accepted ? '接口接受' : '未确认'));
      if (!accepted && task.current()) recordIssue('媒体暂停失败', turn, '用户要求安静，但MiNA暂停和停止均未确认。');
    }
    return;
  }
  output(`时序：查询${pollMs}ms；收到时距记录时间${receivedAt - record.time}ms（记录时间不等于说话结束时间）。`);
  try {
    const hasAudio = nativeAudioAction(record);
    let mediaHaltConfirmed = !hasAudio;
    if (record.answers?.some(a => a.type === 'AUDIO')) recordIssue('原生误触发媒体候选', turn, '本轮应由AI对话，但原生返回了音频播放动作；将尝试MiNA媒体暂停，需结合听音复核。');
    // Replace native speech immediately. Media stop is ineffective for
    // L05C TTS despite returning success. Generate AI text in parallel.
    const stopStarted = performance.now();
    const stopTask = (async () => {
      if (hasAudio) {
        mediaHaltConfirmed = await pauseNativeMedia(minaClient, task.current);
        output(`原生音频暂停：${mediaHaltConfirmed ? '接口接受' : '未确认'}。`);
      }
      if (!task.current()) return false;
      return miotClient.doAction(...settings.actions.tts, [silentReplacement]);
    })().catch(() => false).then(stopped => {
      output(`占位覆盖：${stopped ? '接口接受' : '未确认'}，耗时${Math.round(performance.now() - stopStarted)}ms。`);
      if (!stopped) recordIssue('打断失败', turn, '占位覆盖接口未确认，可能发生双重回复。');
      return stopped;
    });
    pendingReplacements.add(stopTask);
    void stopTask.finally(() => pendingReplacements.delete(stopTask));
    const aiStarted = performance.now();
    const answer = echo ? '我听到你说：' + text : await ask(text, task);
    if (!task.current()) return;
    turn.aiAnswer = answer;
    if (!echo && looksUnsupported(answer)) recordIssue('能力或工具待补', turn, 'AI明确表示不支持或无法完成；候选问题，需人工复核。');
    if (!echo && turn.nativeAnswer && !looksUnsupported(turn.nativeAnswer) && looksUnsupported(answer)) recordIssue('疑似原生与AI冲突', turn, '原生有回复而AI表示无法完成，需核对是否重复处理。');
    await stopTask;
    output(`AI回答已生成，用时${Math.round(performance.now() - aiStarted)}ms，正在播报。`);
    if (!task.current()) return;
    if (hasAudio) {
      mediaHaltConfirmed = await pauseNativeMedia(minaClient, task.current);
      if (!task.current()) return;
      if (!mediaHaltConfirmed) {
        recordIssue('媒体暂停失败', turn, '原生音频无法确认暂停，本轮不追加AI播报或自动唤醒，避免叠加声音。');
        output('媒体暂停未确认，本轮AI不播报。');
        return;
      }
    }
    const playback = englishPlaybackPlan(text, answer, echo ? 'direct' : englishReplyMode);
    if (playback.kind === 'native-translation') {
      internalCommands.expect(playback.command);
      if (!await miotClient.doAction(...settings.actions.execute, [playback.command, playback.silent])) throw new Error('设备未接受英语练习翻译播报');
      output('英语练习：已将AI的中文回复交原生静默翻译，仅播英文。');
    } else await speak(answer);
    if (!echo) commitAcceptedReply(history, task, text, answer);
    runtime.event('playback_accepted', { kind: playback.kind, characters: answer.length });
    runtime.update({ lastPlaybackAcceptedAt: runtime.time() }, true);
    if (!echo && continuous.enabled) {
      output('连续对话试验：按保守估时等待播报，然后主动唤醒；不是可靠的播放完成事件。');
      const result = await continuous.afterReply(answer, task, () => miotClient.doAction(...settings.actions.wake, []), playback.kind);
      output('连续对话试验：' + JSON.stringify(result));
      if (result.result === 'wake-failed') recordIssue('连续对话唤醒失败', turn, '接口未确认主动唤醒，已停止本次连续试验。');
    }
  } catch (error) { if (task.current() && error.name !== 'AbortError') { runtime.event('turn_failed', { kind: failureKind(error) }); recordIssue('调用或播报失败', turn, error.message); } }
}

try {
  const sayIndex = process.argv.indexOf('--say');
  if (process.argv.includes('--help')) {
    output('npm start / npm run echo / npm run status / npm run check / npm run check:model / npm run say -- "播报内容"');
    output('配置目录：' + settings.configDir + '；数据目录：' + settings.dataDir);
    output('可用 POC_CONFIG_DIR、POC_DATA_DIR 指定位置；音箱参数在 speaker.json，模型参数在 model.json。');
  } else if (process.argv.includes('--check-config')) {
    const speakerConfigured = Boolean(settings.speaker.did && (settings.speaker.passToken || (settings.speaker.userId && settings.speaker.password)));
    const modelConfigured = Boolean(modelSettings.apiKey && modelSettings.model);
    output(JSON.stringify({ speakerConfigured, modelConfigured, englishReplyMode, continuousTrial: settings.continuousTrial, actions: settings.actions }));
    if (!speakerConfigured || !modelConfigured) process.exitCode = 1;
  } else if (process.argv.includes('--check-model')) {
    await ask('请只回复：AI连接成功。');
    output('模型连接成功。');
  } else if (sayIndex >= 0) {
    await speak(process.argv[sayIndex + 1] || '电脑主动播报测试成功。');
    output('播报指令已接受。');
  } else {
    if (!settings.speaker.did) throw new Error('请在本机 speaker.json 配置音箱 did，参考 speaker.example.json');
    const releaseLock = acquireServiceLock(`${issues.directory}/service.pid`);
    process.once('exit', releaseLock);
    runtime.healthEnabled = true;
    if (!echo && (!modelSettings.apiKey || !modelSettings.model)) {
      throw new Error('未配置普通模型 API；可先用 --echo 验证语音回声链路');
    }
    const poller = new RecoveringPoller({ log: runtime, connect: async () => {
      const mina = await getMiNA({ ...settings.speaker, debug: false, timeout: 10000 });
      const miot = mina && await getMIoT({ ...settings.speaker, debug: false, timeout: 10000 });
      return { mina, miot };
    } });
    runtime.update({ status: 'starting' }, true);
    runtime.event('service_start');
    // Skip historical conversations; process only speech after startup.
    let cursor = Date.now();
    output(echo ? '回声测试已启动：每次用“小爱同学”唤醒并提问。' : 'AI 对话已启动：每次用“小爱同学”唤醒并提问。');
    while (running) {
      const result = await poller.poll();
      if (!running) break;
      if (result.data) {
        const { data, clients, pollMs } = result;
        minaClient = clients.mina; miotClient = clients.miot;
        const receivedAt = Date.now();
        for (const record of [...data.records].sort((a, b) => a.time - b.time)) {
          if (!running || record.time <= cursor) continue;
          cursor = record.time;
          if (receivedAt - record.time > 60000) { runtime.event('stale_record_skipped'); continue; }
          if (internalCommands.consume(record)) {
            output('已跳过程序自发的翻译播报记录。');
            continue;
          }
          void turns.submit(task => handleRecord(record, receivedAt, pollMs, task)).catch(error => {
            if (error.name !== 'AbortError') {
              output('本轮处理失败：' + error.message);
              recordIssue('本轮处理失败', { question: record.query }, error.message);
            }
          });
        }
      }
      await delay(result.delayMs);
    }
    await turns.drain();
  }
} catch (error) {
  turns.stop();
  await turns.drain();
  runtime.event('service_failed', { kind: error.code === 'RESTART_REQUIRED' ? 'restart_required' : failureKind(error) });
  if (!serviceMode) output(error.message);
  runtime.update({ status: 'failed' }, true);
  process.exitCode = 1;
} finally {
  if (!process.argv.some(arg => ['--help', '--check-config', '--check-model', '--say'].includes(arg))) {
    runtime.event('service_stop');
    runtime.update({ status: process.exitCode ? 'failed' : 'stopped' }, true);
  }
}
