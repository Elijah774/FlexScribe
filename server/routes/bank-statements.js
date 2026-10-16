/* ===========================================================
   /api/bank-statements — Upload & parse bank statements
   Supports: CSV only (max 50 MB)
   SA bank formats: FNB, Standard Bank, Capitec, Nedbank
   Features: Smart column detection, subscription detection
=========================================================== */
const express = require('express');
const multer = require('multer');
const { query } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const scribeScore = require('../helpers/scribe-score');

const router = express.Router();
router.use(authenticateToken);

// CSV only, max 50 MB. The fileFilter rejects anything that isn't a .csv file.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const name = (file.originalname || '').toLowerCase();
        const okExt = name.endsWith('.csv');
        const okMime = /text\/csv|application\/vnd\.ms-excel|text\/plain|application\/csv|application\/octet-stream/.test(file.mimetype || '');
        if (okExt && okMime) return cb(null, true);
        if (okExt) return cb(null, true); // trust the extension if the browser sent an odd mimetype
        return cb(null, false); // reject non-CSV (surfaced as "No/invalid file" below)
    }
});

/* ===========================================================
   KNOWN SUBSCRIPTION SERVICES (for detection)
=========================================================== */
const KNOWN_SUBSCRIPTIONS = [
    'netflix', 'spotify', 'youtube', 'disney', 'showmax', 'apple music',
    'amazon prime', 'hulu', 'hbo', 'dstv', 'multichoice', 'supersport',
    'microsoft 365', 'microsoft office', 'adobe', 'canva', 'chatgpt', 'openai',
    'github', 'dropbox', 'google one', 'icloud', 'onedrive',
    'nordvpn', 'expressvpn', 'surfshark',
    'gym', 'virgin active', 'planet fitness', 'crossfit',
    'uber eats', 'mr delivery', 'takealot',
    'vodacom', 'mtn', 'telkom', 'cell c', 'rain',
    'discovery', 'momentum', 'liberty', 'sanlam', 'old mutual',
    'outsurance', 'santam', 'miway',
    'fnb', 'standard bank', 'capitec', 'nedbank', 'absa',
    'spotify sa', 'audible', 'kindle', 'scribd',
    'playstation', 'xbox', 'nintendo', 'steam',
    'notion', 'slack', 'zoom', 'grammarly', 'lastpass', '1password'
];

