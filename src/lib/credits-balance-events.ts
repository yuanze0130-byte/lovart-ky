export const CREDITS_BALANCE_UPDATED_EVENT = 'credits-balance-updated';

export function notifyCreditsBalanceUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CREDITS_BALANCE_UPDATED_EVENT));
  }
}
