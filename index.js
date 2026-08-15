import { featureManifests } from './apps/manifest.js';
import { createFeaturePlugin } from './apps/features/factory.js';
import { createRequestPlugin } from './apps/features/factory.js';
import { getRuntime, shutdownRuntime } from './lib/bootstrap.js';

const apps = featureManifests.map((manifest) => createFeaturePlugin(manifest));
const eventApps = featureManifests.filter((manifest) => ['13', '14'].includes(manifest.id)).map((manifest) => createRequestPlugin(manifest));
const allApps = [...apps, ...eventApps];
export { apps, eventApps, allApps, featureManifests, getRuntime, shutdownRuntime };
export const HelpPlugin = apps[6];
export const ConfigPlugin = apps[7];
export default allApps;
