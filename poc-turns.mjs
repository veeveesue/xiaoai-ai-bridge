// A newer question cancels older work; shutdown prevents any later playback.
export class TurnCoordinator {
  constructor() { this.sequence = 0; this.closed = false; this.controller = undefined; this.pending = new Set(); }
  submit(handler) {
    if (this.closed) return Promise.resolve();
    this.controller?.abort();
    const controller = this.controller = new AbortController();
    const sequence = ++this.sequence;
    const turn = { signal: controller.signal, current: () => !this.closed && !controller.signal.aborted && sequence === this.sequence };
    let task;
    try { task = Promise.resolve(handler(turn)); } catch (error) { task = Promise.reject(error); }
    this.pending.add(task);
    task.then(() => this.pending.delete(task), () => this.pending.delete(task));
    return task;
  }
  stop() { this.closed = true; this.controller?.abort(); }
  async drain() { await Promise.allSettled([...this.pending]); }
}
export function commitAcceptedReply(history, turn, question, answer) {
  if (!turn.current()) return false;
  history.push({ role: 'user', content: question }, { role: 'assistant', content: answer });
  if (history.length > 12) history.splice(0, history.length - 12);
  return true;
}
