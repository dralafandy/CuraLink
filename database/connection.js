const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const os = require('os');

// Import Supabase client
const { supabase, isSupabaseConfigured } = require('./supabase');

// Database configuration
const DB_NAME = process.env.DB_NAME || 'curalink';

// Check environment
const isServerless = Boolean(
    process.env.VERCEL || 
    process.env.AWS_LAMBDA_FUNCTION_NAME || 
    process.env.FLY_APP_NAME ||
    process.env.NETLIFY
);

// SQLite path resolution
let sqliteDbPath;

if (isServerless) {
    const tmpDir = os.tmpdir();
    sqliteDbPath = path.join(tmpDir, `${DB_NAME}.db`);
    
    // Try to copy bundled db to tmp
    const bundledDbPath = path.join(__dirname, `${DB_NAME}.db`);
    try {
        if (!fs.existsSync(sqliteDbPath) && fs.existsSync(bundledDbPath)) {
            fs.copyFileSync(bundledDbPath, sqliteDbPath);
            console.log('SQLite DB copied to tmp:', sqliteDbPath);
        }
    } catch (copyError) {
        console.error('Error copying DB to tmp:', copyError.message);
    }
} else {
    sqliteDbPath = path.join(__dirname, `${DB_NAME}.db`);
}

console.log('SQLite DB path:', sqliteDbPath);

// Initialize SQLite
const sqliteDb = new sqlite3.Database(sqliteDbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error('Error opening SQLite database:', err.message);
    } else {
        console.log('Connected to SQLite database');
    }
});

// Handle SQLite errors
sqliteDb.on('error', (err) => {
    console.error('SQLite database error:', err.message);
});

// Database interface
const db = {
    // Check if using Supabase
    isSupabase: isSupabaseConfigured,
    
    // SQLite raw connection (for advanced queries)
    sqlite: sqliteDb,
    
    // Supabase client
    supabase: supabase,
    
    // Generic query methods that work with both databases
    get: async (query, params = []) => {
        if (isSupabaseConfigured) {
            // Supabase implementation
            const { data, error } = await supabase.from(query.table).select(query.select || '*');
            if (error) throw error;
            return data[0] || null;
        } else {
            // SQLite implementation
            return new Promise((resolve, reject) => {
                let sql = query.sql || `SELECT * FROM ${query.table} WHERE ${query.where || '1=1'}`;
                sqliteDb.get(sql, params, (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
        }
    },
    
    all: async (query, params = []) => {
        if (isSupabaseConfigured) {
            const { data, error } = await supabase.from(query.table).select(query.select || '*');
            if (error) throw error;
            return data || [];
        } else {
            return new Promise((resolve, reject) => {
                let sql = query.sql || `SELECT * FROM ${query.table}`;
                sqliteDb.all(sql, params, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        }
    },
    
    run: async (query, params = []) => {
        if (isSupabaseConfigured) {
            // For inserts/updates with Supabase
            if (query.type === 'insert') {
                const { data, error } = await supabase
                    .from(query.table)
                    .insert(query.data)
                    .select();
                if (error) throw error;
                return { lastID: data[0]?.id, changes: data.length };
            } else if (query.type === 'update') {
                const { data, error } = await supabase
                    .from(query.table)
                    .update(query.data)
                    .eq(query.eqField, query.eqValue)
                    .select();
                if (error) throw error;
                return { changes: data.length };
            } else if (query.type === 'delete') {
                const { error } = await supabase
                    .from(query.table)
                    .delete()
                    .eq(query.eqField, query.eqValue);
                if (error) throw error;
                return { changes: 1 };
            }
        } else {
            return new Promise((resolve, reject) => {
                let sql = query.sql || '';
                sqliteDb.run(sql, params, function(err) {
                    if (err) reject(err);
                    else resolve({ lastID: this.lastID, changes: this.changes });
                });
            });
        }
    },
    
    // Raw query for complex operations (SQLite only)
    raw: async (sql, params = []) => {
        if (isSupabaseConfigured) {
            // Supabase doesn't support raw SQL in the same way
            // Use the specific methods above
            throw new Error('Raw SQL not supported with Supabase. Use specific methods.');
        }
        return new Promise((resolve, reject) => {
            sqliteDb.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },
    
    // Serialize for SQLite schema operations
    serialize: (callback) => {
        if (isSupabaseConfigured) {
            console.log('Skipping SQLite serialize with Supabase');
            callback();
        } else {
            sqliteDb.serialize(callback);
        }
    },
    
    // Close connection
    close: (callback) => {
        if (isSupabaseConfigured) {
            console.log('Supabase does not need closing');
            if (callback) callback();
        } else {
            sqliteDb.close(callback);
        }
    }
};

module.exports = db;
