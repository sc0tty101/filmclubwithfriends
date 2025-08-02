const express = require('express');
const router = express.Router();
const { getMembers } = require('../database/setup');

// USER MANAGEMENT PAGE
router.get('/manage-users', (req, res) => {
  getMembers((err, members) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Manage Members - Film Club</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="/styles.css">
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>👥 Manage Film Club Members</h1>
            <p>Add or remove members from your film club</p>
          </div>

          <div class="card">
            <h2>Current Members (${members.length})</h2>
            <div class="member-list">
              ${members.length === 0 ? 
                '<p style="text-align: center; color: #666;">No members yet. Add some below!</p>' :
                members.map(member => `
                  <div class="member-item">
                    <span class="member-name">${member.name}</span>
                    <form action="/remove-member" method="POST" style="display: inline;" onsubmit="return confirm('Are you sure you want to remove ${member.name}?')">
                      <input type="hidden" name="memberName" value="${member.name}">
                      <button type="submit" class="btn btn-danger">Remove</button>
                    </form>
                  </div>
                `).join('')
              }
            </div>
          </div>

          <div class="card">
            <h2>Add New Member</h2>
            <form action="/add-member" method="POST">
              <div class="form-group">
                <label>Member Name:</label>
                <input type="text" name="memberName" placeholder="Enter member name" required maxlength="50">
              </div>
              <div class="actions">
                <button type="submit" class="btn btn-primary">Add Member</button>
              </div>
            </form>
          </div>

          <div class="actions">
            <a href="/" class="btn btn-secondary">Back to Calendar</a>
          </div>
        </div>

        <script>
          // Show success/error messages if they exist
          const urlParams = new URLSearchParams(window.location.search);
          const message = urlParams.get('message');
          const type = urlParams.get('type');
          
          if (message) {
            const alertDiv = document.createElement('div');
            alertDiv.className = \`alert alert-\${type || 'success'}\`;
            alertDiv.textContent = decodeURIComponent(message);
            document.querySelector('.container').insertBefore(alertDiv, document.querySelector('.header').nextSibling);
          }
        </script>
      </body>
      </html>
    `);
  });
});

// ADD MEMBER
router.post('/add-member', (req, res) => {
  const memberName = req.body.memberName?.trim();
  
  if (!memberName) {
    return res.redirect('/manage-users?message=Member name is required&type=error');
  }

  if (memberName.length > 50) {
    return res.redirect('/manage-users?message=Member name too long (max 50 characters)&type=error');
  }

  req.db.run(
    "INSERT INTO members (name) VALUES (?)",
    [memberName],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.redirect('/manage-users?message=Member already exists&type=error');
        }
        console.error(err);
        return res.redirect('/manage-users?message=Failed to add member&type=error');
      }
      res.redirect('/manage-users?message=Member added successfully');
    }
  );
});

// REMOVE MEMBER
router.post('/remove-member', (req, res) => {
  const memberName = req.body.memberName;
  
  if (!memberName) {
    return res.redirect('/manage-users?message=Member name is required&type=error');
  }

  req.db.run(
    "UPDATE members SET is_active = 0 WHERE name = ?",
    [memberName],
    function(err) {
      if (err) {
        console.error(err);
        return res.redirect('/manage-users?message=Failed to remove member&type=error');
      }
      
      if (this.changes === 0) {
        return res.redirect('/manage-users?message=Member not found&type=error');
      }
      
      res.redirect('/manage-users?message=Member removed successfully');
    }
  );
});

module.exports = router;
