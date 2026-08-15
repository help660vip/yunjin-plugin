import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigService } from './config/service.js';
import { JsonRepository } from './storage/json-repository.js';
import { createLogger } from './observability/logger.js';
import { AuditLog } from './observability/audit.js';
import { featureManifests } from '../apps/manifest.js';
import { FeatureRegistry } from './registry/feature-registry.js';
import { SchedulerService } from './scheduler/service.js';
import { CoreServices } from './core/services.js';
import { NotificationBus } from './notification/bus.js';
import { createDefaultProviders } from './adapters/providers.js';
import { FilePolicy } from './adapters/file.js';
import { RedisAdapter } from './adapters/redis.js';
import { RuntimeCapabilities } from './adapters/runtime.js';
import { GroupAggregate } from './features/aggregate.js';
import { MetricsRegistry } from './observability/metrics.js';
import { fetchText } from './http/client.js';
import { validateUrl } from './http/policy.js';
import { featureStorageKey, stableId } from './core/ids.js';

const runtimeKey = Symbol.for('yunjin.plugin.runtime');
const moduleRoot = path.dirname(fileURLToPath(import.meta.url));

function defaultDataRoot() {
  return path.resolve(moduleRoot, '..', 'data', 'yunjin-plugin');
}

export function getRuntime(options = {}) {
  if (!globalThis[runtimeKey]) {
    const dataRoot = path.resolve(options.dataRoot ?? process.env.YUNJIN_DATA_DIR ?? defaultDataRoot());
    const logger = options.logger ?? createLogger('YunJin');
    const audit = options.audit ?? new AuditLog(path.join(dataRoot, 'audit.jsonl'), { logger });
    const repository = options.repository ?? new JsonRepository(path.join(dataRoot, 'config.json'), { logger });
    const stateRepository = options.stateRepository ?? new JsonRepository(path.join(dataRoot, 'state.json'), { logger });
    const notifications = options.notifications ?? new NotificationBus({ logger });
    notifications.on('task.execute', async (event) => {
      const payload = event.payload?.payload || {};
      const taskMeta = event.payload || {};
      const taskId = String(taskMeta.taskId || '');
      const taskFeatureId = String(taskMeta.featureId || '');
      const runAt = Number(taskMeta.runAt || 0) || 0;
      const scopedEvent = { botId: payload.botId || 'default', groupId: payload.groupId || 'private', userId: payload.userId || 'unknown' };
      const pushLevel = scopedEvent.groupId && scopedEvent.groupId !== 'private' ? 'group' : 'user';
      const pushStateKey = featureStorageKey('23', scopedEvent, 'state', { level: pushLevel });
      const pushId = stableId(['23', taskId, runAt, payload.kind, payload.target, payload.subscriptionId, payload.feedId, payload.biliId, payload.repoId]);
      const bounded = (value, max) => String(value ?? '').slice(0, max);
      const pushPayload = {
        kind: bounded(payload.kind, 40),
        content: bounded(payload.content, 2000),
        target: bounded(payload.target, 500),
        groupId: bounded(payload.groupId, 100),
        userId: bounded(payload.userId, 100),
        botId: bounded(payload.botId, 100),
        subscriptionId: bounded(payload.subscriptionId, 100),
        feedId: bounded(payload.feedId, 100),
        biliId: bounded(payload.biliId, 100),
        repoId: bounded(payload.repoId, 100)
      };
      async function recordPush(status, extra = {}) {
        if (!taskId) return;
        await stateRepository.update({}, (state) => {
          const current = state[pushStateKey] && typeof state[pushStateKey] === 'object' ? state[pushStateKey] : { items: [] };
          const items = Array.isArray(current.items) ? current.items : [];
          const previous = items.find((item) => item.id === pushId);
          const record = {
            ...(previous || {}),
            id: pushId,
            taskId,
            featureId: taskFeatureId,
            runAt,
            status,
            payload: { ...pushPayload },
            retryCount: Number(previous?.retryCount || 0) + (status === 'failed' ? 1 : 0),
            updatedAt: Date.now(),
            ...extra
          };
          current.items = [record, ...items.filter((item) => item.id !== pushId)].slice(0, 100);
          state[pushStateKey] = current;
          return record;
        });
      }
      await recordPush('queued');
      let content = payload.content ?? payload.message ?? payload.text;
      if ((content === undefined || content === null || String(content).trim() === '') && payload.target) {
        try {
          const url = validateUrl(payload.target);
          const raw = await fetchText(url.href, { maxBytes: payload.kind === 'monitor' ? 4096 : 128 * 1024, timeoutMs: 5000, attempts: 1, cacheTtlMs: 60000, cacheStaleMs: 300000 });
          if (payload.kind === 'monitor') {
            content = '\u76d1\u63a7\u6b63\u5e38\uff1a' + url.href;
          } else if (payload.kind === 'git') {
            content = '\u0047\u0069\u0074\u8f6e\u8be2\uff1a' + url.href + '\\n\u5df2\u5b8c\u6210\u8fdc\u7aef\u53ef\u8fbe\u6027\u68c0\u67e5';
          } else if (payload.kind === 'bili') {
            let data;
            try { data = JSON.parse(String(raw)); } catch { data = null; }
            const video = data?.data?.list?.vlist?.[0];
            content = video ? '\u54d4\u54e9\u52a8\u6001\uff1a' + String(video.title || '').slice(0, 300) + '\\n' + String(video.arcurl || '') : '\u54d4\u54e9\u6682\u65e0\u65b0\u52a8\u6001';          } else {
            const titles = [...String(raw).matchAll(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/giu)].map((match) => match[1].replace(/<!\[CDATA\[|\]\]>/gu, '').replace(/<[^>]+>/gu, '').trim()).filter(Boolean).slice(0, 5);
            content = titles.length ? '\u8ba2\u9605\u66f4\u65b0\\n' + titles.join('\\n') : '\u8ba2\u9605\u68c0\u67e5\uff1a' + url.href;
          }
        } catch {
          content = payload.kind === 'monitor' ? '\u76d1\u63a7\u5931\u8d25\uff1a' + String(payload.target).slice(0, 300) : '\u8ba2\u9605\u68c0\u67e5\u5931\u8d25\uff1a' + String(payload.target).slice(0, 300);
        }
      }
      if (content === undefined || content === null || String(content).trim() === '') {
        await recordPush('failed', { error: 'task content missing' });
        return { ok: false, reason: 'task content missing' };
      }
      const periodicKinds = new Set(['monitor', 'subscription', 'rss', 'bili', 'git']);
      const isPeriodic = periodicKinds.has(String(payload.kind || ''));
      const fingerprint = stableId([payload.kind, payload.target, payload.groupId, payload.userId, content]);
      const stateKey = 'Yunjin:notification:' + String(payload.kind || 'task') + ':' + stableId([payload.botId, payload.groupId, payload.userId, payload.target, payload.subscriptionId, payload.feedId, payload.biliId, payload.repoId]);
      if (isPeriodic) {
        try {
          const state = await stateRepository.read({});
          if (state[stateKey]?.fingerprint === fingerprint) {
            await recordPush('skipped', { reason: 'content-unchanged' });
            return { ok: true, duplicate: true, reason: 'content-unchanged' };
          }
        } catch (error) {
          logger.warn?.('notification dedupe state unavailable', error);
        }
      }
      const botId = String(payload.botId || 'default');
      const pool = globalThis.Bot;
      const bot = typeof pool?.get === 'function' ? pool.get(botId) : pool?.[botId] ?? pool;
      let delivery;
      try {
        delivery = await notifications.sendToTarget(bot, { groupId: payload.groupId, userId: payload.userId }, String(content));
        if (delivery?.ok === false) throw new Error('scheduled notification target unavailable');
      } catch (error) {
        await recordPush('failed', { error: bounded(error?.message || error, 300) });
        throw error;
      }
      pushPayload.content = bounded(content, 2000);
      await recordPush('sent', { sentAt: Date.now() });
      if (isPeriodic) {
        try {
          await stateRepository.update({}, (state) => {
            state[stateKey] = { fingerprint, updatedAt: Date.now() };
            return state[stateKey];
          });
        } catch (error) {
          logger.warn?.('notification dedupe state write failed', error);
        }
      }
      return delivery;
    });
    const scheduler = options.scheduler ?? new SchedulerService(stateRepository, {
      logger,
      onExecute: async (task) => {
        await audit.record({ action: 'scheduler.execute', taskId: task.id, featureId: task.featureId });
        const result = await notifications.publish('task.execute', { taskId: task.id, featureId: task.featureId, runAt: task.runAt, attempts: task.attempts, payload: task.payload }, { dedupeKey: 'task:' + task.id + ':' + String(task.runAt) });
        if (!result.ok) throw new Error('scheduled notification delivery failed');
        return result;
      }
    });
    const core = options.core ?? new CoreServices({ timeZone: options.timeZone });
    const metrics = options.metrics ?? new MetricsRegistry({ clock: core.clock });
    const aggregate = options.aggregate ?? new GroupAggregate({ clock: core.clock });
    const redis = options.redis ?? new RedisAdapter({ logger });
    const filePolicy = options.filePolicy ?? new FilePolicy({ root: path.resolve(moduleRoot, '..', 'temp', 'yunjin-plugin') });
    const config = new ConfigService({ repository, logger, audit });
    for (const manifest of featureManifests) config.registerSchema(manifest.id, manifest.configSchema ?? {});
    const providers = options.providers ?? createDefaultProviders({ config, logger });
    const registry = new FeatureRegistry(featureManifests, config);
    globalThis[runtimeKey] = {
      moduleRoot,
      dataRoot,
      logger,
      audit,
      config,
      registry,
      stateRepository,
      scheduler,
      notifications,
      core,
      metrics,
      aggregate,
      redis,
      filePolicy,
      providers,
      manifests: featureManifests,
      started: false,
      async start() {
        if (this.started) return this;
        await this.config.initialize();
        await this.filePolicy.initialize();
        this.core.start();
        if (this.config.getGlobal('core.hot_reload') !== false) this.config.watch();
        if (typeof this.scheduler.recover === 'function') await this.scheduler.recover();
        else for (const task of await this.scheduler.list()) this.scheduler.schedule(task);
        this.started = true;
        return this;
      },
      capabilities(event = {}) {
        return new RuntimeCapabilities(event, this).snapshot();
      }
    };
  }
  return globalThis[runtimeKey];
}

export async function shutdownRuntime() {
  const runtime = globalThis[runtimeKey];
  if (!runtime) return;
  await runtime.scheduler.close();
  await runtime.config.close();
  await runtime.redis.close();
  runtime.notifications.close();
  runtime.core.stop();
  delete globalThis[runtimeKey];
}
