/* ===========================================================
   invitationService.js
   Secure, single-use, expiring dependant account-setup tokens.

   Security model:
   - The raw token is 32 random bytes, base64url-encoded. It is the
     ONLY secret and is sent to the dependant exactly once (in the
     setup link). It is NEVER stored.
   - The database stores only SHA-256(rawToken) in tokenHash, so a DB
     leak cannot be used to reconstruct a working link.
   - A token is valid only while status = 'pending' AND expiresAt is in
     the future. Consuming it flips status to 'used' (single use).
   - Issuing a new invitation (create or resend) marks every prior
     'pending' invitation for that dependant 'superseded', so only the
     latest link ever works.

   Requires migration 011-dependant-invitations.sql.
=========================================================== */

'use strict';

const crypto = require('crypto');
const { query, getPool, sql } = require('../db');
const { appBaseUrl } = require('./emailService');

// How long a new invitation stays valid. Configurable via env (hours).
function _expiryHours() {
    const h = parseInt(process.env.INVITE_EXPIRY_HOURS, 10);
    return (isFinite(h) && h > 0) ? h : 72; // default 72h (3 days)
}

function _generateRawToken() {
    return crypto.randomBytes(32).toString('base64url');
}

function _hashToken(raw) {
    return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

/** Build the public setup URL the dependant clicks. */
function buildSetupUrl(rawToken) {
    return `${appBaseUrl()}/pages/setup-account.html?token=${encodeURIComponent(rawToken)}`;
}

/**
 * Issue a fresh invitation for a dependant, superseding any previous
 * pending ones. Runs in a transaction so the supersede + insert are atomic.
 * Returns { rawToken, expiresAt, invitationID }.
 *
 * @param {number} dependantID
 * @param {number} mainMemberID
 * @param {string} email snapshot of the dependant's email
 */
async function issueInvitation(dependantID, mainMemberID, email) {
    const rawToken = _generateRawToken();
    const tokenHash = _hashToken(rawToken);
    const expiresAt = new Date(Date.now() + _expiryHours() * 3600 * 1000);

    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
        // Supersede any still-pending invitations for this dependant so their
        // old links stop working the moment a new one is issued.
        await new sql.Request(tx)
            .input('did', dependantID)
            .query(`UPDATE DependantInvitation
                    SET status = 'superseded'
                    WHERE dependantID = @did AND status = 'pending'`);

        const ins = await new sql.Request(tx)
            .input('did', dependantID)
            .input('mid', mainMemberID)
            .input('hash', tokenHash)
            .input('email', email)
            .input('exp', expiresAt)
            .query(`INSERT INTO DependantInvitation
                        (dependantID, mainMemberID, tokenHash, email, status, expiresAt)
                    OUTPUT INSERTED.invitationID
                    VALUES (@did, @mid, @hash, @email, 'pending', @exp)`);

        await tx.commit();
        return { rawToken, expiresAt, invitationID: ins.recordset[0].invitationID };
    } catch (err) {
        try { await tx.rollback(); } catch (_) { /* ignore */ }
        throw err;
    }
}

/**
 * Validate a raw token WITHOUT consuming it. Expires stale pending rows
 * lazily (marks them 'expired') so statuses stay accurate.
 * Returns { valid, reason?, invitation? }.
 *   reason: 'not_found' | 'expired' | 'used' | 'superseded'
 */
async function validateToken(rawToken) {
    if (!rawToken) return { valid: false, reason: 'not_found' };
    const tokenHash = _hashToken(rawToken);

    const r = await query(`
        SELECT i.invitationID, i.dependantID, i.mainMemberID, i.email, i.status, i.expiresAt,
               s.firstName, s.lastName, s.phone, s.dateOfBirth, s.onboardingComplete
        FROM DependantInvitation i
        JOIN Subscriber s ON s.subscriberID = i.dependantID
        WHERE i.tokenHash = @hash
    `, { hash: tokenHash });

    if (r.recordset.length === 0) return { valid: false, reason: 'not_found' };
    const inv = r.recordset[0];

    if (inv.status === 'used') return { valid: false, reason: 'used', invitation: inv };
    if (inv.status === 'superseded') return { valid: false, reason: 'superseded', invitation: inv };

    if (new Date(inv.expiresAt).getTime() <= Date.now()) {
        // Lazily record expiry.
        if (inv.status === 'pending') {
            await query(`UPDATE DependantInvitation SET status = 'expired' WHERE invitationID = @id`,
                { id: inv.invitationID });
        }
        return { valid: false, reason: 'expired', invitation: inv };
    }

    if (inv.status !== 'pending') return { valid: false, reason: inv.status, invitation: inv };

    return { valid: true, invitation: inv };
}

/**
 * Atomically consume a token inside an existing transaction request factory.
 * Returns true if it was consumed, false if it was no longer valid (race).
 * @param {object} tx mssql Transaction
 * @param {number} invitationID
 */
async function consumeTokenTx(tx, invitationID) {
    const res = await new sql.Request(tx)
        .input('id', invitationID)
        .query(`UPDATE DependantInvitation
                SET status = 'used', usedAt = GETDATE()
                WHERE invitationID = @id AND status = 'pending' AND expiresAt > GETDATE()`);
    const affected = (res.rowsAffected && res.rowsAffected[0]) || 0;
    return affected > 0;
}

/**
 * Derive a human-readable invitation status for the dependant management UI.
 * Looks at the latest invitation plus the account's own status.
 * Returns one of: 'Account Activated', 'Invitation Expired',
 *                 'Invitation Pending', 'Invitation Sent', 'No Invitation'.
 */
async function getInvitationStatus(dependantID, accountStatus) {
    if (accountStatus === 'active') return 'Account Activated';

    const r = await query(`
        SELECT TOP 1 status, expiresAt
        FROM DependantInvitation
        WHERE dependantID = @did
        ORDER BY createdAt DESC
    `, { did: dependantID });

    if (r.recordset.length === 0) return 'No Invitation';
    const inv = r.recordset[0];

    if (inv.status === 'used') return 'Account Activated';
    if (inv.status === 'expired') return 'Invitation Expired';
    if (inv.status === 'pending') {
        if (new Date(inv.expiresAt).getTime() <= Date.now()) return 'Invitation Expired';
        return 'Invitation Pending';
    }
    if (inv.status === 'superseded') return 'Invitation Pending';
    return 'Invitation Sent';
}

module.exports = {
    issueInvitation,
    validateToken,
    consumeTokenTx,
    getInvitationStatus,
    buildSetupUrl,
    _hashToken
};
