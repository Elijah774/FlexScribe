/* ===========================================================
   JWT Authentication Middleware
=========================================================== */
const jwt = require('jsonwebtoken');

function _getSecret() {
    return process.env.JWT_SECRET || 'flexscribe_jwt_secret';
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, _getSecret(), (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' });
        // Ensure subscriberID is always an integer
        user.subscriberID = parseInt(user.subscriberID) || 0;
        req.user = user; // { subscriberID, email, userType }
        next();
    });
}

function generateToken(user) {
    return jwt.sign(
        { subscriberID: user.subscriberID, email: user.email, userType: user.userType },
        _getSecret(),
        { expiresIn: '7d' }
    );
}

module.exports = { authenticateToken, generateToken };
