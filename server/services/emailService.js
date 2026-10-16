/* ===========================================================
   emailService.js
   Lightweight, dependency-optional email sender for FlexScribe.

   Design goals:
   - Works WITHOUT any external configuration in development: if no
     SMTP transport is configured (or nodemailer is not installed),
     the email is "delivered" to the server console and an append-only
     dev log (server/_sent-emails.log). This keeps the invitation flow
     fully functional end-to-end for testing while being obvious that
     real mail was not sent.
   - Uses real SMTP via nodemailer when SMTP_* env vars are set AND the
     optional `nodemailer` package is installed.

   Configuration (server/.env) — all optional:
     SMTP_HOST, SMTP_PORT, SMTP_SECURE (true/false),
     SMTP_USER, SMTP_PASS, SMTP_FROM
     APP_BASE_URL   public base URL used to build setup links
                    (e.g. http://localhost:3000)

   Returns a result object { sent, transport, messageId?, error? } and
   NEVER throws for a delivery failure — callers decide how to surface it.
=========================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const DEV_LOG = path.join(__dirname, '..', '_sent-emails.log');

/** Lazily build a nodemailer transport if configured + available. */
let _transport = null;
let _transportResolved = false;

function _getTransport() {
    if (_transportResolved) return _transport;
    _transportResolved = true;

    const host = process.env.SMTP_HOST;
    if (!host) { _transport = null; return null; }

    let nodemailer;
    try {
        nodemailer = require('nodemailer');
    } catch (e) {
        console.warn('[email] SMTP_HOST is set but the "nodemailer" package is not installed. '
            + 'Run `npm install nodemailer` in the server folder, or leave SMTP unset to use dev logging.');
        _transport = null;
        return null;
    }

    _transport = nodemailer.createTransport({
        host,
        port: parseInt(process.env.SMTP_PORT, 10) || 587,
        secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
        auth: (process.env.SMTP_USER && process.env.SMTP_PASS)
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            : undefined
    });
    return _transport;
}

/** The address shown in the From header. */
function _from() {
    return process.env.SMTP_FROM || 'FlexScribe <no-reply@flexscribe.app>';
}

/**
 * Send an email. Falls back to dev logging when SMTP is not configured.
 * @param {{to:string, subject:string, text:string, html?:string}} msg
 * @returns {Promise<{sent:boolean, transport:string, messageId?:string, error?:string}>}
 */
async function sendEmail(msg) {
    const to = (msg && msg.to || '').trim();
    const subject = (msg && msg.subject) || '(no subject)';
    const text = (msg && msg.text) || '';
    const html = (msg && msg.html) || undefined;

    if (!to) return { sent: false, transport: 'none', error: 'No recipient address.' };

    const transport = _getTransport();

    if (!transport) {
        // Dev fallback — record the message so the flow is testable.
        const entry =
            `\n===== EMAIL (dev log, NOT actually sent) ${new Date().toISOString()} =====\n`
            + `To: ${to}\nSubject: ${subject}\n\n${text}\n`
            + `=========================================================\n`;
        try { fs.appendFileSync(DEV_LOG, entry); } catch (_) { /* best effort */ }
        console.log(`[email:dev] To ${to} — "${subject}". Body logged to server/_sent-emails.log`);
        return { sent: true, transport: 'dev-log' };
    }

    try {
        const info = await transport.sendMail({ from: _from(), to, subject, text, html });
        return { sent: true, transport: 'smtp', messageId: info.messageId };
    } catch (err) {
        console.error('[email] SMTP send failed:', err.message);
        return { sent: false, transport: 'smtp', error: err.message };
    }
}

/** Public base URL for building links in emails. */
function appBaseUrl() {
    return (process.env.APP_BASE_URL || 'http://localhost:' + (process.env.PORT || 3000)).replace(/\/+$/, '');
}

/**
 * Build + send a dependant account-setup invitation.
 * @param {{to:string, dependantName:string, mainMemberName:string, setupUrl:string, expiresAt:Date}} opts
 */
async function sendDependantInvitation(opts) {
    const { to, dependantName, mainMemberName, setupUrl, expiresAt } = opts;
    const name = dependantName || 'there';
    const inviter = mainMemberName || 'Your main member';
    const expiresText = expiresAt
        ? new Date(expiresAt).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
        : 'soon';

    const subject = 'You have been added to FlexScribe';
    const text =
        `Hi ${name},\n\n`
        + `${inviter} has created a FlexScribe account for you.\n\n`
        + `Account email: ${to}\n\n`
        + `To finish setting up your account, open the secure link below and choose a password:\n`
        + `${setupUrl}\n\n`
        + `This link can be used once and expires on ${expiresText}.\n`
        + `If the link expires, ask ${inviter} to resend your invitation.\n\n`
        + `If you were not expecting this email you can safely ignore it.\n\n`
        + `— The FlexScribe Team`;

    const html =
        `<p>Hi ${_esc(name)},</p>`
        + `<p><strong>${_esc(inviter)}</strong> has created a FlexScribe account for you.</p>`
        + `<p><strong>Account email:</strong> ${_esc(to)}</p>`
        + `<p>To finish setting up your account, click the secure button below and choose a password:</p>`
        + `<p><a href="${_esc(setupUrl)}" style="background:#FF7A29;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Set up my account</a></p>`
        + `<p>Or paste this link into your browser:<br><a href="${_esc(setupUrl)}">${_esc(setupUrl)}</a></p>`
        + `<p style="color:#666;font-size:13px">This link can be used once and expires on ${_esc(expiresText)}. `
        + `If it expires, ask ${_esc(inviter)} to resend your invitation.</p>`
        + `<p style="color:#999;font-size:12px">If you were not expecting this email you can safely ignore it.</p>`;

    return sendEmail({ to, subject, text, html });
}

function _esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

module.exports = { sendEmail, sendDependantInvitation, appBaseUrl };
