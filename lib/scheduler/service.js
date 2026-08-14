import { randomUUID } from 'node:crypto';

export class SchedulerService {
  constructor(repository, { logger = console, onExecute = null } = {}) { this.repository = repository; this.logger = logger; this.onExecute = onExecute; this.timers = new Map(); this.running = new Set(); }
  async read() { const state = await this.repository.read({ version: 1, features: {}, tasks: [] }); state.tasks = Array.isArray(state.tasks) ? state.tasks : []; return state; }
  async list() { return (await this.read()).tasks; }
  async create(input = {}) { const state = await this.read(); const task = { id: input.id || randomUUID(), featureId: input.featureId || '00', title: input.title || 'task', runAt: Number(input.runAt || Date.now() + Number(input.delayMs || 60000)), status: 'active', payload: input.payload || {}, createdAt: Date.now() }; if (state.tasks.some((item) => item.id === task.id)) return state.tasks.find((item) => item.id === task.id); state.tasks.push(task); await this.repository.write(state); this.schedule(task); return task; }
  async cancel(id) { const state = await this.read(); const task = state.tasks.find((item) => item.id === String(id)); if (!task) return false; task.status = 'cancelled'; await this.repository.write(state); this.clear(task.id); return true; }
  schedule(task) { this.clear(task.id); if (task.status !== 'active') return; const delay = Math.max(50, Math.min(task.runAt - Date.now(), 2147483647)); this.timers.set(task.id, setTimeout(() => this.execute(task.id).catch((error) => this.logger.warn?.(`[scheduler] ${error.message}`)), delay)); }
  async execute(id) { if (this.running.has(id)) return; this.running.add(id); try { const state = await this.read(); const task = state.tasks.find((item) => item.id === id && item.status === 'active'); if (!task) return; await this.onExecute?.(task); task.status = 'done'; task.finishedAt = Date.now(); await this.repository.write(state); } finally { this.running.delete(id); this.clear(id); } }
  clear(id) { const timer = this.timers.get(id); if (timer) clearTimeout(timer); this.timers.delete(id); }
  async close() { for (const id of this.timers.keys()) this.clear(id); }
}
