import { findNativeCapability, forceAI } from './poc-capabilities.mjs';
export const shouldUseNative = text => Boolean(findNativeCapability(text));

export function createTurnRouter() {
  let previous;
  return {
    route(text, now = Date.now(), record) {
      const native = findNativeCapability(text, record);
      const short = text.trim().replace(/[\s，。！？,.!?]/g, '');
      const acknowledgement = /^(?:我知道了|知道了|知道啦|好的|好|收到|明白了|行|可以了|谢谢|我醒了|不用叫了)$/.test(short);
      const recentNative = previous?.owner === 'native' && now - previous.time <= 180000;
      let result;
      if (native) result = { owner: 'native', capability: native.id };
      else if (!forceAI(text) && recentNative && previous.topic === 'reminder' && /^(?:那|再|帮我|把它|把这个)?(?:改成|改为|换成|延后|推迟|提前|取消它|取消吧|取消|不要了|不用了)/.test(short)) {
        result = { owner: 'native', capability: 'reminder' };
      } else if (!forceAI(text) && /^继续(?:吧)?$/.test(short) && (!previous || recentNative)) {
        result = { owner: 'native', capability: 'media' };
      } else if (!forceAI(text) && acknowledgement && (!previous || recentNative)) {
        result = { owner: 'native', capability: 'acknowledgement' };
      } else result = { owner: 'ai' };
      previous = { ...result, topic: result.capability === 'acknowledgement' ? previous?.topic : result.capability, time: now };
      return result;
    },
  };
}

export function claimsReminderExecution(answer) {
  return /(?:我会|我将|我一定会|我来|我到时候会).{0,24}(?:提醒你|叫你|叫醒你)|(?:已经|已|成功).{0,8}(?:设置|设好|设定|创建|安排).{0,16}(?:提醒|闹钟|倒计时)|(?:提醒|闹钟|倒计时).{0,5}(?:已|已经).{0,5}(?:设置|设好|设定|创建|安排)/.test(answer);
}
