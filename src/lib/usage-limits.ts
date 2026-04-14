import { auth } from '@clerk/nextjs/server';
import { createClerkSupabaseClient } from '@/lib/supabase';

type AccessControlRow = {
  user_id: string;
  is_whitelisted: boolean;
  daily_image_limit: number;
  daily_video_limit: number;
  daily_remove_bg_limit: number;
  daily_upscale_limit: number;
};

type DailyUsageRow = {
  id?: string;
  user_id: string;
  usage_date: string;
  image_count: number;
  video_count: number;
  remove_bg_count: number;
  upscale_count: number;
  created_at?: string;
  updated_at?: string;
};

export type UsageAction = 'image' | 'video' | 'remove_bg' | 'upscale';

const DEFAULT_LIMITS = {
  image: 15,
  video: 0,
  remove_bg: 15,
  upscale: 15,
} as const;

function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

export async function enforceUsageLimit(action: UsageAction) {
  const { userId, getToken } = await auth();

  if (!userId) {
    throw new Error('UNAUTHENTICATED');
  }

  const token = await getToken({ template: 'supabase' });
  if (!token) {
    throw new Error('SUPABASE_TOKEN_MISSING');
  }

  const supabase = createClerkSupabaseClient(token);

  const { data: accessRowRaw, error: accessError } = await supabase
    .from('user_access_control')
    .select('*')
    .eq('user_id', userId)
    .single();

  const accessRow = accessRowRaw as AccessControlRow | null;

  if (accessError && accessError.code !== 'PGRST116') {
    throw accessError;
  }

  const access: AccessControlRow = accessRow
    ? {
        user_id: accessRow.user_id,
        is_whitelisted: accessRow.is_whitelisted,
        daily_image_limit: accessRow.daily_image_limit,
        daily_video_limit: accessRow.daily_video_limit,
        daily_remove_bg_limit: accessRow.daily_remove_bg_limit,
        daily_upscale_limit: accessRow.daily_upscale_limit,
      }
    : {
        user_id: userId,
        is_whitelisted: false,
        daily_image_limit: DEFAULT_LIMITS.image,
        daily_video_limit: DEFAULT_LIMITS.video,
        daily_remove_bg_limit: DEFAULT_LIMITS.remove_bg,
        daily_upscale_limit: DEFAULT_LIMITS.upscale,
      };

  if (!accessRow) {
    await supabase.from('user_access_control').insert({
      user_id: userId,
      is_whitelisted: false,
      daily_image_limit: DEFAULT_LIMITS.image,
      daily_video_limit: DEFAULT_LIMITS.video,
      daily_remove_bg_limit: DEFAULT_LIMITS.remove_bg,
      daily_upscale_limit: DEFAULT_LIMITS.upscale,
    });
  }

  if (!access.is_whitelisted) {
    throw new Error('NOT_WHITELISTED');
  }

  const usageDate = todayDateKey();
  const { data: usageRowRaw, error: usageError } = await supabase
    .from('user_daily_usage')
    .select('*')
    .eq('user_id', userId)
    .eq('usage_date', usageDate)
    .single();

  const usageRow = usageRowRaw as DailyUsageRow | null;

  if (usageError && usageError.code !== 'PGRST116') {
    throw usageError;
  }

  const usage: DailyUsageRow = usageRow || {
    user_id: userId,
    usage_date: usageDate,
    image_count: 0,
    video_count: 0,
    remove_bg_count: 0,
    upscale_count: 0,
  };

  const fieldMap = {
    image: 'image_count',
    video: 'video_count',
    remove_bg: 'remove_bg_count',
    upscale: 'upscale_count',
  } as const;

  const limitMap = {
    image: access.daily_image_limit,
    video: access.daily_video_limit,
    remove_bg: access.daily_remove_bg_limit,
    upscale: access.daily_upscale_limit,
  } as const;

  const field = fieldMap[action];
  const limit = limitMap[action];
  const current = usage[field] || 0;

  if (current >= limit) {
    throw new Error(`DAILY_LIMIT_EXCEEDED:${action}:${limit}`);
  }

  const nextPayload = {
    ...usage,
    [field]: current + 1,
  };

  if (!usageRow) {
    const { error: insertUsageError } = await supabase.from('user_daily_usage').insert(nextPayload);
    if (insertUsageError) throw insertUsageError;
  } else {
    if (!usageRow.id) {
      throw new Error('USAGE_ROW_ID_MISSING');
    }

    const { error: updateUsageError } = await supabase
      .from('user_daily_usage')
      .update({ [field]: current + 1, updated_at: new Date().toISOString() })
      .eq('id', usageRow.id);
    if (updateUsageError) throw updateUsageError;
  }

  return {
    userId,
    action,
    used: current + 1,
    limit,
    remaining: Math.max(0, limit - current - 1),
  };
}
