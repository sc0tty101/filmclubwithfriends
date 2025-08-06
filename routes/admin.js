const express = require('express');
const router = express.Router();
const fs = require('fs');

// Main admin page with all admin functions
router.get('/admin/import-genres', (req, res) => {
  // Get current members for display
  req.db.all("SELECT name, is_admin FROM members WHERE is_active = 1 ORDER BY name", (err, members) => {
    if (err) {
      console.error(err);
      members = [];
    }

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Admin Panel - Film Club</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="/styles/main.css">
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔧 Film Club Admin Panel</h1>
            <p>Manage all administrative functions for your film club</p>
          </div>

          <!-- Member Management Section -->
          <div class="card">
            <h2>👥 Member Management</h2>
            
            <div class="member-list" style="margin-bottom: 30px;">
              <h3>Current Members (${members.length})</h3>
              ${members.length === 0 ? 
                '<p style="text-align: center; color: #666;">No members yet. Add some below!</p>' :
                members.map(member => `
                  <div class="member-item">
                    <div class="member-info">
                      <span class="member-name">${member.name}</span>
                      ${member.is_admin ? '<span class="admin-badge">Admin</span>' : ''}
                    </div>
                    <div class="member-controls">
                      <form action="/admin/toggle-admin" method="POST" style="display: inline;">
                        <input type="hidden" name="memberName" value="${member.name}">
                        <input type="hidden" name="currentAdmin" value="${member.is_admin}">
                        <button type="submit" class="btn btn-secondary">
                          ${member.is_admin ? 'Remove Admin' : 'Make Admin'}
                        </button>
                      </form>
                      <form action="/admin/remove-member" method="POST" style="display: inline;" onsubmit="return confirm('Are you sure you want to remove ${member.name}?')">
                        <input type="hidden" name="memberName" value="${member.name}">
                        <button type="submit" class="btn btn-danger">Remove</button>
                      </form>
                    </div>
                  </div>
                `).join('')
              }
            </div>

            <h3>Add New Member</h3>
            <form action="/admin/add-member" method="POST">
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

          <!-- Genre Import Section -->
          <div class="card">
            <h2>🎭 Bulk Import Genres</h2>
            <p>Import all your genres at once. Use this page only once during initial setup!</p>
            
            <form action="/admin/import-genres" method="POST">
              <div class="form-group">
                <label>Paste your genre list (one per line):</label>
                <textarea name="genreList" rows="15" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;" placeholder="Action Sci-Fi & Fantasy
Action Thrillers
Adventures
..."></textarea>
              </div>
              
              <div class="actions">
                <button type="submit" class="btn btn-primary">Import All Genres</button>
              </div>
            </form>
          </div>

          <!-- Database Management Section -->
          <div class="card">
            <h2>🗃️ Database Management</h2>
            <p><strong>⚠️ Development Tools - Use with caution!</strong></p>
            
            <div style="margin-bottom: 20px;">
              <h3>Reset Database</h3>
              <p>This will completely wipe all data and recreate the database with the latest schema. 
                 Useful for applying schema changes during development.</p>
              <p><strong>⚠️ This will delete:</strong> All weeks, nominations, votes, members, and genres!</p>
              
              <form action="/admin/reset-database" method="POST" onsubmit="return confirm('Are you absolutely sure? This will delete ALL data and cannot be undone!')">
                <button type="submit" class="btn btn-danger">🗑️ Reset Database</button>
              </form>
            </div>
          </div>

          <div class="actions">
            <a href="/manage-genres" class="btn btn-secondary">Manage Genres</a>
            <a href="/" class="btn btn-success">Back to Calendar</a>
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

// Handle bulk genre import
router.post('/admin/import-genres', (req, res) => {
  const genreList = req.body.genreList;
  
  if (!genreList) {
    return res.status(400).send('Genre list is required');
  }
  
  // Split by lines and clean up
  const genres = genreList
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .filter(line => line.length <= 100); // Safety limit
  
  let imported = 0;
  let skipped = 0;
  let completed = 0;
  
  if (genres.length === 0) {
    return res.send('No valid genres found');
  }
  
  // Insert each genre
  genres.forEach((genre, index) => {
    req.db.run(
      "INSERT OR IGNORE INTO genres (name) VALUES (?)",
      [genre],
      function(err) {
        completed++;
        
        if (err) {
          console.error(`Error importing ${genre}:`, err);
          skipped++;
        } else if (this.changes > 0) {
          imported++;
        } else {
          skipped++; // Already exists
        }
        
        // When all are done, show results
        if (completed === genres.length) {
          res.send(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Import Complete - Film Club</title>
              <link rel="stylesheet" href="/styles/main.css">
            </head>
            <body>
              <div class="container">
                <div class="card">
                  <h1>✅ Import Complete!</h1>
                  <p><strong>Total processed:</strong> ${genres.length}</p>
                  <p><strong>Successfully imported:</strong> ${imported}</p>
                  <p><strong>Skipped (duplicates/errors):</strong> ${skipped}</p>
                  
                  <div class="actions">
                    <a href="/manage-genres" class="btn btn-primary">View All Genres</a>
                    <a href="/admin/import-genres" class="btn btn-secondary">Back to Admin</a>
                    <a href="/" class="btn btn-success">Back to Calendar</a>
                  </div>
                </div>
              </div>
            </body>
            </html>
          `);
        }
      }
    );
  });
});

// Handle member management
router.post('/admin/add-member', (req, res) => {
  const memberName = req.body.memberName?.trim();
  const isAdmin = req.body.isAdmin ? 1 : 0;
  
  if (!memberName) {
    return res.redirect('/admin/import-genres?message=Member name is required&type=error');
  }

  if (memberName.length > 50) {
    return res.redirect('/admin/import-genres?message=Member name too long (max 50 characters)&type=error');
  }

  // First, try to reactivate existing member
  req.db.run(
    "UPDATE members SET is_active = 1, is_admin = ? WHERE name = ?",
    [isAdmin, memberName],
    function(err) {
      if (err) {
        console.error(err);
        return res.redirect('/admin/import-genres?message=Failed to add member&type=error');
      }
      
      // If no rows were updated (member doesn't exist), insert new member
      if (this.changes === 0) {
        req.db.run(
          "INSERT INTO members (name, is_admin, is_active) VALUES (?, ?, 1)",
          [memberName, isAdmin],
          function(err) {
            if (err) {
              console.error(err);
              return res.redirect('/admin/import-genres?message=Failed to add member&type=error');
            }
            res.redirect('/admin/import-genres?message=Member added successfully');
          }
        );
      } else {
        res.redirect('/admin/import-genres?message=Member reactivated successfully');
      }
    }
  );
});

router.post('/admin/remove-member', (req, res) => {
  const memberName = req.body.memberName;
  
  if (!memberName) {
    return res.redirect('/admin/import-genres?message=Member name is required&type=error');
  }

  req.db.run(
    "UPDATE members SET is_active = 0 WHERE name = ?",
    [memberName],
    function(err) {
      if (err) {
        console.error(err);
        return res.redirect('/admin/import-genres?message=Failed to remove member&type=error');
      }
      
      if (this.changes === 0) {
        return res.redirect('/admin/import-genres?message=Member not found&type=error');
      }
      
      res.redirect('/admin/import-genres?message=Member removed successfully');
    }
  );
});

router.post('/admin/toggle-admin', (req, res) => {
  const memberName = req.body.memberName;
  const currentAdmin = parseInt(req.body.currentAdmin);
  const newAdminStatus = currentAdmin ? 0 : 1;
  
  if (!memberName) {
    return res.redirect('/admin/import-genres?message=Member name is required&type=error');
  }

  req.db.run(
    "UPDATE members SET is_admin = ? WHERE name = ?",
    [newAdminStatus, memberName],
    function(err) {
      if (err) {
        console.error(err);
        return res.redirect('/admin/import-genres?message=Failed to update admin status&type=error');
      }
      
      const action = newAdminStatus ? 'granted' : 'removed';
      res.redirect(`/admin/import-genres?message=Admin privileges ${action} for ${memberName}`);
    }
  );
});

// Handle database reset
router.post('/admin/reset-database', (req, res) => {
  const sqlite3 = require('sqlite3').verbose();
  const databasePath = '/data/filmclub.db';
  
  console.log('Starting database reset...');
  
  // Close current database connection
  req.db.close((closeErr) => {
    if (closeErr) {
      console.error('Error closing database:', closeErr);
    }
    
    // Delete the database file
    try {
      if (fs.existsSync(databasePath)) {
        fs.unlinkSync(databasePath);
        console.log('Old database deleted');
      }
      
      // Create new database with fresh schema
      const newDb = new sqlite3.Database(databasePath);
      
      newDb.serialize(() => {
        // Recreate all tables with latest schema
        newDb.run(`CREATE TABLE weeks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          week_date TEXT NOT NULL,
          genre TEXT,
          genre_source TEXT,
          phase TEXT DEFAULT 'planning',
          created_by TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          winner_film_id INTEGER,
          winner_score INTEGER
        )`);

        newDb.run(`CREATE TABLE nominations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          week_id INTEGER,
          user_name TEXT,
          film_title TEXT,
          film_year INTEGER,
          poster_url TEXT,
          tmdb_id INTEGER,
          nominated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (week_id) REFERENCES weeks(id)
        )`);

        newDb.run(`CREATE TABLE votes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          week_id INTEGER,
          user_name TEXT,
          votes_json TEXT,
          voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (week_id) REFERENCES weeks(id)
        )`);

        newDb.run(`CREATE TABLE members (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          is_active INTEGER DEFAULT 1,
          is_admin INTEGER DEFAULT 0
        )`);

        newDb.run(`CREATE TABLE genres (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          is_active INTEGER DEFAULT 1
        )`, (err) => {
          if (err) {
            console.error('Error creating tables:', err);
            return res.status(500).send('Error recreating database');
          }
          
          console.log('Database reset complete - new schema created');
          
          // Close the new database connection
          newDb.close();
          
          // Send success response
          res.send(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Database Reset Complete - Film Club</title>
              <link rel="stylesheet" href="/styles.css">
            </head>
            <body>
              <div class="container">
                <div class="card">
                  <h1>✅ Database Reset Complete!</h1>
                  <p>The database has been successfully reset with the latest schema.</p>
                  <p><strong>Fresh start:</strong> All tables have been recreated and are ready to use.</p>
                  
                  <div class="actions">
                    <a href="/admin/import-genres" class="btn btn-primary">Back to Admin</a>
                    <a href="/manage-genres" class="btn btn-secondary">Add Genres</a>
                    <a href="/" class="btn btn-success">Back to Calendar</a>
                  </div>
                </div>
              </div>
            </body>
            </html>
          `);
        });
      });
      
    } catch (err) {
      console.error('Error during database reset:', err);
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Reset Error - Film Club</title>
          <link rel="stylesheet" href="/styles.css">
        </head>
        <body>
          <div class="container">
            <div class="card">
              <h1>❌ Reset Failed</h1>
              <p>Error resetting database: ${err.message}</p>
              <div class="actions">
                <a href="/admin/import-genres" class="btn btn-secondary">Back to Admin</a>
              </div>
            </div>
          </div>
        </body>
        </html>
      `);
    }
  });
});

module.exports = router;
