import configManifest from './core/08-config/manifest.js';

export const featureManifests = Object.freeze([configManifest]);

export function getFeatureManifest(id) {
  return featureManifests.find((manifest) => manifest.id === id);
}
