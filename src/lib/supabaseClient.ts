import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Check if the environment variables are defined.
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL and anon key must be defined in the .env.local file');
}

// Type assertion to tell TypeScript that these variables are now strings.
export const supabase = createClient(supabaseUrl as string, supabaseAnonKey as string);