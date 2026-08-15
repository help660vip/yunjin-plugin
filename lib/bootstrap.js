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
    const scheduler = options.scheduler ?? new SchedulerService(stateRepository, {
      logger,
      onExecute: async (task) => {
        await audit.record({ action: 'scheduler.execute', taskId: task.id, featureId: task.featureId });
        return notifications.publish('task.execute', { taskId: task.id, featureId: task.featureId, payload: task.payload }, { dedupeKey: 'task:' + task.id });
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
        for (const task of await this.scheduler.list()) this.scheduler.schedule(task);
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
