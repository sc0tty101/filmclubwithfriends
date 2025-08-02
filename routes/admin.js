const express = require('express');
const router = express.Router();

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

module.exports = router;
