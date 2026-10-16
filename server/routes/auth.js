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

        // Check if email exists
        const existing = await query('SELECT subscriberID FROM Subscriber WHERE email = @email', { email });
        if (existing.recordset.length > 0) {
            return res.status(409).json({ error: 'Email already registered.' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Insert subscriber (include dateOfBirth if provided)
        const result = await query(`
            INSERT INTO Subscriber (firstName, lastName, email, passwordHash, phone, marketingOptIn, dateOfBirth, termsAcceptedAt, accentColor, avatarUrl, scribeScore)
            OUTPUT INSERTED.subscriberID
            VALUES (@firstName, @lastName, @email, @passwordHash, @phone, @marketingOptIn, @dateOfBirth, SYSUTCDATETIME(), @accentColor, @avatarUrl, 500)
        `, { firstName, lastName, email, passwordHash, phone: phone || null, marketingOptIn: marketingOptInValue, dateOfBirth: dob || null, accentColor: '#FF8A34', avatarUrl: null });

        const subscriberID = result.recordset[0].subscriberID;

        // Create MainMember record
        await query('INSERT INTO MainMember (mainMemberID) VALUES (@id)', { id: subscriberID });

        // Create wallet (no cardNumber column in this schema)
        await query('INSERT INTO VirtualWallet (subscriberID) VALUES (@id)', { id: subscriberID });

        // Create initial ScribeScore entry
        await query('INSERT INTO ScribeScore (subscriberID, scoreValue) VALUES (@id, 500)', { id: subscriberID });

        // Generate token
        const token = generateToken({ subscriberID, email, userType: 'MainMember' });

        res.status(201).json({
            message: 'Account created successfully',
            token,
            scribeScore: 500,
            user: { subscriberID, firstName, lastName, email, userType: 'MainMember' }
        });
        updateUserAnalytics(subscriberID);
    } catch (err) {
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

        const result = await query(`
            SELECT * FROM Subscriber WHERE email = @email
        `, { email });

        if (result.recordset.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const user = result.recordset[0];
        const validPassword = await bcrypt.compare(password, user.passwordHash);

        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid email or password.' });
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

module.exports = router;
