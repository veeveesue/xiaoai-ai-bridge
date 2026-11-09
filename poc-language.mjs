export function nativeAudioAction(record) {
  return (record.answers || []).some(answer => answer.type === 'AUDIO' ||
    /^AudioPlayer\./i.test(answer.unknown?.header || ''));
}
export function nativeTranslationHandled(text, record = {}) {
  if (!/(?:什么意思|怎么翻译|翻译成|译成|请翻译|帮我翻译|翻译一下|怎么说|如何说|\btranslate\b|\btranslation\b|what does.+mean)/i.test(text)) return false;
  const answer = (record.answers || []).map(a => a.tts?.text || a.llm?.text || '').join('；');
  return nativeAudioAction(record) && /的(?:普通话|中文|英文|英语|日语|韩语|法语|德语|西班牙语)是|翻译(?:成|为).{0,10}是|译为/.test(answer);
}

