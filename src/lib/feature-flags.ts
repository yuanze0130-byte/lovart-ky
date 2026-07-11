export type FeatureFlag = 'agentPanel' | 'nodeRegistryMenus';

const FEATURE_FLAGS: Record<FeatureFlag, boolean> = {
  agentPanel: process.env.NEXT_PUBLIC_FEATURE_AGENT_PANEL !== 'false',
  nodeRegistryMenus: process.env.NEXT_PUBLIC_FEATURE_NODE_REGISTRY_MENUS !== 'false',
};

export function isFeatureEnabled(flag: FeatureFlag) {
  return FEATURE_FLAGS[flag];
}
