// One definition drives routing, model context and the generated human table.
import { nativeTranslationHandled } from './poc-language.mjs';
const explanation = /为什么|原理|区别|评价|介绍|如何|怎么/;
const weatherExplanation = /为什么|原理|形成|解释|科普|气候变化|全球变暖/;
export const forceAI = text => /^(?:问一下AI|问AI|请AI|让AI|AI助手)/i.test(text.trim());
export const isCapabilityQuestion = text => /(?:你|小爱|助手).*(?:有什么功能|有哪些功能|能做什么|会做什么|支持哪些功能|能干什么)/.test(text);
export const capabilities = [
  { id: 'translation', name: '明确要求的翻译', owner: 'native', status: '原生已返回翻译音频时交原生；否则由AI回答', example: 'How are you today怎么翻译', detail: '只在用户明确要求翻译且原生确认进入翻译播放时接管，不把英文日常对话自动视为翻译。', contextMatches: nativeTranslationHandled },
  { id: 'music', name: '音乐播放', owner: 'native', status: '用户已确认原生可播放；曲库由小米服务决定', example: '播放周杰伦的歌', detail: '交给原生小爱，AI不能声称自己没有音乐功能从而阻止原生播放。',
    matches: q => !explanation.test(q) && !/来(?:一)?首诗|写(?:一)?首|建议|意见|看法|心情|计划/.test(q) && /播放|放一首|放首|来一首|来首|我想听|我要听|听一首|听首/.test(q) },
  { id: 'media', name: '暂停、切歌、音量、安静', owner: 'native', status: '已分流；各操作需逐项实测', example: '下一首／声音小一点／安静', detail: '原生设备控制，AI没有执行这些操作的工具。',
    matches: q => /^(?:安静|闭嘴|别说了|不要说了|停|停止|暂停|继续播放|恢复播放|停止播放|暂停播放|别放了|不要放了|上一首|下一首|切歌|换一首|单曲循环|随机播放|顺序播放|循环播放)(?:吧|一下)?$/.test(q) || (!explanation.test(q) && /(?:音量|声音).*(?:大一点|小一点|调大|调小|调到|调成|提高|降低|最大|最小|百分之|\d)|(?:调大|调小|提高|降低).*(?:音量|声音)/.test(q)) },
  { id: 'weather', name: '实时天气', owner: 'native', status: '中文天气交原生；英文对话交AI，不触发额外天气查询', example: '明天上海天气怎么样', detail: 'AI尚未接天气工具，不得编造预报。回答语言遵守当前模式；无实时工具时如实说明，不额外触发原生天气查询。',
    matches: q => !weatherExplanation.test(q) && !/心情|低落|难过|比喻|隐喻/.test(q) && ((/天气|气温|温度|空气质量|紫外线|湿度/.test(q) && !/空调|冰箱|烤箱|烘焙|烹饪|发烧|体温|水温/.test(q)) || /(?:今天|明天|后天|今晚|现在|周末|这周|下周|最近|一会儿|待会儿).*(?:下雨|下雪|降温|刮风|冷不冷|热不热|带伞|穿什么)|^(?:外面|出门).*(?:冷吗|冷不冷|热吗|热不热|下雨|带伞)/.test(q)) },
  { id: 'reminder', name: '闹钟、倒计时、定时提醒', owner: 'native', status: '已加分流，尚未到点验收', example: '一分钟后提醒我喝水', detail: '由原生尝试创建，以原生确认和实际响铃为准；AI没有创建或查询提醒的工具，不能声称已设置。',
    matches: q => !explanation.test(q) && !/解释|科普|写.*(?:代码|程序)|设计.*(?:系统|软件)/.test(q) && /提醒我|叫醒我|闹钟|倒计时|计时器|(?:取消|关闭|停止|关掉|不用)提醒|(?:秒|分钟|小时|点|明早|明天|今晚|每天).*叫我/.test(q) },
  { id: 'acknowledgement', name: '原生操作后的简短确认', owner: 'native', status: '原生操作后三分钟内的简短确认交还原生；无AI上下文时也不让AI插话', example: '我知道了／收到／我醒了', detail: '根据上一轮负责方分流；不会把对原生提醒的确认送给AI重新承诺任务。' },
  { id: 'chat', name: '聊天、知识解释、计划草拟', owner: 'ai', status: '已接入DeepSeek', example: '帮我草拟减脂计划', detail: '能讨论、计算和草拟文本；缺少信息时追问，不把普通文本任务误称为设备不支持。' },
  { id: 'context', name: '近期多轮上下文', owner: 'ai', status: '暗号问答已实测；最近六轮，重启清空', example: '我刚说的暗号是什么', detail: '尚无长期记忆，暗号只是记忆测试，不是身份认证。' },
  { id: 'issues', name: '问题待办记录与查看', owner: 'local', status: '已实现自动候选记录和语音补记', example: '记录刚才的问题／问题待办有哪些', detail: '本机程序持久化，自动候选需要复核。' },
  { id: 'broadcast', name: '主动播报', owner: 'local', status: '电脑触发播报已实测', example: '由电脑程序发送文本播报', detail: '模型尚无主动播报或创建智能定时任务的工具。' },
  { id: 'continuous', name: '中英文AI连续接话试验', owner: 'local', status: '主动唤醒已实测；播完时机仅保守估算，整链路待验收', example: '先唤醒一次，回答后等提示再直接说', detail: '可关闭的试验模式，中英文AI回答后可接续，最多自动唤醒三次；音乐天气等原生命令不自动接续。不是实时全双工，也不保证准确检测播放结束。' },
  { id: 'web', name: 'AI联网及实时查询', owner: 'unavailable', status: '未接工具', example: '让AI搜索实时新闻', detail: '不能假装已联网或查询了实时天气、行情。' },
  { id: 'memory', name: '跨重启长期记忆', owner: 'unavailable', status: '尚未实现', example: '下周仍记得所有聊天', detail: '问题待办持久化不等于对话长期记忆。' },
  { id: 'home', name: '明确的家电开关命令', owner: 'native', status: '已加分流；设备绑定和执行结果待核实', example: '关闭吸顶灯', detail: '原生是否支持取决于绑定设备；AI无执行工具，不得声称已开关设备。',
    matches: q => !explanation.test(q) && /^(?:请|帮我|麻烦|能不能|可以)?(?:打开|关闭|关掉|开启|关上|关一下|开一下).*(?:灯|空调|窗帘|插座|风扇|电视|净化器|加湿器|扫地机|热水器)/.test(q) },
];
const owners = { native: '原生小爱', ai: 'AI大模型', local: '本机程序', unavailable: '尚未接入或核实' };
export function findNativeCapability(text, record) {
  const q = text.trim().replace(/[，。！？、,.!?\s]/g, '');
  if (forceAI(q) || isCapabilityQuestion(q)) return undefined;
  return capabilities.find(item => item.owner === 'native' && (item.matches?.(q) || item.contextMatches?.(text, record)));
}
export function capabilityPrompt() {
  return '你是小爱音箱上接入的AI助手，整套系统由原生小爱、AI和本机程序协作。下面是实际能力表。你没有任何工具调用接口；不能声称已完成播放、提醒、联网或设备控制。原生功能请让用户直接对小爱下达指令。问AI前缀只提供解释，不会增加执行能力。不得虚构操作成功，不得把暗号当身份认证。\n' + capabilities.map(item => `${item.name}｜${owners[item.owner]}｜${item.status}｜${item.detail}`).join('\n');
}
export function spokenCapabilities() {
  const available = owner => capabilities.filter(item => item.owner === owner).map(item => item.name).join('、');
  return `这套助手由原生小爱、AI和本机程序协作。原生负责${available('native')}，提醒还没完成到点验收。AI负责${available('ai')}。本机支持${available('local')}。AI目前没有联网工具和跨重启长期记忆。`;
}
export function capabilityMarkdown() {
  return '# 小爱 POC 功能表\n\n由 poc-capabilities.mjs 生成；AI提示词和分流共用此定义。\n\n| 功能 | 负责方 | 状态 | 示例 |\n|---|---|---|---|\n' + capabilities.map(item => `| ${item.name} | ${owners[item.owner]} | ${item.status} | ${item.example} |`).join('\n') + '\n\n“问AI”强制走解释，不会增加工具。混合或模糊请求仍需通过问题待办迭代。\n';
}
