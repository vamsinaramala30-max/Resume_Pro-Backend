import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client (with service role key for admin operations)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Track if Supabase is truly working
let supabaseHealthy = false;
let supabaseAdmin = null;

// Helper to check if Supabase is configured AND working
export function isSupabaseConfigured() {
  return supabaseHealthy && !!(supabaseUrl && supabaseServiceKey);
}

// Helper to initialize Supabase and test connection
export async function initSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.log('[Supabase] Not configured - using in-memory storage');
    return false;
  }

  try {
    // Create the client
    const client = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Test the connection with a simple query
    const { data, error } = await client.from('users').select('id').limit(1).maybeSingle();

    // If we get an error that's not "table doesn't exist", connection is bad
    if (error) {
      // Check if it's a "table not found" error - this means connection works but tables don't exist
      if (error.message?.includes('relation') || error.code === 'PGRST116') {
        // Connection works, tables don't exist yet
        supabaseHealthy = true;
        supabaseAdmin = client;
        console.log('[Supabase] Connected but tables not found - using in-memory storage');
        return true;
      }
      // Real connection error
      console.log('[Supabase] Connection failed:', error.message);
      supabaseHealthy = false;
      return false;
    }

    supabaseHealthy = true;
    supabaseAdmin = client;
    console.log('[Supabase] Connected successfully');
    return true;
  } catch (err) {
    console.log('[Supabase] Init error:', err.message);
    supabaseHealthy = false;
    supabaseAdmin = null;
    return false;
  }
}

// Initialize on load
initSupabase().catch(console.error);

export default supabaseAdmin;