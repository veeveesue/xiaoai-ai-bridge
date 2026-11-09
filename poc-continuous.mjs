export function estimatedReplyWait(text, kind = 'native-translation') {
  const chinese = (text.match(/[\u3400-\u9fff]/gu) || []).length;
  const words = (text.match(/[a-z]+(?:'[a-z]+)?/gi) || []).length;
  if (kind === 'text') return Math.min(20000, Math.max(4000, 1500 + chinese * 200 + words * 450));
  return Math.min(25000, Math.max(6000, 2500 + chinese * 280 + words * 450));
}
export function waitWhileCurrent(ms, signal) {
  return new Promise(resolve => {
    if (signal.aborted) return resolve(false);
    const abort = () => { clearTimeout(timer); resolve(false); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(true); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
export class ContinuousTrial {
  constructor(enabled = false, wait = waitWhileCurrent) {
    this.enabled = enabled; this.wait = wait; this.remaining = 3; this.waitingUntil = 0;
  }
  start() { this.enabled = true; this.remaining = 3; this.waitingUntil = 0; }
  stop() { this.enabled = false; this.remaining = 0; this.waitingUntil = 0; }
  onQuestion(now = Date.now()) {
    if (this.enabled && now > this.waitingUntil) this.remaining = 3;
  }
  async afterReply(text, task, wake, kind = 'native-translation') {
    if (!this.enabled || !task.current() || this.remaining <= 0) return { result: 'disabled-or-limit' };
    const estimatedMs = estimatedReplyWait(text, kind);
    if (!await this.wait(estimatedMs, task.signal) || !task.current() || !this.enabled) return { result: 'cancelled' };
    if (!await wake()) { this.stop(); return { result: 'wake-failed', estimatedMs }; }
    this.remaining--;
    this.waitingUntil = Date.now() + 10000;
    return { result: 'wake-accepted', estimatedMs, remaining: this.remaining };
  }
}
