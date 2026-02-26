const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY;
const hasSupabaseConfig = Boolean(supabaseUrl && supabaseKey);

if (!hasSupabaseConfig) {
    console.error(
        'Supabase configuration missing. Set SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_KEY).'
    );
}

const supabase = hasSupabaseConfig ? createClient(supabaseUrl, supabaseKey) : null;
if (supabase) {
    console.log('Supabase client initialized');
}

function ensureSupabaseConfigured() {
    if (!supabase) {
        throw new Error(
            'Supabase configuration missing. Set SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_KEY).'
        );
    }
}

function normalizeArgs(params, callback) {
    if (typeof params === 'function') {
        return { params: [], callback: params };
    }

    return {
        params: Array.isArray(params) ? params : [],
        callback: typeof callback === 'function' ? callback : null
    };
}

function withOptionalCallback(promise, callback) {
    if (!callback) return promise;

    promise
        .then((result) => callback.call(result, null, result))
        .catch((err) => callback.call(null, err, null));

    return undefined;
}

// Helper function to strip table alias from field name (e.g., "u.role" -> "role")
function stripTableAlias(field) {
    if (typeof field !== 'string') return field;
    const parts = field.split('.');
    return parts.length > 1 ? parts[parts.length - 1] : field;
}

function parseSql(sql, params) {
    const tableMatch = sql.match(/FROM\s+(\w+)/i) || sql.match(/INTO\s+(\w+)/i) || sql.match(/UPDATE\s+(\w+)/i);
    const table = tableMatch ? tableMatch[1] : null;

    const selectMatch = sql.match(/SELECT\s+([\s\S]*?)\s+FROM/i);
    const select = selectMatch ? selectMatch[1].trim() : '*';

    const whereClauseMatch = sql.match(/WHERE\s+([\s\S]*?)(?:\s+ORDER\s+BY|\s+GROUP\s+BY|\s+LIMIT|\s+OFFSET|$)/i);
    const whereClause = whereClauseMatch ? whereClauseMatch[1] : '';

    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
    const offsetMatch = sql.match(/OFFSET\s+(\d+)/i);
    const orderMatch = sql.match(/ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i);

    const conditions = [];
    let connector = null;

    if (whereClause) {
        const tokens = whereClause.split(/\s+(AND|OR)\s+/i);
        let paramIndex = 0;

        for (let i = 0; i < tokens.length; i += 2) {
            const part = tokens[i].trim();
            
            // Match IS NOT NULL condition (supports table alias: u.field IS NOT NULL)
            const isNotNullMatch = part.match(/([\w.]+)\s+IS\s+NOT\s+NULL/i);
            if (isNotNullMatch) {
                conditions.push({
                    field: stripTableAlias(isNotNullMatch[1]),
                    operator: 'IS NOT NULL',
                    value: null
                });
                continue;
            }
            
            // Match IS NULL condition
            const isNullMatch = part.match(/([\w.]+)\s+IS\s+NULL/i);
            if (isNullMatch) {
                conditions.push({
                    field: stripTableAlias(isNullMatch[1]),
                    operator: 'IS NULL',
                    value: null
                });
                continue;
            }
            
            // Match BETWEEN condition: field BETWEEN ? AND ? (supports table alias)
            const betweenMatch = part.match(/([\w.]+)\s+BETWEEN\s+\?\s+AND\s+\?/i);
            if (betweenMatch) {
                conditions.push({
                    field: stripTableAlias(betweenMatch[1]),
                    operator: 'BETWEEN',
                    value: [params[paramIndex], params[paramIndex + 1]]
                });
                paramIndex += 2;
                continue;
            }
            
            // Match conditions with ? placeholders (supports table alias)
            const condMatch = part.match(/([\w.]+)\s*(=|LIKE|>=|<=|>|<)\s*\?/i);
            if (condMatch) {
                conditions.push({
                    field: stripTableAlias(condMatch[1]),
                    operator: condMatch[2].toUpperCase(),
                    value: params[paramIndex]
                });
                paramIndex += 1;
                continue;
            }
            // Match conditions with string literals like role = 'warehouse' (supports table alias)
            const literalMatch = part.match(/([\w.]+)\s*=\s*'([^']+)'/i);
            if (literalMatch) {
                conditions.push({
                    field: stripTableAlias(literalMatch[1]),
                    operator: '=',
                    value: literalMatch[2]
                });
                continue;
            }
            
            // Match conditions with numeric literals like is_active = 1 (supports table alias)
            const numericMatch = part.match(/([\w.]+)\s*=\s*(\d+(?:\.\d+)?)/i);
            if (numericMatch) {
                conditions.push({
                    field: stripTableAlias(numericMatch[1]),
                    operator: '=',
                    value: parseFloat(numericMatch[2])
                });
                continue;
            }
        }

        if (tokens.length > 1) {
            connector = String(tokens[1]).toUpperCase();
        }
    }

    return {
        table,
        select,
        conditions,
        connector,
        limit: limitMatch ? parseInt(limitMatch[1], 10) : null,
        offset: offsetMatch ? parseInt(offsetMatch[1], 10) : null,
        orderBy: orderMatch ? { field: orderMatch[1], direction: (orderMatch[2] || 'ASC').toUpperCase() } : null
    };
}

