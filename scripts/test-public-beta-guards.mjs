import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

const [
  login,
  authProvider,
  credits,
  generateImage,
  generateVideo,
  agent,
  scriptWriting,
  videoBreakdown,
  assetRoute,
  adminAuth,
  signupSql,
  budgetSql,
  hardeningSql,
] = await Promise.all([
  read('src/components/auth/LoginModal.tsx'),
  read('src/components/auth/SupabaseAuthProvider.tsx'),
  read('src/lib/credits.ts'),
  read('src/app/api/generate-image/route.ts'),
  read('src/app/api/generate-video/route.ts'),
  read('src/app/api/agent/run/route.ts'),
  read('src/app/api/script-writing/route.ts'),
  read('src/app/api/video-breakdown/route.ts'),
  read('src/app/api/canvas-assets/route.ts'),
  read('src/lib/admin-auth.ts'),
  read('sql/public-beta-signup-protection.sql'),
  read('sql/public-beta-ai-budget.sql'),
  read('sql/public-beta-database-hardening.sql'),
]);

assert.match(login, /TurnstileWidget/);
assert.match(login, /NEXT_PUBLIC_AUTH_EMAIL_MODE === 'otp'/);
assert.match(authProvider, /captchaToken/);
assert.match(authProvider, /verifyOtp/);
assert.match(credits, /credits: 0/);
assert.match(credits, /claim_signup_bonus_atomic/);
assert.match(generateImage, /readLimitedJson\(request, 28 \* 1024 \* 1024\)/);
assert.match(generateImage, /reserveAiBudget/);
assert.match(generateVideo, /reserveAiBudget/);
assert.match(agent, /runMeteredAiOperation/);
assert.match(scriptWriting, /creditType: 'script_writing'/);
assert.match(videoBreakdown, /creditType: 'video_breakdown'/);
assert.match(assetRoute, /status: 411/);
assert.doesNotMatch(adminAuth, /NEXT_PUBLIC_ADMIN_EMAILS/);
assert.match(signupSql, /unique[\s\S]*email_hash|email_hash text not null unique/);
assert.match(signupSql, /pg_advisory_xact_lock/);
assert.match(budgetSql, /DAILY_AI_BUDGET_EXCEEDED/);
assert.match(budgetSql, /security definer[\s\S]*set search_path = ''/);
assert.doesNotMatch(hardeningSql, /grant (?:insert|update|all).*user_daily_usage.*authenticated/i);
assert.match(hardeningSql, /allowed_mime_types/);

console.log('Public beta guard tests passed.');