/* ===========================================================
   CSV PARSER — Smart column detection by header name
=========================================================== */
function _parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) return [];

    // Auto-detect delimiter: tab, comma, or semicolon
    const firstLine = lines[0];
    let delimiter = ',';
    if (firstLine.split('\t').length > firstLine.split(',').length) delimiter = '\t';
    else if (firstLine.split(';').length > firstLine.split(',').length) delimiter = ';';

    // Split respecting quoted fields
    function splitLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') { inQuotes = !inQuotes; continue; }
            if (ch === delimiter && !inQuotes) { result.push(current.trim()); current = ''; continue; }
            current += ch;
        }
        result.push(current.trim());
        return result;
    }

    // Detect header row — check first few lines for known header keywords
    const headerKeywords = ['date', 'description', 'amount', 'debit', 'credit', 'balance', 'reference', 'transaction', 'value', 'particulars', 'category'];
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(5, lines.length); i++) {
        const lower = lines[i].toLowerCase();
        const matches = headerKeywords.filter(kw => lower.includes(kw));
        if (matches.length >= 2) { headerRowIdx = i; break; }
    }

    const headerParts = headerRowIdx >= 0 ? splitLine(lines[headerRowIdx]).map(h => h.toLowerCase().replace(/[()]/g, '')) : [];

    // Find columns by header name (flexible matching)
    let dateIdx = headerParts.findIndex(h => /\bdate\b/.test(h));
    let descIdx = headerParts.findIndex(h => h.includes('description') || h.includes('particulars') || h.includes('details') || h.includes('narration'));
    let catIdx = headerParts.findIndex(h => h.includes('category') || h.includes('type'));
    let amtIdx = headerParts.findIndex(h => h.includes('amount') && !h.includes('balance'));
    let balIdx = headerParts.findIndex(h => h.includes('balance'));
    let debitIdx = headerParts.findIndex(h => h.includes('debit') || h.includes('money out') || h.includes('withdrawal'));
    let creditIdx = headerParts.findIndex(h => h.includes('credit') || h.includes('money in') || h.includes('deposit'));
    let refIdx = headerParts.findIndex(h => h.includes('reference') || h.includes('ref'));

    // Fallback positions if header detection failed
    if (dateIdx === -1) dateIdx = 0;
    if (descIdx === -1) descIdx = 1;
    if (amtIdx === -1 && debitIdx === -1) {
        // Try to find the first column with numeric data (after description)
        amtIdx = headerParts.length > 3 ? 3 : 2;
    }

    const startIdx = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;
    const transactions = [];
    let rowDate = ''; // Track last valid date for rows with ########

    for (let i = startIdx; i < lines.length; i++) {
        const parts = splitLine(lines[i]);
        if (parts.length < 2) continue;

        // Get date — handle ######## (Excel overflow) by using last known date or row index
        let date = (parts[dateIdx] || '').replace(/"/g, '').trim();
        if (date && !date.includes('#')) {
            rowDate = date; // Remember last valid date
        } else if (date.includes('#') || !date) {
            // Use last valid date, or generate a sequential one
            date = rowDate || ('Row ' + (i + 1));
        }

        // Get description
        const description = (parts[descIdx] || '').replace(/"/g, '').trim();
        if (!description) continue;

        // Get category (if available)
        const category = catIdx >= 0 ? (parts[catIdx] || '').replace(/"/g, '').trim() : '';

        // Get amount
        let amount = 0;
        if (amtIdx >= 0 && amtIdx < parts.length) {
            const rawAmt = (parts[amtIdx] || '').replace(/"/g, '').trim();
            amount = parseFloat(rawAmt.replace(/[^\d.\-]/g, '')) || 0;
        }
        if (amount === 0 && debitIdx >= 0) {
            const debit = parseFloat((parts[debitIdx] || '0').replace(/[^\d.\-]/g, '')) || 0;
            const credit = creditIdx >= 0 ? parseFloat((parts[creditIdx] || '0').replace(/[^\d.\-]/g, '')) || 0 : 0;
            amount = credit > 0 ? credit : -debit;
        }

        // Skip rows where we couldn't extract an amount
        if (amount === 0) continue;

        const tx = { date, description, amount };
        if (category) tx.category = category;
        transactions.push(tx);
    }
    return transactions;
}

/* ===========================================================
   PDF PARSER — SA bank format patterns
=========================================================== */
async function _parsePDF(buffer) {
    try {
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(buffer);
        const text = data.text || '';
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        const transactions = [];

        // Date patterns covering SA bank formats:
        const datePatterns = [
            /(\d{4}[\/-]\d{2}[\/-]\d{2})/,                          // 2025-07-15 or 2025/07/15
            /(\d{2}[\/-]\d{2}[\/-]\d{4})/,                          // 15/07/2025 or 15-07-2025
            /(\d{2}[\/-]\d{2}[\/-]\d{2})\b/,                        // 15/07/25
            /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i,  // 15 Jul 2025
            /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2})\b/i  // 15 Jul 25
        ];

        // Amount patterns:
        const amountPatterns = [
            /R?\s*(-?\d[\d\s,]*\.\d{2})/,                           // R1,234.56
            /(-?\d[\d\s.]*,\d{2})/,                                 // European: 1.234,56
            /(-?\d{1,3}(?:\s?\d{3})*[.,]\d{2})/                     // Spaced: 1 234.56
        ];

        for (const line of lines) {
            let dateMatch = null;
            for (const dp of datePatterns) {
                dateMatch = line.match(dp);
                if (dateMatch) break;
            }
            if (!dateMatch) continue;

            let amountMatch = null;
            for (const ap of amountPatterns) {
                const allMatches = [...line.matchAll(new RegExp(ap.source, 'g'))];
                if (allMatches.length > 0) {
                    amountMatch = allMatches[allMatches.length - 1];
                    break;
                }
            }
            if (!amountMatch) continue;

            const date = dateMatch[1].trim();
            let amtStr = amountMatch[1].replace(/\s/g, '').replace(/R/g, '');
            if (amtStr.includes(',') && !amtStr.includes('.')) {
                amtStr = amtStr.replace(',', '.');
            } else if (amtStr.includes(',') && amtStr.includes('.')) {
                amtStr = amtStr.replace(/,/g, '');
            }
            const amountValue = parseFloat(amtStr) || 0;
            if (amountValue === 0) continue;

            let desc = line;
            desc = desc.replace(dateMatch[0], '');
            desc = desc.replace(amountMatch[0], '');
            desc = desc.replace(/R?\s*-?\d[\d\s,]*[.,]\d{2}/g, '');
            desc = desc.replace(/^[\s,\-*|]+|[\s,\-*|]+$/g, '').trim();
            if (!desc) desc = 'Transaction';

            transactions.push({ date, description: desc, amount: amountValue });
        }

        // FALLBACK: If strict parsing found nothing, try a broader approach
        // Look for any line with a monetary amount and associate with nearby date
        if (transactions.length === 0) {
            let lastDate = '';
            for (const line of lines) {
                // Check if this line has a date
                for (const dp of datePatterns) {
                    const m = line.match(dp);
                    if (m) { lastDate = m[1]; break; }
                }
                // Look for amounts (R followed by digits, or standalone amounts)
                const amtMatch = line.match(/R\s*(\d[\d\s,]*\.\d{2})/);
                if (amtMatch && lastDate) {
                    let amt = parseFloat(amtMatch[1].replace(/[\s,]/g, '')) || 0;
                    if (amt === 0) continue;
                    // Determine if debit or credit from context
                    const lower = line.toLowerCase();
                    if (lower.includes('debit') || lower.includes('payment') || lower.includes('purchase') || lower.includes('withdrawal')) {
                        amt = -amt;
                    }
                    let desc = line.replace(amtMatch[0], '').replace(/R?\s*\d[\d\s,]*\.\d{2}/g, '').trim();
                    desc = desc.replace(/^[\s,\-*|]+|[\s,\-*|]+$/g, '').trim() || 'Transaction';
                    transactions.push({ date: lastDate, description: desc, amount: amt });
                }
            }
        }

        return transactions;
    } catch (e) {
        console.error('PDF parse error:', e.message);
        return [];
    }
}

/* ===========================================================
   XLSX PARSER — Smart column detection
=========================================================== */
function _parseXLSX(buffer) {
    try {
        const XLSX = require('xlsx');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        if (rows.length < 2) return [];

        // Find header row (might not be row 0 in bank exports)
        let headerRowIdx = 0;
        const headerKeywords = ['date', 'description', 'amount', 'debit', 'credit', 'reference', 'particulars'];
        for (let i = 0; i < Math.min(10, rows.length); i++) {
            const row = (rows[i] || []).map(c => String(c || '').toLowerCase());
            const matches = headerKeywords.filter(kw => row.some(cell => cell.includes(kw)));
            if (matches.length >= 2) { headerRowIdx = i; break; }
        }

        const header = (rows[headerRowIdx] || []).map(h => String(h || '').toLowerCase());
        let dateIdx = header.findIndex(h => /\bdate\b/.test(h));
        let descIdx = header.findIndex(h => h.includes('description') || h.includes('particulars') || h.includes('reference') || h.includes('details'));
        let amtIdx = header.findIndex(h => h === 'amount' || h.includes('transaction amount'));
        let debitIdx = header.findIndex(h => h.includes('debit') || h.includes('money out'));
        let creditIdx = header.findIndex(h => h.includes('credit') || h.includes('money in'));

        if (dateIdx === -1) dateIdx = 0;
        if (descIdx === -1) descIdx = 1;
        if (amtIdx === -1 && debitIdx === -1) amtIdx = 2;

        const transactions = [];
        for (let i = headerRowIdx + 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 3) continue;
            const date = String(row[dateIdx] || '').trim();
            const description = String(row[descIdx] || '').trim();
            let amount = 0;
            if (amtIdx >= 0) {
                amount = parseFloat(String(row[amtIdx] || '0').replace(/[^\d.\-]/g, '')) || 0;
            } else {
                const debit = debitIdx >= 0 ? parseFloat(String(row[debitIdx] || '0').replace(/[^\d.\-]/g, '')) || 0 : 0;
                const credit = creditIdx >= 0 ? parseFloat(String(row[creditIdx] || '0').replace(/[^\d.\-]/g, '')) || 0 : 0;
                amount = credit > 0 ? credit : -debit;
            }
            if (date && description && amount !== 0) transactions.push({ date, description, amount });
        }
        return transactions;
    } catch (e) {
        console.error('XLSX parse error:', e.message);
        return [];
    }
}

