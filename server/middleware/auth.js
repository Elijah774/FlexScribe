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

/** Gate a route to Admin users only. Must run AFTER authenticateToken.
    The JWT carries userType; 'Admin' is the only role allowed through. */
function requireAdmin(req, res, next) {
    if (!req.user || req.user.userType !== 'Admin') {
        return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
}

/* ===========================================================
   ROLE HELPERS
   Roles are derived from the JWT userType, which is set at
   login/registration from the database — NEVER from a value
   supplied by the client in a request body. These gates must
   run AFTER authenticateToken.

   Accepted role spellings (historic data uses mixed casing):
     Main member : 'MainMember', 'individual', 'Admin'
     Dependant   : 'Dependant', 'dependant'
=========================================================== */

function _isDependant(userType) {
    return userType === 'Dependant' || userType === 'dependant';
}

function _isMainMember(userType) {
    // Anything that is not a dependant is treated as a main-member-class
    // account (MainMember / individual / Admin). Admins retain full access.
    return !_isDependant(userType);
}

/** Convenience booleans attached for handlers that branch on role. */
function attachRole(req) {
    const t = req.user ? req.user.userType : null;
    req.isDependant = _isDependant(t);
    req.isMainMember = _isMainMember(t);
    return req;
}

/** Block dependants from a main-member-only route. */
function requireMainMember(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (_isDependant(req.user.userType)) {
        return res.status(403).json({ error: 'This feature is only available to main members.' });
    }
    next();
}

/** Restrict a route to dependant accounts only. */
function requireDependant(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (!_isDependant(req.user.userType)) {
        return res.status(403).json({ error: 'This feature is only available to dependants.' });
    }
    next();
}

module.exports = {
    authenticateToken,
    generateToken,
    requireAdmin,
    requireMainMember,
    requireDependant,
    attachRole,
    _isDependant,
    _isMainMember
};
