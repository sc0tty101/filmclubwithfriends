// routes/auth.js - Authentication routes

const express = require('express');
const router = express.Router();
const { dbGet } = require('../utils/dbHelpers');

// Login page
router.get('/login', (req, res) => {
  const redirect = req.query.redirect || '/';
  const error = req.query.error;

  // Get all active members for dropdown
  req.db.all("SELECT name, is_admin FROM members WHERE is_active = 1 ORDER BY name", (err, members) => {
    if (err) {
      console.error('Error fetching members:', err);
      members = [];
    }

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Login - Film Club</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="/styles/main.css">
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎬 Film Club Login</h1>
            <p>Select your name to continue</p>
          </div>

          ${error ? `<div class="alert alert-error">${error}</div>` : ''}

          <div class="card" style="max-width: 500px; margin: 0 auto;">
            <form action="/login" method="POST">
              <input type="hidden" name="redirect" value="${redirect}">

              <div class="form-group">
                <label>Select Your Name:</label>
                <select name="userName" required>
                  <option value="">Choose your name...</option>
                  ${members.map(m => `
                    <option value="${m.name}">${m.name}${m.is_admin ? ' (Admin)' : ''}</option>
                  `).join('')}
                </select>
              </div>

              <div class="actions">
                <button type="submit" class="btn btn-primary" style="width: 100%;">Login</button>
              </div>
            </form>

            <div style="margin-top: 20px; text-align: center; color: #999;">
              <small>No password required - this is a private club app for trusted members</small>
            </div>
          </div>
        </div>
      </body>
      </html>
    `);
  });
});

// Handle login
router.post('/login', async (req, res) => {
  const { userName } = req.body;
  const redirect = req.body.redirect || '/';

  console.log('Login attempt for user:', userName);

  if (!userName) {
    console.log('Login failed: No username provided');
    return res.redirect('/login?error=Please select your name');
  }

  try {
    // Get member from database
    const member = await dbGet(
      req.db,
      "SELECT id, name, is_admin FROM members WHERE name = ? AND is_active = 1",
      [userName]
    );

    if (!member) {
      console.log('Login failed: Member not found:', userName);
      return res.redirect('/login?error=Member not found');
    }

    console.log('Member found:', { id: member.id, name: member.name, isAdmin: member.is_admin });

    // Set session
    req.session.userId = member.id;
    req.session.userName = member.name;
    req.session.isAdmin = member.is_admin === 1;

    console.log('Session data set, saving...');

    // Save session before redirect (important!)
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.redirect('/login?error=Session save failed');
      }
      console.log('Session saved successfully! Redirecting to:', redirect);
      res.redirect(redirect);
    });
  } catch (err) {
    console.error('Login error:', err);
    res.redirect('/login?error=Login failed: ' + err.message);
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/login');
  });
});

module.exports = router;
