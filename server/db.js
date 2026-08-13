/* ===========================================================
   db.js — SQL Server connection pool using mssql package
   Uses Windows Authentication (trusted connection) by default.
=========================================================== */
const sql = require('mssql');
require('dotenv').config();

const config = {
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'FlexScribeDB',
    options: {
        encrypt: false,             // Not needed for local dev
        trustServerCertificate: true,
        enableArithAbort: true
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

// Windows Authentication (trusted connection)
if (process.env.DB_TRUSTED === 'true') {
    config.authentication = {
        type: 'ntlm',
        options: {
            domain: '',
            userName: '',
            password: ''
        }
    };
    // For Windows Auth with mssql, we use integratedSecurity
    config.options.trustedConnection = true;
} else {
    // SQL Server Authentication
    config.user = process.env.DB_USER;
    config.password = process.env.DB_PASSWORD;
}

let pool = null;

async function getPool() {
    if (!pool) {
        pool = await sql.connect(config);
        console.log('✓ Connected to SQL Server:', process.env.DB_NAME);
    }
    return pool;
}

async function query(queryStr, params = {}) {
    const p = await getPool();
    const request = p.request();
    // Bind parameters
    Object.entries(params).forEach(([key, val]) => {
        request.input(key, val);
    });
    return request.query(queryStr);
}

module.exports = { sql, getPool, query };
