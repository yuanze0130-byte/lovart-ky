'use client';

import React from 'react';

interface CreditsBadgeProps {
  credits: number | null;
  loading?: boolean;
  compact?: boolean;
}

export function CreditsBadge({ credits, loading = false, compact = false }: CreditsBadgeProps) {
  if (credits === null && !loading) {
    return null;
  }

  return (
    <div className={`px-3 py-1.5 bg-black text-white rounded-full ${compact ? 'text-xs' : 'text-sm'} font-medium flex items-center gap-1.5`}>
      <span className="text-sm">⚡</span>
      <span>{loading ? '...' : (credits ?? 0).toLocaleString()}</span>
      {!compact && <span className="text-white/70">积分</span>}
    </div>
  );
}
