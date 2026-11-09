import { mkdirSync, appendFileSync, statSync, renameSync, writeFileSync, chmodSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export function failureKind(error) {
  if (Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599) return 'http_' + error.status;
  if (error?.code === 'EMPTY_CONVERSATIONS') return 'conversation_unavailable';
  if (error?.code === 'AUTH_UNAVAILABLE') return 'authentication_unavailable';
  if (/timeout/i.test(error?.name || '') || /ETIMEDOUT|ECONNABORTED/.test(error?.code || '')) return 'timeout';
  if (/ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ENETUNREACH/.test(error?.code || error?.cause?.code || '')) return 'network';
  return 'request_failed';
}

export class RuntimeLog {
  constructor(directory, { now = Date.now, maxBytes = 1024 * 1024, backups = 3, secrets = [], stdout = () => {} } = {}) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.path = join(directory, 'runtime.jsonl'); this.healthPath = join(directory, 'health.json');
    this.now = now; this.maxBytes = maxBytes; this.backups = backups; this.secrets = secrets.filter(Boolean).map(String); this.stdout = stdout;
    this.health = { pid: process.pid, startedAt: this.time(), status: 'starting', lastPollAt: null, lastRecordAt: null, lastModelAt: null, lastPlaybackAcceptedAt: null };
    this.lastWrite = -Infinity; this.healthEnabled = true;
  }
  time() { return new Date(this.now()).toISOString(); }
  clean(value) {
    let text = String(value);
    for (const secret of this.secrets) text = text.split(secret).join('[redacted]');
    return text.replace(/sk-[\w-]{12,}/g, '[redacted]').replace(/https?:\/\/\S+/g, '[url]').slice(0, 500);
  }
  event(event, fields = {}) {
    const row = { time: this.time(), event, ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, typeof v === 'string' ? this.clean(v) : v])) };
    const line = JSON.stringify(row) + '\n';
    try {
      if (existsSync(this.path) && statSync(this.path).size + Buffer.byteLength(line) > this.maxBytes) {
        if (existsSync(this.path + '.' + this.backups)) unlinkSync(this.path + '.' + this.backups);
        for (let i = this.backups - 1; i >= 1; i--) if (existsSync(this.path + '.' + i)) renameSync(this.path + '.' + i, this.path + '.' + (i + 1));
        renameSync(this.path, this.path + '.1');
      }
      appendFileSync(this.path, line, { mode: 0o600 }); chmodSync(this.path, 0o600);
    } catch { this.stdout(JSON.stringify({ time: this.time(), event: 'log_write_failed' })); }
    this.stdout(line.trimEnd());
  }
  update(fields, force = false) {
    if (!this.healthEnabled) return;
    Object.assign(this.health, fields, { updatedAt: this.time() });
    if (!force && this.now() - this.lastWrite < 30000) return;
    try {
      const tmp = this.healthPath + '.tmp';
      writeFileSync(tmp, JSON.stringify(this.health, null, 2) + '\n', { mode: 0o600 }); chmodSync(tmp, 0o600); renameSync(tmp, this.healthPath); this.lastWrite = this.now();
    } catch { this.event('health_write_failed'); }
  }
  message(message) { this.event('detail', { message }); }
}

export function readHealth(directory, now = Date.now()) {
  const h = JSON.parse(readFileSync(join(directory, 'health.json'), 'utf8'));
  let processAlive = false;
  if (Number.isSafeInteger(h.pid) && h.pid > 0) try { process.kill(h.pid, 0); processAlive = true; } catch (error) { processAlive = error.code === 'EPERM'; }
  const age = h.lastPollAt ? now - Date.parse(h.lastPollAt) : Infinity;
  return { ...h, processAlive, pollFresh: age >= 0 && age <= 90000, healthy: processAlive && h.status === 'running' && age >= 0 && age <= 90000 };
}

// No model or audio retries: replaying a side effect could speak twice.
export class RecoveringPoller {
  constructor({ connect, log, now = Date.now, rebuildAfter = 3, maxFailures = 12 }) {
    this.connect = connect; this.log = log; this.now = now; this.rebuildAfter = rebuildAfter; this.maxFailures = maxFailures; this.failures = 0;
  }
  async poll() {
    try {
      if (!this.clients) {
        this.log.event('connection_attempt', { failures: this.failures });
        this.clients = await this.connect();
        if (!this.clients?.mina || !this.clients?.miot) { this.clients = undefined; throw Object.assign(new Error(), { code: 'AUTH_UNAVAILABLE' }); }
      }
      const started = this.now();
      const data = await this.clients.mina.getConversations({ limit: 10 });
      if (!Array.isArray(data?.records)) throw Object.assign(new Error(), { code: 'EMPTY_CONVERSATIONS' });
      const recovered = this.failures > 0;
      if (recovered) this.log.event('poll_recovered', { previousFailures: this.failures });
      this.failures = 0;
      this.log.update({ status: 'running', consecutiveFailures: 0, lastPollAt: this.log.time(), lastFailureKind: null }, recovered || !this.log.health.lastPollAt);
      return { data, clients: this.clients, pollMs: this.now() - started, delayMs: 500 };
    } catch (error) {
      this.failures++;
      const kind = failureKind(error);
      this.log.event('poll_failed', { kind, failures: this.failures });
      this.log.update({ status: 'degraded', consecutiveFailures: this.failures, lastFailureKind: kind }, true);
      if (this.failures % this.rebuildAfter === 0) { this.clients = undefined; this.log.event('connection_rebuild_scheduled'); }
      if (this.failures >= this.maxFailures) {
        this.log.event('restart_required');
        this.log.update({ status: 'restart_required' }, true);
        throw Object.assign(new Error('连续连接失败，需要后台托管重启'), { code: 'RESTART_REQUIRED' });
      }
      return { delayMs: Math.min(500 * 2 ** Math.min(this.failures, 6), 30000) };
    }
  }
}
