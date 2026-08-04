import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase';

type SupabaseBrowserWindow = Window & {
  __doodleverseSupabaseClient?: SupabaseClient<Database>;
};

export function createSupabaseBrowserClient() {
  const createBrowserClient = () => createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  if (typeof window === 'undefined') {
    return createBrowserClient();
  }

  const browserWindow = window as SupabaseBrowserWindow;
  browserWindow.__doodleverseSupabaseClient ??= createBrowserClient();

  return browserWindow.__doodleverseSupabaseClient;
}
