const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

// Check if Supabase is configured
const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

let supabase;

if (isSupabaseConfigured) {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('Supabase client initialized');
} else {
    console.log('Supabase not configured. Using SQLite.');
}

module.exports = {
    supabase,
    isSupabaseConfigured,
    // Helper to get client (returns null if not configured)
    getClient: () => supabase
};