/* ===========================================================
   SUBSCRIPTION DETECTION
   Identifies recurring transactions by:
   1. Matching against known subscription service names
   2. Finding repeated merchants with similar amounts
=========================================================== */
function _detectSubscriptions(transactions) {
    const detected = [];
    const merchantMap = {}; // normalized description -> { count, amounts, dates }

    transactions.forEach(t => {
        if (t.amount >= 0) return; // Only look at debits (negative amounts)
        const desc = t.description.toLowerCase().trim();
        // Normalize: remove common bank prefixes
        const normalized = desc
            .replace(/^(pos\s*|debit\s*order\s*|recurring\s*|eft\s*|payment\s*to\s*|purchase\s*)/i, '')
            .replace(/\s*\d{4,}$/, '') // Remove trailing reference numbers
            .replace(/\s+/g, ' ')
            .trim();

        if (!normalized) return;

        if (!merchantMap[normalized]) merchantMap[normalized] = { count: 0, amounts: [], dates: [], originalDesc: t.description };
        merchantMap[normalized].count++;
        merchantMap[normalized].amounts.push(Math.abs(t.amount));
        merchantMap[normalized].dates.push(t.date);
    });

    // 1. Match against known subscription services
    for (const [merchant, data] of Object.entries(merchantMap)) {
        const isKnown = KNOWN_SUBSCRIPTIONS.some(sub => merchant.includes(sub) || sub.includes(merchant));
        if (isKnown) {
            const avgAmount = data.amounts.reduce((s, a) => s + a, 0) / data.amounts.length;
            detected.push({
                name: data.originalDesc,
                matchType: 'known_service',
                occurrences: data.count,
                averageAmount: Math.round(avgAmount * 100) / 100,
                dates: data.dates,
                confidence: 'high'
            });
        }
    }

    // 2. Find recurring transactions (same merchant, 2+ times, similar amounts)
    for (const [merchant, data] of Object.entries(merchantMap)) {
        // Skip if already flagged as known
        const alreadyDetected = detected.some(d => d.name === data.originalDesc);
        if (alreadyDetected) continue;

        if (data.count >= 2) {
            // Check if amounts are similar (within 10% of average)
            const avg = data.amounts.reduce((s, a) => s + a, 0) / data.amounts.length;
            const allSimilar = data.amounts.every(a => Math.abs(a - avg) / avg < 0.1);
            if (allSimilar) {
                detected.push({
                    name: data.originalDesc,
                    matchType: 'recurring_pattern',
                    occurrences: data.count,
                    averageAmount: Math.round(avg * 100) / 100,
                    dates: data.dates,
                    confidence: data.count >= 3 ? 'high' : 'medium'
                });
            }
        }
    }

    return detected.sort((a, b) => b.averageAmount - a.averageAmount);
}

