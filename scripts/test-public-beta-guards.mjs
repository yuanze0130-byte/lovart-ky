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
  videoStatus,
  agentShared,
  adminAuth,
  signupSql,
  budgetSql,
  hardeningSql,
  nginxConfig,
  packageJson,
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
  read('src/app/api/video-status/route.ts'),
  read('src/lib/agent/executors/shared.ts'),
  read('src/lib/admin-auth.ts'),
  read('sql/public-beta-signup-protection.sql'),
  read('sql/public-beta-ai-budget.sql'),
  read('sql/public-beta-database-hardening.sql'),
  read('deploy/nginx/lovart-ky.conf'),
  read('package.json'),
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
assert.match(videoStatus, /if \(!billingJob\)/);
assert.match(videoStatus, /status: 404/);
assert.match(videoStatus, /enforceUserRateLimit\(user\.id, 'video-status'/);
assert.match(agentShared, /signal: request\.signal/);
assert.doesNotMatch(generateImage, /proxy raw response preview/);
assert.doesNotMatch(generateImage, /JSON\.stringify\(response, null, 2\)\.slice\(0, 5000\)/);
assert.match(generateImage, /AbortSignal\.any/);
assert.match(generateImage, /upstreamOutcomeUnknown/);
assert.match(generateImage, /IMAGE_UPSTREAM_OUTCOME_UNKNOWN/);
assert.match(generateImage, /class KnownUpstreamFailureError/);
assert.match(generateImage, /const markUpstreamSubmissionStarted/);
assert.match(generateImage, /const upstreamOutcomeUnknown = upstreamStarted && !isKnownUpstreamFailure\(error\)/);
assert.ok(
  generateImage.indexOf('const translatedPrompt') < generateImage.indexOf('markTargetSubmissionStarted();'),
  'image submission must not be marked before prompt preprocessing finishes',
);
assert.doesNotMatch(generateImage, /upstreamStarted = true;\s+if \(provider/);
assert.doesNotMatch(adminAuth, /NEXT_PUBLIC_ADMIN_EMAILS/);
assert.match(signupSql, /unique[\s\S]*email_hash|email_hash text not null unique/);
assert.match(signupSql, /pg_advisory_xact_lock/);
assert.match(budgetSql, /DAILY_AI_BUDGET_EXCEEDED/);
assert.match(budgetSql, /security definer[\s\S]*set search_path = ''/);
assert.doesNotMatch(hardeningSql, /grant (?:insert|update|all).*user_daily_usage.*authenticated/i);
assert.match(hardeningSql, /allowed_mime_types/);
assert.match(nginxConfig, /server_name 38\.244\.14\.231;\s+return 301 https:\/\/doodleverse\.cn\$request_uri;/);
assert.match(nginxConfig, /Strict-Transport-Security/);
assert.match(nginxConfig, /frame-ancestors 'none'/);
assert.match(nginxConfig, /client_max_body_size 65m/);
assert.match(nginxConfig, /limit_req_zone[\s\S]*rate=20r\/s/);
assert.match(nginxConfig, /limit_conn doodleverse_connections 30/);
assert.match(packageJson, /"start": "next start -H 127\.0\.0\.1"/);

console.log('Public beta guard tests passed.');
