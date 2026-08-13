export const AI_TOOL_CREDIT_COSTS = {
  agentChat: 2,
  scriptWriting: 3,
  videoBreakdown: 4,
} as const;

// Conservative Comfly-unit estimates used by the global daily budget guard.
export const AI_TOOL_ESTIMATED_COST_MICROS = {
  agentChat: 8_000,
  scriptWriting: 20_000,
  videoBreakdown: 30_000,
} as const;