/* ===========================================================
   ANALYZE TRANSACTIONS
=========================================================== */
function _analyze(transactions) {
    let totalIncome = 0, totalExpenses = 0;
    transactions.forEach(t => {
        if (t.amount > 0) totalIncome += t.amount;
        else totalExpenses += Math.abs(t.amount);
    });
    const netCashFlow = totalIncome - totalExpenses;
    let financialStatus = 'safe';
    if (totalIncome > 0) {
        const rate = netCashFlow / totalIncome;
        if (rate < 0) financialStatus = 'danger';
        else if (rate < 0.2) financialStatus = 'warning';
    } else if (totalExpenses > 0) financialStatus = 'danger';

    const dates = transactions.map(t => t.date).filter(Boolean).sort();

    // Detect subscriptions
    const subscriptions = _detectSubscriptions(transactions);
    const subscriptionTotal = subscriptions.reduce((s, sub) => s + sub.averageAmount, 0);

    return {
        totalIncome: Math.round(totalIncome * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        netCashFlow: Math.round(netCashFlow * 100) / 100,
        transactionCount: transactions.length,
        financialStatus,
        periodStart: dates[0] || null,
        periodEnd: dates[dates.length - 1] || null,
        transactions,
        subscriptionsDetected: subscriptions,
        subscriptionCount: subscriptions.length,
        subscriptionMonthlyTotal: Math.round(subscriptionTotal * 100) / 100
    };
}

/* ----------------------------------------------------------
   POST /api/bank-statements/upload
---------------------------------------------------------- */
// Wrap multer so size/type errors return clean JSON (not a generic 500).
function _uploadMiddleware(req, res, next) {
    upload.single('statement')(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ success: false, message: 'File too large. Max 50MB.' });
            }
            return res.status(400).json({ success: false, message: 'Only CSV files are accepted.' });
        }
        next();
    });
}

