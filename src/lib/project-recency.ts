const prefix = 'doodleverse.project-recency.';
export const PROJECT_RECENCY_EVENT = 'doodleverse-project-recency-changed';
export function readProjectRecency(owner: string): Record<string, number> {
  try {
    const input: unknown = JSON.parse(localStorage.getItem(prefix + owner) || '{}');
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    return Object.fromEntries(Object.entries(input).filter(([id, value]) => /^[0-9a-f-]{36}$/i.test(id) && typeof value === 'number' && Number.isFinite(value) && value > 0));
  } catch { return {}; }
}
export function markProjectOpened(owner: string, projectId: string, time = Date.now()) {
  if (!owner || !/^[0-9a-f-]{36}$/i.test(projectId)) return;
  try {
    const recent = { ...readProjectRecency(owner), [projectId]: time };
    const bounded = Object.fromEntries(Object.entries(recent).sort((a, b) => b[1] - a[1]).slice(0, 500));
    localStorage.setItem(prefix + owner, JSON.stringify(bounded));
    window.dispatchEvent(new Event(PROJECT_RECENCY_EVENT));
  } catch { /* Recency is optional; storage failure must not block project loading. */ }
}
