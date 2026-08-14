import ConfigPlugin from './apps/core/08-config/plugin.js';
import { featureManifests } from './apps/manifest.js';
import { getRuntime, shutdownRuntime } from './lib/bootstrap.js';

const apps = [ConfigPlugin];

export { ConfigPlugin, apps, featureManifests, getRuntime, shutdownRuntime };
export default apps;