router.post('/upload', _uploadMiddleware, async (req, res) => {
    try {
        // multer's fileFilter rejects non-CSV files (req.file is then undefined).
        if (!req.file) return res.status(400).json({ success: false, message: 'Only CSV files are accepted.' });
        const ext = (req.file.originalname || '').split('.').pop().toLowerCase();
        if (ext !== 'csv') {
            return res.status(400).json({ success: false, message: 'Only CSV files are accepted.' });
        }

        // Enforce the yearly upload cap BEFORE doing any work.
        const uploadsThisYear = await scribeScore.bankUploadsThisYear(req.user.subscriberID);
        if (uploadsThisYear >= scribeScore.BANK_UPLOADS_PER_YEAR) {
            return res.status(429).json({
                success: false,
                message: `You can only upload ${scribeScore.BANK_UPLOADS_PER_YEAR} bank statements per year. You've used both for ${new Date().getFullYear()}.`
            });
        }

        // Parse the CSV file.
        const transactions = _parseCSV(req.file.buffer.toString('utf-8'));

        if (transactions.length === 0) {
            return res.status(422).json({ success: false, message: 'Could not extract transactions from the file. Please check the format.' });
        }

        const report = _analyze(transactions);

        // Store in BankStatement
        await query(`
            INSERT INTO BankStatement (subscriberID, uploadDate, fileReference, statementPeriodStart, statementPeriodEnd, totalIncome, totalExpenses, netCashFlow, transactionCount, parsedData, financialStatus)
            VALUES (@id, GETDATE(), @file, @start, @end, @income, @expenses, @net, @count, @data, @status)
        `, {
            id: req.user.subscriberID,
            file: req.file.originalname,
            start: report.periodStart,
            end: report.periodEnd,
            income: report.totalIncome,
            expenses: report.totalExpenses,
            net: report.netCashFlow,
            count: report.transactionCount,
            data: JSON.stringify({ transactions: report.transactions, subscriptions: report.subscriptionsDetected }),
            status: report.financialStatus
        });

        // Award +50 ScribeScore for this upload (idempotent per allowed slot
        // this year). uploadsThisYear was the count BEFORE this insert, so
        // this upload is slot (uploadsThisYear + 1): 1 or 2.
        const award = await scribeScore.awardBankUpload(req.user.subscriberID, uploadsThisYear + 1);

        res.status(201).json({
            success: true,
            data: {
                totalIncome: report.totalIncome,
                totalExpenses: report.totalExpenses,
                netCashFlow: report.netCashFlow,
                transactionCount: report.transactionCount,
                financialStatus: report.financialStatus,
                periodStart: report.periodStart,
                periodEnd: report.periodEnd,
                subscriptionsDetected: report.subscriptionsDetected,
                subscriptionCount: report.subscriptionCount,
                subscriptionMonthlyTotal: report.subscriptionMonthlyTotal,
                scribeScoreBonus: scribeScore.POINTS.BANK_UPLOAD,
                scribeScore: award.score,
                uploadsRemaining: Math.max(0, scribeScore.BANK_UPLOADS_PER_YEAR - (uploadsThisYear + 1))
            }
        });
    } catch (error) {
        console.error('Bank statement upload error:', error);
        res.status(500).json({ success: false, message: 'Could not process bank statement: ' + error.message });
    }
});

/* ----------------------------------------------------------
   GET /api/bank-statements/report
---------------------------------------------------------- */
router.get('/report', async (req, res) => {
    try {
        const result = await query(`
            SELECT TOP 1 statementID, uploadDate, fileReference, statementPeriodStart, statementPeriodEnd, totalIncome, totalExpenses, netCashFlow, transactionCount, parsedData, financialStatus
            FROM BankStatement WHERE subscriberID = @id ORDER BY uploadDate DESC
        `, { id: req.user.subscriberID });

        if (result.recordset.length === 0) return res.json({ success: true, data: null });

        const row = result.recordset[0];
        let parsedData = { transactions: [], subscriptions: [] };
        try {
            const raw = JSON.parse(row.parsedData || '{}');
            if (Array.isArray(raw)) parsedData = { transactions: raw, subscriptions: [] };
            else parsedData = raw;
        } catch (e) {}

        res.json({
            success: true,
            data: {
                statementID: row.statementID,
                uploadDate: row.uploadDate ? new Date(row.uploadDate).toISOString().slice(0, 10) : null,
                fileReference: row.fileReference,
                periodStart: row.statementPeriodStart ? new Date(row.statementPeriodStart).toISOString().slice(0, 10) : null,
                periodEnd: row.statementPeriodEnd ? new Date(row.statementPeriodEnd).toISOString().slice(0, 10) : null,
                totalIncome: parseFloat(row.totalIncome) || 0,
                totalExpenses: parseFloat(row.totalExpenses) || 0,
                netCashFlow: parseFloat(row.netCashFlow) || 0,
                transactionCount: row.transactionCount || 0,
                financialStatus: row.financialStatus || 'unknown',
                transactions: parsedData.transactions || [],
                subscriptionsDetected: parsedData.subscriptions || []
            }
        });
    } catch (error) {
        console.error('Bank statement report error:', error);
        res.status(500).json({ success: false, message: 'Could not retrieve report' });
    }
});

module.exports = router;
