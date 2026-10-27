import {
  BUSINESS_CAPABILITIES as C, BUSINESS_PROFILES, CORE_BUSINESS_CAPABILITIES,
  getBusinessCapabilityDependencies, getBusinessProfileSelectionCapabilities, expandBusinessCapabilities,
} from '../../../packages/shared/types/business-capabilities';
import {
  BUSINESS_SERVICE_CAPABILITY_OWNERS, isBusinessServiceAvailable,
} from '../../../packages/shared/types/business-service-ownership';

/** Build-time read projection. PHP needs no Node runtime; the shared graph remains the authority. */
export function createCapabilityProjection() {
  const services = [C.AI, C.ANDROID, C.WHATSAPP];
  const profiles = Object.values(BUSINESS_PROFILES);
  const sectors = ['all', ...profiles.map(profile => profile.id)];
  const nodes = Object.values(C).map(id => ({
    id,
    dependencies: [...getBusinessCapabilityDependencies(id)],
    owners: id === C.AI ? [...BUSINESS_SERVICE_CAPABILITY_OWNERS.ai]
      : id === C.ANDROID ? [...BUSINESS_SERVICE_CAPABILITY_OWNERS.android]
      : id === C.WHATSAPP ? [...BUSINESS_SERVICE_CAPABILITY_OWNERS.whatsapp] : [],
    levels: Object.fromEntries(sectors.map(sector => {
      if (CORE_BUSINESS_CAPABILITIES.includes(id)) return [sector, 'core'];
      if (services.some(service => service === id)) return [sector, 'services'];
      if (sector === 'all') {
        const required = profiles.some(profile => expandBusinessCapabilities(profile.requiredCapabilities).includes(id));
        return [sector, required ? 'sector' : 'optional'];
      }
      const profile = BUSINESS_PROFILES[sector as keyof typeof BUSINESS_PROFILES];
      const allowed = getBusinessProfileSelectionCapabilities(profile.id, profile.optionalCapabilities);
      return [sector, !allowed.includes(id) ? null
        : expandBusinessCapabilities(profile.requiredCapabilities).includes(id) ? 'sector' : 'optional'];
    })),
  }));
  // These are the canonical availability owners (OR), not feature dependencies (AND).
  const serviceNodes = Object.entries(BUSINESS_SERVICE_CAPABILITY_OWNERS).map(([service, owners]) => ({
    id: `integration.${service}`, owners: [...owners], dependencies: [],
    levels: Object.fromEntries(sectors.map(sector => [sector, sector === 'all'
      || isBusinessServiceAvailable(service as keyof typeof BUSINESS_SERVICE_CAPABILITY_OWNERS,
        [...getBusinessProfileSelectionCapabilities(sector, BUSINESS_PROFILES[sector as keyof typeof BUSINESS_PROFILES].optionalCapabilities), ...services])
      ? 'services' : null])),
  }));
  // AI/Android/WhatsApp already have a capability card; avoid duplicate service cards.
  return { version: 1, sectors, nodes: [...nodes, ...serviceNodes.filter(node => !['integration.ai', 'integration.android', 'integration.whatsapp'].includes(node.id))] };
}
