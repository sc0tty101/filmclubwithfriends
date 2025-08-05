const express = require('express');
const router = express.Router();
const fs = require('fs');

// Bulk genre import page
router.get('/admin/import-genres', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Import Genres - Film Club Admin</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="/styles.css">
    </head>
    <body>
      <div class="container">
        <div class="card">
          <h1>🎭 Bulk Import Genres</h1>
          <p>This will import all your genres at once. Use this page only once!</p>
          
          <form action="/admin/import-genres" method="POST">
            <div class="form-group">
              <label>Paste your genre list (one per line):</label>
              <textarea name="genreList" rows="20" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;" placeholder="Action Sci-Fi & Fantasy
Action Thrillers
Adventures
..."></textarea>
            </div>
            
            <div class="actions">
              <button type="submit" class="btn btn-primary">Import All Genres</button>
              <a href="/" class="btn btn-secondary">Cancel</a>
            </div>
          </form>
        </div>

        <div class="card">
          <h1>🗃️ Database Management</h1>
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
          <a href="/" class="btn btn-secondary">Back to Calendar</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Handle bulk import
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
              <link rel="stylesheet" href="/styles.css">
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
                    <a href="/" class="btn btn-secondary">Back to Calendar</a>
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
                    <a href="/manage-users" class="btn btn-primary">Add Members</a>
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
