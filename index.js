import { featureManifests } from './apps/manifest.js';
import { createFeaturePlugin } from './apps/features/factory.js';
import { getRuntime, shutdownRuntime } from './lib/bootstrap.js';

const apps = featureManifests.map((manifest) => createFeaturePlugin(manifest));
export { apps, featureManifests, getRuntime, shutdownRuntime };
export const HelpPlugin = apps[6];
export const ConfigPlugin = apps[7];
export default apps;
