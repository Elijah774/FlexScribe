/**
 * BACKUP: Original remote/Windows Authentication database configuration
 * 
 * This file preserves the original db.js implementation that used
 * Windows Authentication (trustedConnection) via mssql/msnodesqlv8.
 * 
 * To restore this configuration:
 * 1. Copy this file's contents back to db.js
 * 2. Update .env to set DB_TRUSTED=true and remove DB_USER/DB_PASSWORD
 * 3. Ensure the mssql/msnodesqlv8 package is installed
 * 
 * Original .env settings:
 *   DB_SERVER=localhost
 *   DB_NAME=FlexScribeDB
 *   DB_TRUSTED=true
 */

const sql = require('mssql/msnodesqlv8');
require('dotenv').config();

const config = {
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'FlexScribeDB',
    options: {
        trustedConnection: true,
        trustServerCertificate: true,
        encrypt: false
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

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

    Object.entries(params).forEach(([key, val]) => {
        request.input(key, val);
    });

    return request.query(queryStr);
}

module.exports = { sql, getPool, query };
