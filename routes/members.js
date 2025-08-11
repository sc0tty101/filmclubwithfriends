// routes/members.js - Simplified member management
const express = require('express');
const router = express.Router();

// Member management page
router.get('/manage-members', (req, res) => {
  req.db.all("SELECT * FROM members WHERE is_active = 1 ORDER BY name", (err, members) => {
    if (err) {
      console.error(err);
      members = [];
    }

    const message = req.query.message;
    const error = req.query.error;

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Manage Members - Film Club</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="/styles/main.css">
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>👥 Manage Members</h1>
            <p>Add or remove film club members</p>
          </div>

          ${message ? `<div class="alert alert-success">${message}</div>` : ''}
          ${error ? `<div class="alert alert-error">${error}</div>` : ''}

          <div class="card">
            <h2>Current Members (${members.length})</h2>
            ${members.length === 0 ? 
              '<p style="text-align: center; color: #999;">No members yet. Add some below!</p>' :
              `<div class="item-list">
                ${members.map(member => `
                  <div class="item-card">
                    <span>
                      ${member.name}
                      ${member.is_admin ? ' <small>(admin)</small>' : ''}
                    </span>
                    <div class="actions">
                      <form action="/toggle-admin" method="POST" style="display: inline;">
                        <input type="hidden" name="memberId" value="${member.id}">
                        <input type="hidden" name="currentAdmin" value="${member.is_admin}">
                        <button type="submit" class="btn btn-secondary btn-small">
                          ${member.is_admin ? 'Remove Admin' : 'Make Admin'}
                        </button>
                      </form>
                      <form action="/remove-member" method="POST" style="display: inline;" 
                            onsubmit="return confirm('Remove ${member.name}?')">
                        <input type="hidden" name="memberId" value="${member.id}">
                        <button type="submit" class="btn btn-danger btn-small">Remove</button>
                      </form>
                    </div>
                  </div>
                `).join('')}
              </div>`
            }
          </div>

          <div class="card">
            <h2>Add New Member</h2>
            <form action="/add-member" method="POST">
              <div class="form-group">
                <label>Member Name:</label>
                <input type="text" name="memberName" required maxlength="50" 
                       placeholder="Enter member name">
              </div>
              <div class="form-group">
                <label>
                  <input type="checkbox" name="isAdmin" value="1">
                  Make this member an admin
                </label>
              </div>
              <button type="submit" class="btn btn-primary">Add Member</button>
            </form>
          </div>

          <div class="actions center">
            <a href="/" class="btn btn-secondary">Back to Calendar</a>
          </div>
        </div>
      </body>
      </html>
    `);
  });
});

// Add member
router.post('/add-member', (req, res) => {
  const memberName = req.body.memberName?.trim();
  const isAdmin = req.body.isAdmin ? 1 : 0;
  
  if (!memberName) {
    return res.redirect('/manage-members?error=Member name is required');
  }

  req.db.run(
    "INSERT INTO members (name, is_admin) VALUES (?, ?)",
    [memberName, isAdmin],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.redirect('/manage-members?error=Member already exists');
        }
        return res.redirect('/manage-members?error=Failed to add member');
      }
      res.redirect('/manage-members?message=Member added successfully');
    }
  );
});

// Remove member
router.post('/remove-member', (req, res) => {
  const memberId = req.body.memberId;
  
  req.db.run(
    "UPDATE members SET is_active = 0 WHERE id = ?",
    [memberId],
    function(err) {
      if (err) {
        return res.redirect('/manage-members?error=Failed to remove member');
      }
      res.redirect('/manage-members?message=Member removed');
    }
  );
});

// Toggle admin status
router.post('/toggle-admin', (req, res) => {
  const memberId = req.body.memberId;
  const currentAdmin = parseInt(req.body.currentAdmin);
  const newStatus = currentAdmin ? 0 : 1;
  
  req.db.run(
    "UPDATE members SET is_admin = ? WHERE id = ?",
    [newStatus, memberId],
    function(err) {
      if (err) {
        return res.redirect('/manage-members?error=Failed to update admin status');
      }
      res.redirect('/manage-members?message=Admin status updated');
    }
  );
});

module.exports = router;
