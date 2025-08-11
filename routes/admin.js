// routes/admin.js - Simplified to just database management
const express = require('express');
const router = express.Router();
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { createAllTables, dbPath } = require('../database/setup');

// Simple admin page with just database functions
router.get('/admin', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Admin - Film Club</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="/styles/main.css">
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔧 Admin Panel</h1>
          <p>Database management tools</p>
        </div>

        <div class="card">
          <h2>Database Management</h2>
          <p><strong>⚠️ Use with caution!</strong></p>

          <div style="margin-bottom: 30px;">
            <h3>Clear All Data</h3>
            <p>Remove all data from the database while keeping the table structure intact.</p>
            <p><small>This will delete all weeks, nominations, votes, members, and genres.</small></p>
            
            <form action="/admin/clear-data" method="POST" onsubmit="return confirm('Are you sure? This will delete all data.')">
              <button type="submit" class="btn btn-warning">Clear All Data</button>
            </form>
          </div>
          
          <div>
            <h3>Reset Database</h3>
            <p>Completely wipe and recreate the database with fresh tables.</p>
            <p><small>Database location: ${dbPath}</small></p>
            
            <form action="/admin/reset-database" method="POST" onsubmit="return confirm('Are you absolutely sure? This will delete everything!')">
              <button type="submit" class="btn btn-danger">Reset Database</button>
            </form>
          </div>
        </div>

        <div class="actions center">
          <a href="/" class="btn btn-secondary">Back to Calendar</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Clear all data (keeps schema)
router.post('/admin/clear-data', (req, res) => {
  const clearQueries = [
    "DELETE FROM votes",
    "DELETE FROM results",
    "DELETE FROM nominations", 
    "DELETE FROM weeks",
    "DELETE FROM films",
    "DELETE FROM members",
    "DELETE FROM genres"
  ];
  
  let completed = 0;
  
  clearQueries.forEach(query => {
    req.db.run(query, function(err) {
      completed++;
      
      if (completed === clearQueries.length) {
        if (err) {
          res.send(`
            <html><body>
            <h1>Error clearing data</h1>
            <p>${err.message}</p>
            <a href="/admin">Back</a>
            </body></html>
          `);
        } else {
          res.send(`
            <html><body>
            <h1>✅ All data cleared!</h1>
            <p>Database is empty but structure remains.</p>
            <a href="/admin">Back to Admin</a> | 
            <a href="/">Back to Calendar</a>
            </body></html>
          `);
        }
      }
    });
  });
});

// Reset database completely
router.post('/admin/reset-database', (req, res) => {
  // Close current connection
  req.db.close((closeErr) => {
    if (closeErr) {
      console.error('Error closing database:', closeErr);
    }
    
    // Delete database file
    try {
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
      
      // Create new database
      const newDb = new sqlite3.Database(dbPath);
      
      createAllTables(newDb, (err) => {
        newDb.close();
        
        if (err) {
          res.send(`
            <html><body>
            <h1>Error resetting database</h1>
            <p>${err.message}</p>
            <a href="/admin">Back</a>
            </body></html>
          `);
        } else {
          res.send(`
            <html><body>
            <h1>✅ Database reset complete!</h1>
            <p>Fresh database created. Application restart may be required.</p>
            <a href="/admin">Back to Admin</a> | 
            <a href="/">Back to Calendar</a>
            </body></html>
          `);
        }
      });
    } catch (err) {
      res.send(`
        <html><body>
        <h1>Error resetting database</h1>
        <p>${err.message}</p>
        <a href="/admin">Back</a>
        </body></html>
      `);
    }
  });
});

module.exports = router;
