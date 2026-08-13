/* ===========================================================
   JWT Authentication Middleware
=========================================================== */
const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'flexscribe_jwt_secret';

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' });
        req.user = user; // { subscriberID, email, userType }
        next();
    });
}

function generateToken(user) {
    return jwt.sign(
        { subscriberID: user.subscriberID, email: user.email, userType: user.userType },
        SECRET,
        { expiresIn: '7d' }
    );
}

module.exports = { authenticateToken, generateToken };
