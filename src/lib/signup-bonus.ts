import { createHmac } from 'node:crypto';
import type { User } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { claimSignupBonus, ensureUserCredits, type SignupBonusClaimResult } from '@/lib/credits';

function normalizeEmailForBonus(email: string) {
  const normalized = email.trim().toLowerCase();
  const separator = normalized.lastIndexOf('@');
  if (separator <= 0) return normalized;

  let local = normalized.slice(0, separator);
  let domain = normalized.slice(separator + 1);
  local = local.split('+', 1)[0] || local;
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.replaceAll('.', '');
  return `${local}@${domain}`;
}

function getClientIp(request: NextRequest) {
  const direct = request.headers.get('x-real-ip')?.trim();
  const forwardedParts = request.headers.get('x-forwarded-for')?.split(',').map((value) => value.trim()).filter(Boolean) || [];
  const candidate = direct || forwardedParts.at(-1);
  if (candidate && candidate.length <= 64 && /^[0-9a-f:.]+$/i.test(candidate)) return candidate;
  return 'missing-ip';
}

function hashSignal(value: string) {
  const secret = process.env.SIGNUP_BONUS_HMAC_SECRET?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) throw new Error('SIGNUP_BONUS_SECRET_NOT_CONFIGURED');
  return createHmac('sha256', secret).update(value).digest('hex');
}

function getDailyIpLimit() {
  const configured = Number(process.env.SIGNUP_BONUS_IP_DAILY_LIMIT || 3);
  return Number.isSafeInteger(configured) && configured > 0 ? Math.min(configured, 20) : 3;
}

export async function ensureCreditsWithSignupProtection(
  request: NextRequest,
  user: User,
): Promise<{ credits: Awaited<ReturnType<typeof ensureUserCredits>>; signupBonus: SignupBonusClaimResult | null }> {
  const email = user.email?.trim();
  const emailConfirmed = Boolean(user.email_confirmed_at || user.confirmed_at);
  if (!email || !emailConfirmed) {
    return { credits: await ensureUserCredits(user.id), signupBonus: null };
  }

  const signupBonus = await claimSignupBonus({
    userId: user.id,
    emailHash: hashSignal(`email:${normalizeEmailForBonus(email)}`),
    ipHash: hashSignal(`ip:${getClientIp(request)}`),
    dailyIpLimit: getDailyIpLimit(),
  });
  return { credits: await ensureUserCredits(user.id), signupBonus };
}
