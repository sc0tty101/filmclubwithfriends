// middleware/auth.js - Authentication middleware

// Check if user is logged in
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  }
  next();
}

// Check if user is admin
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  }

  if (!req.session.isAdmin) {
    return res.status(403).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Access Denied</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="/styles/main.css">
      </head>
      <body>
        <div class="container">
          <div class="card">
            <h1>⛔ Access Denied</h1>
            <p>You need admin privileges to access this page.</p>
            <div class="actions center">
              <a href="/" class="btn btn-primary">Back to Calendar</a>
            </div>
          </div>
        </div>
      </body>
      </html>
    `);
  }
  next();
}

// Optional auth - sets user info if logged in, but doesn't require it
function optionalAuth(req, res, next) {
  // User info already in session, just continue
  next();
}

// Attach user info to request from session
function attachUser(req, res, next) {
  if (req.session && req.session.userId) {
    req.user = {
      id: req.session.userId,
      name: req.session.userName,
      isAdmin: req.session.isAdmin || false
    };
  }
  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  optionalAuth,
  attachUser
};
