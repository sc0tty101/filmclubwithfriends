const express = require('express');
const router = express.Router();

// USER MANAGEMENT PAGE
router.get('/manage-users', (req, res) => {
  req.db.all("SELECT name, is_admin FROM members WHERE is_active = 1 ORDER BY name", (err, members) => {
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
        <link rel="stylesheet" href="/styles/main.css">
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
                    <div class="member-info">
                      <span class="member-name">${member.name}</span>
                      ${member.is_admin ? '<span class="admin-badge">Admin</span>' : ''}
                    </div>
                    <div class="member-controls">
                      <form action="/toggle-admin" method="POST" style="display: inline;">
                        <input type="hidden" name="memberName" value="${member.name}">
                        <input type="hidden" name="currentAdmin" value="${member.is_admin}">
                        <button type="submit" class="btn btn-secondary">
                          ${member.is_admin ? 'Remove Admin' : 'Make Admin'}
                        </button>
                      </form>
                      <form action="/remove-member" method="POST" style="display: inline;" onsubmit="return confirm('Are you sure you want to remove ${member.name}?')">
                        <input type="hidden" name="memberName" value="${member.name}">
                        <button type="submit" class="btn btn-danger">Remove</button>
                      </form>
                    </div>
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
              <div class="form-group">
                <label>
                  <input type="checkbox" name="isAdmin" value="1"> Make this member an admin
                </label>
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
  const isAdmin = req.body.isAdmin ? 1 : 0;
  
  if (!memberName) {
    return res.redirect('/manage-users?message=Member name is required&type=error');
  }

  if (memberName.length > 50) {
    return res.redirect('/manage-users?message=Member name too long (max 50 characters)&type=error');
  }

  // First, try to reactivate existing member
  req.db.run(
    "UPDATE members SET is_active = 1, is_admin = ? WHERE name = ?",
    [isAdmin, memberName],
    function(err) {
      if (err) {
        console.error(err);
        return res.redirect('/manage-users?message=Failed to add member&type=error');
      }
      
      // If no rows were updated (member doesn't exist), insert new member
      if (this.changes === 0) {
        req.db.run(
          "INSERT INTO members (name, is_admin, is_active) VALUES (?, ?, 1)",
          [memberName, isAdmin],
          function(err) {
            if (err) {
              console.error(err);
              return res.redirect('/manage-users?message=Failed to add member&type=error');
            }
            res.redirect('/manage-users?message=Member added successfully');
          }
        );
      } else {
        res.redirect('/manage-users?message=Member reactivated successfully');
      }
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

// TOGGLE ADMIN STATUS
router.post('/toggle-admin', (req, res) => {
  const memberName = req.body.memberName;
  const currentAdmin = parseInt(req.body.currentAdmin);
  const newAdminStatus = currentAdmin ? 0 : 1;
  
  if (!memberName) {
    return res.redirect('/manage-users?message=Member name is required&type=error');
  }

  req.db.run(
    "UPDATE members SET is_admin = ? WHERE name = ?",
    [newAdminStatus, memberName],
    function(err) {
      if (err) {
        console.error(err);
        return res.redirect('/manage-users?message=Failed to update admin status&type=error');
      }
      
      const action = newAdminStatus ? 'granted' : 'removed';
      res.redirect(`/manage-users?message=Admin privileges ${action} for ${memberName}`);
    }
  );
});

module.exports = router;
