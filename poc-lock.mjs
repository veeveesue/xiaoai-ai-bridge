import { openSync, writeFileSync, closeSync, readFileSync, unlinkSync } from 'node:fs';
export function acquireServiceLock(path) {
  const create = () => { const fd = openSync(path, 'wx', 0o600); try { writeFileSync(fd, String(process.pid)); } finally { closeSync(fd); } };
  try { create(); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const pid = Number(readFileSync(path, 'utf8'));
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('服务锁正在初始化或无效，请先检查运行进程');
    let alive = true;
    try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; else if (error.code !== 'EPERM') throw error; }
    if (alive) throw new Error('已有小爱POC正在运行，拒绝重复启动');
    unlinkSync(path); create();
  }
  return () => { try { if (readFileSync(path, 'utf8') === String(process.pid)) unlinkSync(path); } catch {} };
}
