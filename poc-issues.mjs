import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

const clean = value => String(value || '').replace(/sk-[a-zA-Z0-9_-]{12,}/g, '[密钥已隐藏]').slice(0, 1200);
export function nativeText(record) {
  return (record.answers || []).map(answer => answer.tts?.text || answer.llm?.text || '').filter(Boolean).join('；');
}
export function looksUnsupported(text) {
  return /(?:暂不支持|暂时不支持|能力不支持|功能不支持|暂时回答不上|暂时无法回答|无法为你|无法帮你|不能帮你|我(?:目前|暂时|现在|这边|这里)?(?:还)?(?:无法|不能|没法|没有能力|不支持)|不具备.*(?:功能|能力)|没有.*(?:查询|播放|联网|访问).*功能)/.test(text || '');
}
export function tryRecordIssue(store, issue) {
  try { store.add(issue); return true; } catch { return false; }
}
export class IssueStore {
  constructor(directory = join(homedir(), '.local/share/xiaoai-poc')) {
    this.directory = directory;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.path = join(directory, 'issues.json');
    try { this.items = JSON.parse(readFileSync(this.path, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; this.items = []; }
  }
  add({ category, question, nativeAnswer = '', aiAnswer = '', detail = '', source = 'automatic' }) {
    // Reload review/status edits made between turns before appending a new issue.
    try { this.items = JSON.parse(readFileSync(this.path, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    question = clean(question);
    const normalized = question.replace(/[\s，。！？、,.!?]/g, '');
    const id = createHash('sha256').update(category + ':' + normalized).digest('hex').slice(0, 12);
    const now = new Date().toISOString();
    let item = this.items.find(item => item.id === id);
    if (!item) {
      item = { id, category, question, status: 'open', count: 0, firstSeen: now };
      this.items.push(item);
    }
    Object.assign(item, { status: 'open', count: item.count + 1, lastSeen: now,
      nativeAnswer: clean(nativeAnswer), aiAnswer: clean(aiAnswer), detail: clean(detail), source });
    this.save();
    return item;
  }
  save() {
    const temp = this.path + '.tmp';
    writeFileSync(temp, JSON.stringify(this.items, null, 2) + '\n', { mode: 0o600 });
    renameSync(temp, this.path);
    const lines = ['# 小爱问题待办', '', '自动检测为候选问题，需复核；不会自动修改代码。', ''];
    for (const item of this.items) {
      lines.push(`- [${item.status === 'open' ? ' ' : 'x'}] ${item.category}：${item.question.replace(/\n/g, ' ')}（${item.count}次；ID ${item.id}）`,
        `  - 最近发生：${item.lastSeen}`,
        `  - 原生回复：${item.nativeAnswer.replace(/\n/g, ' ') || '未取得'}`,
        `  - AI回复：${item.aiAnswer.replace(/\n/g, ' ') || '无'}`,
        `  - 说明：${item.detail.replace(/\n/g, ' ')}`, '');
    }
    writeFileSync(join(this.directory, 'TODO.md'), lines.join('\n'), { mode: 0o600 });
  }
  summary() {
    try { this.items = JSON.parse(readFileSync(this.path, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const open = this.items.filter(item => item.status === 'open').sort((a, b) => b.count - a.count);
    return open.length ? `有${open.length}项问题待办。${open.slice(0, 3).map(item => `${item.question}，出现${item.count}次`).join('；')}` : '目前没有记录到问题待办。';
  }
}
