/* ===========================================================
   /api/auth — Register, Login, Profile
=========================================================== */
const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { authenticateToken, generateToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { firstName, lastName, email, password, phone, marketingOptIn } = req.body;

        if (!firstName || !lastName || !email || !password) {
            return res.status(400).json({ error: 'First name, last name, email, and password are required.' });
        }

        // Check if email exists
        const existing = await query('SELECT subscriberID FROM Subscriber WHERE email = @email', { email });
        if (existing.recordset.length > 0) {
            return res.status(409).json({ error: 'Email already registered.' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Insert subscriber
        const result = await query(`
            INSERT INTO Subscriber (firstName, lastName, email, passwordHash, phone, marketingOptIn)
            OUTPUT INSERTED.subscriberID
            VALUES (@firstName, @lastName, @email, @passwordHash, @phone, @marketingOptIn)
        `, { firstName, lastName, email, passwordHash, phone: phone || null, marketingOptIn: marketingOptIn ? 1 : 0 });

        const subscriberID = result.recordset[0].subscriberID;

        // Create MainMember record
        await query('INSERT INTO MainMember (mainMemberID) VALUES (@id)', { id: subscriberID });

        // Create wallet
        await query('INSERT INTO VirtualWallet (subscriberID) VALUES (@id)', { id: subscriberID });

        // Generate token
        const token = generateToken({ subscriberID, email, userType: 'MainMember' });

        res.status(201).json({
            message: 'Account created successfully',
            token,
            user: { subscriberID, firstName, lastName, email, userType: 'MainMember' }
        });
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
            SELECT subscriberID, firstName, lastName, email, passwordHash, userType, preferredName, avatarUrl
            FROM Subscriber WHERE email = @email
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
                preferredName: user.preferredName,
                email: user.email,
                userType: user.userType,
                avatarUrl: user.avatarUrl
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error during login.' });
    }
});

// GET /api/auth/profile
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const result = await query(`
            SELECT subscriberID, firstName, lastName, preferredName, email, phone, avatarUrl, scribePoints, createdAt
            FROM Subscriber WHERE subscriberID = @id
        `, { id: req.user.subscriberID });

        if (result.recordset.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/auth/profile
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const { firstName, lastName, preferredName, phone, avatarUrl } = req.body;
        await query(`
            UPDATE Subscriber SET
                firstName = ISNULL(@firstName, firstName),
                lastName = ISNULL(@lastName, lastName),
                preferredName = @preferredName,
                phone = @phone,
                avatarUrl = @avatarUrl,
                updatedAt = GETDATE()
            WHERE subscriberID = @id
        `, { id: req.user.subscriberID, firstName, lastName, preferredName: preferredName || null, phone: phone || null, avatarUrl: avatarUrl || null });

        res.json({ message: 'Profile updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
