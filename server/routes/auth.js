/* ===========================================================
   /api/auth — Register, Login, Profile
=========================================================== */
const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { authenticateToken, generateToken } = require('../middleware/auth');
const { updateUserAnalytics } = require('../helpers/update-analytics');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { firstName, lastName, email, password, phone, marketingOptIn, marketing, dob, termsAccepted } = req.body;

        if (!firstName || !lastName || !email || !password) {
            return res.status(400).json({ error: 'First name, last name, email, and password are required.' });
        }

        // Password must meet all five strength criteria:
        // >= 8 chars, uppercase, lowercase, number, special character.
        const STRONG_PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$/;
        if (!STRONG_PASSWORD_RE.test(password)) {
            return res.status(400).json({
                error: 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.'
            });
        }

        // Terms must be accepted to create an account
        if (!termsAccepted) {
            return res.status(400).json({ error: 'You must accept the Terms to create an account.' });
        }

        // Normalise marketing opt-in (client may send either `marketing` or `marketingOptIn`)
        const marketingOptInValue = (marketingOptIn ?? marketing) ? 1 : 0;

        // Normalise the email (trim + lowercase) for consistent, case-insensitive
        // storage and uniqueness.
        const normEmail = String(email).trim().toLowerCase();

        // Validate email FORMAT properly (not just presence of '@').
        const EMAIL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;
        if (!EMAIL_RE.test(normEmail) || normEmail.length > 254) {
            return res.status(400).json({ error: 'Please enter a valid email address, for example, name@example.com.' });
        }

        // Check if email exists (case-insensitive)
        const existing = await query('SELECT subscriberID FROM Subscriber WHERE LOWER(email) = @email', { email: normEmail });
        if (existing.recordset.length > 0) {
            return res.status(409).json({ error: 'This email address is already registered. Please use a different email address.' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Insert subscriber (include dateOfBirth if provided)
        const result = await query(`
            INSERT INTO Subscriber (firstName, lastName, email, passwordHash, phone, marketingOptIn, dateOfBirth, termsAcceptedAt, accentColor, avatarUrl, scribeScore)
            OUTPUT INSERTED.subscriberID
            VALUES (@firstName, @lastName, @email, @passwordHash, @phone, @marketingOptIn, @dateOfBirth, SYSUTCDATETIME(), @accentColor, @avatarUrl, 500)
        `, { firstName, lastName, email: normEmail, passwordHash, phone: phone || null, marketingOptIn: marketingOptInValue, dateOfBirth: dob || null, accentColor: '#FF8A34', avatarUrl: null });

        const subscriberID = result.recordset[0].subscriberID;

        // Create MainMember record
        await query('INSERT INTO MainMember (mainMemberID) VALUES (@id)', { id: subscriberID });

        // Create wallet with unique card number
        const cardNumber = '4' + Array.from({length: 15}, () => Math.floor(Math.random() * 10)).join('');
        await query('INSERT INTO VirtualWallet (subscriberID, cardNumber) VALUES (@id, @card)', { id: subscriberID, card: cardNumber });

        // Create initial ScribeScore entry
        await query('INSERT INTO ScribeScore (subscriberID, scoreValue) VALUES (@id, 500)', { id: subscriberID });

        // Generate token
        const token = generateToken({ subscriberID, email: normEmail, userType: 'MainMember' });

        res.status(201).json({
            message: 'Account created successfully',
            token,
            user: { subscriberID, firstName, lastName, email: normEmail, userType: 'MainMember' }
        });
        updateUserAnalytics(subscriberID);
    } catch (err) {
        if (err.message && (err.message.includes('UQ_Subscriber_Email') || err.message.includes('UNIQUE KEY'))) {
            return res.status(409).json({ error: 'This email address is already registered. Please use a different email address.' });
        }
        console.error('Register error:', err);
        res.status(500).json({ error: 'Server error during registration.' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const normEmail = String(email).trim().toLowerCase();
        const result = await query(`
            SELECT * FROM Subscriber WHERE LOWER(email) = @email
        `, { email: normEmail });

        if (result.recordset.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const user = result.recordset[0];
        const validPassword = await bcrypt.compare(password, user.passwordHash);

        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // An invited dependant who has not completed account setup cannot log
        // in with a password (they have none they know). They must use their
        // invitation link. onboardingComplete gates this.
        if ((user.userType === 'Dependant' || user.userType === 'dependant') && user.onboardingComplete === false) {
            return res.status(403).json({ error: 'Please finish setting up your account using the invitation link we emailed you.' });
        }

        const token = generateToken({ subscriberID: user.subscriberID, email: user.email, userType: user.userType });

        res.json({
            message: 'Login successful',
            token,
            user: {
                subscriberID: user.subscriberID,
                firstName: user.firstName,
                lastName: user.lastName,
                preferredName: user.preferredName || null,
                email: user.email,
                userType: user.userType,
                avatarUrl: user.avatarUrl || null,
                mustChangePassword: user.mustChangePassword === true || user.mustChangePassword === 1,
                isAdmin: user.userType === 'Admin'
            },
            isAdmin: user.userType === 'Admin'
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error during login.' });
    }
});

// GET /api/auth/profile
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const sid = parseInt(req.user.subscriberID);
        if (!sid) return res.status(400).json({ error: 'Invalid subscriber ID' });

        const result = await query(`
            SELECT * FROM Subscriber WHERE subscriberID = @id
        `, { id: sid });

        if (result.recordset.length === 0) return res.status(404).json({ error: 'User not found' });

        // Remove passwordHash from response
        const user = result.recordset[0];
        delete user.passwordHash;
        res.json(user);
    } catch (err) {
        console.error('Profile error:', err.message);
        res.status(500).json({ error: 'Profile query failed: ' + err.message });
    }
});

// PUT /api/auth/profile
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const { firstName, lastName, preferredName, phone, avatarUrl, dateOfBirth, bio } = req.body;
        await query(`
            UPDATE Subscriber SET
                firstName = ISNULL(@firstName, firstName),
                lastName = ISNULL(@lastName, lastName),
                preferredName = @preferredName,
                phone = @phone,
                avatarUrl = @avatarUrl,
                dateOfBirth = ISNULL(@dateOfBirth, dateOfBirth),
                bio = @bio,
                updatedAt = GETDATE()
            WHERE subscriberID = @id
        `, { id: req.user.subscriberID, firstName, lastName, preferredName: preferredName || null, phone: phone || null, avatarUrl: avatarUrl || null, dateOfBirth: dateOfBirth || null, bio: bio || null });

        res.json({ message: 'Profile updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ===========================================================
   POST /api/auth/check-email
   Lightweight, case-insensitive existence check used by the
   signup / add-dependant forms for early feedback. Returns only
   a boolean — never leaks any account details.
=========================================================== */
router.post('/check-email', async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        if (!email) return res.json({ exists: false });
        const r = await query('SELECT TOP 1 subscriberID FROM Subscriber WHERE LOWER(email) = @email', { email });
        res.json({ exists: r.recordset.length > 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ===========================================================
   DEPENDANT ACCOUNT SETUP (invitation flow) — PUBLIC endpoints
   The invitation token itself is the credential, so these do NOT
   require a JWT. All validation is enforced on the backend.
=========================================================== */
const invitationService = require('../services/invitationService');
const { getPool, sql } = require('../db');

// GET /api/auth/setup/validate?token=...
// Validates a setup token and returns the minimal info the setup page needs
// to prompt ONLY for missing fields. Never returns secrets.
router.get('/setup/validate', async (req, res) => {
    try {
        const token = req.query.token;
        const result = await invitationService.validateToken(token);
        if (!result.valid) {
            const map = {
                not_found: 'This setup link is not valid.',
                expired: 'This setup link has expired. Please ask your main member to resend your invitation.',
                used: 'This setup link has already been used. Try logging in instead.',
                superseded: 'A newer invitation was sent. Please use the most recent link.'
            };
            return res.status(400).json({ valid: false, reason: result.reason, error: map[result.reason] || 'Invalid setup link.' });
        }
        const inv = result.invitation;
        // Report which onboarding fields are still required (only prompt for
        // what is actually missing — do not re-ask for valid stored data).
        res.json({
            valid: true,
            email: inv.email,
            firstName: inv.firstName,
            needs: {
                password: true, // always set a password on first setup
                phone: !inv.phone,
                dateOfBirth: !inv.dateOfBirth
            }
        });
    } catch (err) {
        res.status(500).json({ valid: false, error: err.message });
    }
});

// POST /api/auth/setup/complete
// Body: { token, password, phone?, dateOfBirth?, termsAccepted }
// Consumes the token, sets the password, fills any missing required fields,
// activates the account, and returns a JWT so the dependant is logged in.
router.post('/setup/complete', async (req, res) => {
    const { token, password, phone, dateOfBirth, termsAccepted } = req.body || {};
    try {
        const result = await invitationService.validateToken(token);
        if (!result.valid) {
            const map = {
                not_found: 'This setup link is not valid.',
                expired: 'This setup link has expired. Please ask your main member to resend your invitation.',
                used: 'This setup link has already been used. Try logging in instead.',
                superseded: 'A newer invitation was sent. Please use the most recent link.'
            };
            return res.status(400).json({ error: map[result.reason] || 'Invalid setup link.' });
        }
        const inv = result.invitation;

        // Password strength (same rule as registration).
        const STRONG = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$/;
        if (!STRONG.test(password || '')) {
            return res.status(400).json({ error: 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.' });
        }
        if (!termsAccepted) {
            return res.status(400).json({ error: 'You must accept the Terms to activate your account.' });
        }

        // Only require fields that are actually missing.
        let dobToSet = null;
        if (!inv.dateOfBirth) {
            if (dateOfBirth) {
                const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateOfBirth).trim());
                const today = new Date().toISOString().slice(0, 10);
                if (!m || String(dateOfBirth).trim() >= today) {
                    return res.status(400).json({ error: 'Please enter a valid date of birth in the past. Future dates are not allowed.' });
                }
                dobToSet = String(dateOfBirth).trim();
            }
        }
        let phoneToSet = null;
        if (!inv.phone && phone) phoneToSet = String(phone).trim().slice(0, 50);

        const passwordHash = await bcrypt.hash(password, 10);

        // Consume token + activate account atomically. If the token was raced
        // (used/expired between validate and here) the consume returns false
        // and we roll back without touching the account.
        const pool = await getPool();
        const tx = new sql.Transaction(pool);
        await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        try {
            const consumed = await invitationService.consumeTokenTx(tx, inv.invitationID);
            if (!consumed) {
                await tx.rollback();
                return res.status(409).json({ error: 'This setup link is no longer valid. Please use the most recent invitation.' });
            }

            await new sql.Request(tx)
                .input('id', inv.dependantID)
                .input('hash', passwordHash)
                .input('phone', phoneToSet)
                .input('dob', dobToSet)
                .query(`
                    UPDATE Subscriber
                    SET passwordHash = @hash,
                        mustChangePassword = 0,
                        onboardingComplete = 1,
                        termsAcceptedAt = GETDATE(),
                        phone = COALESCE(@phone, phone),
                        dateOfBirth = COALESCE(@dob, dateOfBirth),
                        updatedAt = GETDATE()
                    WHERE subscriberID = @id
                `);

            // Activate the dependant record so they gain access.
            await new sql.Request(tx)
                .input('id', inv.dependantID)
                .query(`UPDATE Dependant SET status = 'active' WHERE dependantID = @id`);

            await tx.commit();
        } catch (txErr) {
            try { await tx.rollback(); } catch (_) { /* ignore */ }
            throw txErr;
        }

        // Fetch the activated account for the token + response.
        const r = await query('SELECT subscriberID, firstName, lastName, preferredName, email, userType, avatarUrl FROM Subscriber WHERE subscriberID = @id', { id: inv.dependantID });
        const user = r.recordset[0];
        const jwtToken = generateToken({ subscriberID: user.subscriberID, email: user.email, userType: user.userType });

        // Activity: account activated (non-fatal).
        try {
            const notificationService = require('../services/notificationService');
            const { NOTIFICATION_TYPES, ENTITY_TYPES } = require('../constants/notificationTypes');
            await notificationService.createNotification({
                subscriberID: inv.mainMemberID,
                type: NOTIFICATION_TYPES.SYSTEM,
                title: 'Dependant account activated',
                message: `${[user.firstName, user.lastName].filter(Boolean).join(' ').trim() || 'A dependant'} completed account setup and activated their account.`,
                relatedEntityType: ENTITY_TYPES.DEPENDANT,
                relatedEntityID: inv.dependantID,
                eventToken: 'dep-activated-' + inv.dependantID
            });
        } catch (_) { /* non-fatal */ }

        res.json({
            message: 'Account activated',
            token: jwtToken,
            user: {
                subscriberID: user.subscriberID,
                firstName: user.firstName,
                lastName: user.lastName,
                preferredName: user.preferredName || null,
                email: user.email,
                userType: user.userType,
                avatarUrl: user.avatarUrl || null
            }
        });
    } catch (err) {
        console.error('Setup complete error:', err.message);
        res.status(500).json({ error: 'Could not complete account setup.' });
    }
});

module.exports = router;
