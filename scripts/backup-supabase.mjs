import { createWriteStream } from 'node:fs';
import { chmod, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createGzip } from 'node:zlib';
import { createClient } from '@supabase/supabase-js';

const TABLES = [
  'projects',
  'canvas_elements',
  'user_credits',
  'credit_transactions',
  'ai_cost_reservations',
  'async_generation_jobs',
  'video_generation_jobs',
  'credit_orders',
  'credit_packages',
  'payment_events',
  'redeem_code_batches',
  'redeem_codes',
  'redeem_code_redemptions',
  'signup_bonus_claims',
  'user_daily_usage',
];

const PAGE_SIZE = 1_000;

function loadProductionEnv() {
  const envPath = process.env.DOODLEVERSE_ENV_FILE
    || path.join(process.cwd(), '.env.production');
  if (typeof process.loadEnvFile === 'function') process.loadEnvFile(envPath);
}

async function fetchTable(supabase, table) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Unable to back up ${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

async function fetchAuthUsers(supabase) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw new Error(`Unable to back up auth users: ${error.message}`);
    users.push(...data.users.map((user) => ({
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      confirmed_at: user.confirmed_at,
      last_sign_in_at: user.last_sign_in_at,
      app_metadata: user.app_metadata,
    })));
    if (data.users.length < PAGE_SIZE) return users;
  }
}

loadProductionEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Supabase URL or service role key is missing');
}

const outputDirectory = path.resolve(process.argv[2] || path.join(process.cwd(), '.backups'));
await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
await chmod(outputDirectory, 0o700);

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const tables = {};
for (const table of TABLES) tables[table] = await fetchTable(supabase, table);

const backup = {
  format: 'doodleverse-supabase-json-v1',
  createdAt: new Date().toISOString(),
  projectUrl: supabaseUrl,
  authUsers: await fetchAuthUsers(supabase),
  tables,
};
const timestamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '-');
const outputPath = path.join(outputDirectory, `supabase-${timestamp}.json.gz`);
await pipeline(
  Readable.from([JSON.stringify(backup)]),
  createGzip({ level: 9 }),
  createWriteStream(outputPath, { mode: 0o600 }),
);

console.log(`Supabase backup written: ${outputPath}`);
