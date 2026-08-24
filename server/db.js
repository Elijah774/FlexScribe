const sql = require('mssql');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const config = {
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'FlexScribeDB',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: 1433,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
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