function parseCountAlias(selectClause = '') {
    const match = String(selectClause).match(/COUNT\(\s*\*\s*\)\s*(?:AS\s+)?(\w+)?/i);
    if (!match) return null;
    return match[1] || 'count';
}

function splitSqlList(input = '') {
    const parts = [];
    let current = '';
    let inSingleQuote = false;
    let parenDepth = 0;

    for (let i = 0; i < input.length; i += 1) {
        const ch = input[i];

        if (ch === "'" && input[i - 1] !== '\\') {
            // Handle escaped single quote in SQL ('')
            if (inSingleQuote && input[i + 1] === "'") {
                current += "''";
                i += 1;
                continue;
            }
            inSingleQuote = !inSingleQuote;
            current += ch;
            continue;
        }

        if (!inSingleQuote) {
            if (ch === '(') parenDepth += 1;
            if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
            if (ch === ',' && parenDepth === 0) {
                parts.push(current.trim());
                current = '';
                continue;
            }
        }

        current += ch;
    }

    if (current.trim()) parts.push(current.trim());
    return parts;
}

function parseSqlLiteral(expr) {
    if (expr === undefined || expr === null) return undefined;
    const text = String(expr).trim();
    if (!text) return undefined;

    if (/^null$/i.test(text)) return null;
    if (/^current_timestamp$/i.test(text)) return new Date().toISOString();
    if (/^date\(\s*["']now["']\s*\)$/i.test(text)) return new Date().toISOString().slice(0, 10);
    if (/^(true|false)$/i.test(text)) return /^true$/i.test(text);
    if (/^[-+]?\d+(\.\d+)?$/.test(text)) return Number(text);

    const quoted = text.match(/^'(.*)'$/s);
    if (quoted) {
        return quoted[1].replace(/''/g, "'");
    }

    return undefined;
}

function applyFilters(query, parsed) {
    const { conditions, connector } = parsed;

    if (!conditions.length) return query;

    if (connector === 'OR') {
        const orParts = conditions.map((c) => {
            if (c.operator === 'LIKE') return `${c.field}.ilike.${c.value}`;
            return `${c.field}.eq.${c.value}`;
        });

        return query.or(orParts.join(','));
    }

    for (const condition of conditions) {
        switch (condition.operator) {
            case 'LIKE':
                query = query.ilike(condition.field, condition.value);
                break;
            case 'IS NOT NULL':
                query = query.not(condition.field, 'is', null);
                break;
            case 'IS NULL':
                query = query.is(condition.field, null);
                break;
            case 'BETWEEN':
                // value is an array [min, max]
                query = query.gte(condition.field, condition.value[0]);
                query = query.lte(condition.field, condition.value[1]);
                break;
            case '>=':
                query = query.gte(condition.field, condition.value);
                break;
            case '<=':
                query = query.lte(condition.field, condition.value);
                break;
            case '>':
                query = query.gt(condition.field, condition.value);
                break;
            case '<':
                query = query.lt(condition.field, condition.value);
                break;
            default:
                query = query.eq(condition.field, condition.value);
        }
    }

    return query;
}

const db = {
    isSupabase: true,
    supabase,

    get(sql, params, callback) {
        const normalized = normalizeArgs(params, callback);

        const promise = (async () => {
            ensureSupabaseConfigured();
            const parsed = parseSql(sql, normalized.params);
            if (!parsed.table) throw new Error('Invalid table in query');

            const countAlias = parseCountAlias(parsed.select);
            if (countAlias) {
                let countQuery = supabase.from(parsed.table).select('*', { count: 'exact', head: true });
                countQuery = applyFilters(countQuery, parsed);

                const { count, error } = await countQuery;
                if (error) throw error;

                return { [countAlias]: count || 0 };
            }

            let query = supabase.from(parsed.table).select(parsed.select || '*');
            query = applyFilters(query, parsed);

            if (parsed.orderBy) {
                query = query.order(parsed.orderBy.field, { ascending: parsed.orderBy.direction !== 'DESC' });
            }

            if (parsed.limit !== null) {
                query = query.limit(parsed.limit);
            } else {
                query = query.limit(1);
            }

            const { data, error } = await query;
            if (error) throw error;

            return data && data.length ? data[0] : null;
        })();

        return withOptionalCallback(promise, normalized.callback);
    },

    all(sql, params, callback) {
        const normalized = normalizeArgs(params, callback);

        const promise = (async () => {
            ensureSupabaseConfigured();
            const parsed = parseSql(sql, normalized.params);
            if (!parsed.table) throw new Error('Invalid table in query');

            let query = supabase.from(parsed.table).select(parsed.select || '*');
            query = applyFilters(query, parsed);

            if (parsed.orderBy) {
                query = query.order(parsed.orderBy.field, { ascending: parsed.orderBy.direction !== 'DESC' });
            }

            if (parsed.offset !== null && parsed.limit !== null) {
                query = query.range(parsed.offset, parsed.offset + parsed.limit - 1);
            } else if (parsed.limit !== null) {
                query = query.limit(parsed.limit);
            }

            const { data, error } = await query;
            if (error) throw error;

            return data || [];
        })();

        return withOptionalCallback(promise, normalized.callback);
    },

    run(sql, params, callback) {
        const normalized = normalizeArgs(params, callback);

        const promise = (async () => {
            ensureSupabaseConfigured();
            const upperSql = sql.trim().toUpperCase();

            if (upperSql.startsWith('INSERT')) {
                const tableMatch = sql.match(/INTO\s+(\w+)/i);
                const colsMatch = sql.match(/\(([^)]+)\)\s*VALUES/i);
                const valuesMatch = sql.match(/VALUES\s*\(([\s\S]*?)\)\s*;?\s*$/i);

                if (!tableMatch || !colsMatch || !valuesMatch) throw new Error('Invalid INSERT query format');

                const table = tableMatch[1];
                const cols = colsMatch[1].split(',').map((c) => c.trim());
                const valueExprs = splitSqlList(valuesMatch[1]);
                if (valueExprs.length !== cols.length) {
                    throw new Error('INSERT columns/values length mismatch');
                }
                const data = {};
                let paramCursor = 0;

                cols.forEach((col, idx) => {
                    const expr = valueExprs[idx];
                    if (expr.includes('?')) {
                        data[col] = normalized.params[paramCursor];
                        paramCursor += 1;
                    } else {
                        data[col] = parseSqlLiteral(expr);
                    }
                });

                const { data: inserted, error } = await supabase.from(table).insert([data]).select('id');
                if (error) throw error;

                return { lastID: inserted?.[0]?.id, changes: inserted?.length || 1 };
            }

            if (upperSql.startsWith('UPDATE')) {
                const tableMatch = sql.match(/UPDATE\s+(\w+)/i);
                const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
                const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i);

                if (!tableMatch || !whereMatch || !setMatch) throw new Error('Invalid UPDATE query format');

                const table = tableMatch[1];
                const whereField = whereMatch[1];
                const whereValue = normalized.params[normalized.params.length - 1];
                const setCols = splitSqlList(setMatch[1]);
                const updateData = {};
                let paramCursor = 0;

                setCols.forEach((col, idx) => {
                    const [rawName, ...rawExprParts] = col.split('=');
                    const colName = rawName?.trim();
                    const expr = rawExprParts.join('=').trim();
                    if (!colName) return;

                    if (expr.includes('?')) {
                        if (normalized.params[paramCursor] !== undefined) {
                            updateData[colName] = normalized.params[paramCursor];
                        }
                        paramCursor += 1;
                        return;
                    }

                    const literalValue = parseSqlLiteral(expr);
                    if (literalValue !== undefined) {
                        updateData[colName] = literalValue;
                    }
                });

                const { error } = await supabase.from(table).update(updateData).eq(whereField, whereValue);
                if (error) throw error;

                return { changes: 1 };
            }

            if (upperSql.startsWith('DELETE')) {
                const tableMatch = sql.match(/FROM\s+(\w+)/i);
                const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);

                if (!tableMatch || !whereMatch) throw new Error('Invalid DELETE query format');

                const table = tableMatch[1];
                const whereField = whereMatch[1];
                const whereValue = normalized.params[0];

                const { error } = await supabase.from(table).delete().eq(whereField, whereValue);
                if (error) throw error;

                return { changes: 1 };
            }

            throw new Error('Unsupported query type for db.run');
        })();

        return withOptionalCallback(promise, normalized.callback);
    },

    serialize(callback) {
        if (callback) callback();
    },

    on() {
        // no-op for supabase client wrapper
    }
};

module.exports = db;
