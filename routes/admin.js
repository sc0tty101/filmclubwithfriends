// routes/admin.js - Updated with authentication and bug fixes
const express = require('express');
const router = express.Router();
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { createAllTables, dbPath, createNewConnection, enableForeignKeys } = require('../database/setup');
const { requireAdmin } = require('../middleware/auth');
const { dbRun } = require('../utils/dbHelpers');

// Simple admin page with just database functions
router.get('/admin', requireAdmin, (req, res) => {
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
router.post('/admin/clear-data', requireAdmin, async (req, res) => {
  const clearQueries = [
    "DELETE FROM votes",
    "DELETE FROM results",
    "DELETE FROM nominations",
    "DELETE FROM weeks",
    "DELETE FROM films",
    "DELETE FROM members",
    "DELETE FROM genres"
  ];

  try {
    // Run all deletes in sequence to avoid race conditions
    for (const query of clearQueries) {
      await dbRun(req.db, query);
    }

    res.send(`
      <html><body>
      <link rel="stylesheet" href="/styles/main.css">
      <div class="container">
        <div class="card">
          <h1>✅ All data cleared!</h1>
          <p>Database is empty but structure remains.</p>
          <div class="actions center">
            <a href="/admin" class="btn btn-primary">Back to Admin</a>
            <a href="/" class="btn btn-secondary">Back to Calendar</a>
          </div>
        </div>
      </div>
      </body></html>
    `);
  } catch (err) {
    console.error('Clear data error:', err);
    res.send(`
      <html><body>
      <link rel="stylesheet" href="/styles/main.css">
      <div class="container">
        <div class="card">
          <h1>❌ Error clearing data</h1>
          <p>${err.message}</p>
          <div class="actions center">
            <a href="/admin" class="btn btn-primary">Back to Admin</a>
          </div>
        </div>
      </div>
      </body></html>
    `);
  }
});

// Reset database completely - WARNING: This requires app restart
router.post('/admin/reset-database', requireAdmin, (req, res) => {
  res.send(`
    <html><body>
    <link rel="stylesheet" href="/styles/main.css">
    <div class="container">
      <div class="card">
        <h1>⚠️ Database Reset Requires Restart</h1>
        <p><strong>Important:</strong> Resetting the database requires restarting the application.</p>
        <p>Instead of resetting, please use the "Clear All Data" option which removes all data but keeps the structure.</p>
        <p>If you really need to reset the database file:</p>
        <ol>
          <li>Stop the application</li>
          <li>Delete the database file at: <code>${dbPath}</code></li>
          <li>Restart the application (it will create a fresh database)</li>
        </ol>
        <div class="actions center">
          <a href="/admin/clear-data" class="btn btn-warning" onclick="return confirm('Clear all data?');">Clear All Data Instead</a>
          <a href="/admin" class="btn btn-secondary">Back to Admin</a>
        </div>
      </div>
    </div>
    </body></html>
  `);
});

module.exports = router;
