/* ===========================================================
   db.js — FlexScribe database connection
   Supports two modes selected by .env:
     Windows Auth (DB_USER blank)  — msnodesqlv8 via Shared Memory
     SQL Server Auth (DB_USER set) — mssql standard driver via TCP
=========================================================== */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const useWindowsAuth = !process.env.DB_USER || process.env.DB_USER.trim() === '';

const DB_SERVER   = process.env.DB_SERVER || 'localhost';
const DB_NAME     = process.env.DB_NAME   || 'FlexScribeDB';

/* ----------------------------------------------------------
   WINDOWS AUTH PATH — msnodesqlv8 direct (no mssql wrapper)
   Uses Shared Memory (lpc:) so TCP/IP does not need to be
   enabled on the SQL Server instance.
---------------------------------------------------------- */
let sql, getPool, query;

if (useWindowsAuth) {
    console.log('[db] Using Windows Authentication (Shared Memory / lpc)');

    const msnodesqlv8 = require('msnodesqlv8');
    const CONN_STR =
        `Driver={ODBC Driver 17 for SQL Server};` +
        `Server=lpc:${DB_SERVER};` +
        `Database=${DB_NAME};` +
        `Trusted_Connection=yes;` +
        `TrustServerCertificate=yes;`;

    let _pool = null;   // msnodesqlv8 connection object (reused)

    // Minimal sql type shim — msnodesqlv8 is untyped so we just pass values
    sql = { Int: null, VarChar: () => null, Decimal: () => null, NVarChar: () => null,
            Date: null, Bit: null, MAX: 'MAX', BigInt: null, Float: null };

    getPool = () => new Promise((resolve, reject) => {
        if (_pool) return resolve(_pool);
        msnodesqlv8.open(CONN_STR, (err, con) => {
            if (err) return reject(err);
            _pool = con;
            console.log('✓ Connected to SQL Server:', DB_NAME);
            resolve(_pool);
        });
    });

    // query(sqlStr, params) — params is { key: value } object
    // msnodesqlv8 uses ? positional params; we replace @name with ? in order
    query = async (queryStr, params = {}) => {
        const con = await getPool();

        // Replace named @params with ? in declaration order, build values array
        const values = [];
        let sql_str = queryStr.replace(/@(\w+)/g, (_, name) => {
            if (Object.prototype.hasOwnProperty.call(params, name)) {
                values.push(params[name] !== undefined ? params[name] : null);
            } else {
                values.push(null);
            }
            return '?';
        });

        return new Promise((resolve, reject) => {
            con.query(sql_str, values, (err, rows) => {
                if (err) return reject(err);
                // Wrap in mssql-compatible shape: { recordset: [...] }
                resolve({ recordset: rows || [] });
            });
        });
    };

} else {
    /* --------------------------------------------------------
       SQL SERVER AUTH PATH — standard mssql driver via TCP
       Used on remote machines or when TCP/IP is enabled.
    -------------------------------------------------------- */
    console.log('[db] Using SQL Server Authentication');

    const mssql = require('mssql');
    sql = mssql;

    const config = {
        server: DB_SERVER,
        database: DB_NAME,
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: 1433,
        options: {
            encrypt: false,
            trustServerCertificate: true,
            enableArithAbort: true
        },
        pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
    };

    let _pool = null;

    getPool = async () => {
        if (!_pool) {
            _pool = await mssql.connect(config);
            console.log('✓ Connected to SQL Server:', DB_NAME);
        }
        return _pool;
    };

    query = async (queryStr, params = {}) => {
        const p = await getPool();
        const request = p.request();
        Object.entries(params).forEach(([key, val]) => {
            request.input(key, val);
        });
        return request.query(queryStr);
    };
}

module.exports = { sql, getPool, query };
