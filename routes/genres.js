// routes/genres.js - Updated with authentication
const express = require('express');
const router = express.Router();
const { getGenres } = require('../database/setup');
const { requireAdmin } = require('../middleware/auth');
const { validateGenreName } = require('../middleware/validation');

// Genre management page
router.get('/manage-genres', requireAdmin, (req, res) => {
  getGenres((err, genres) => {
    if (err) {
      console.error(err);
      genres = [];
    }

    const message = req.query.message;
    const error = req.query.error;

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Manage Genres - Film Club</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="/styles/main.css">
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎭 Manage Genres</h1>
            <p>Add or remove film genres</p>
          </div>

          ${message ? `<div class="alert alert-success">${message}</div>` : ''}
          ${error ? `<div class="alert alert-error">${error}</div>` : ''}

          <div class="card">
            <h2>Current Genres (${genres.length})</h2>
            ${genres.length === 0 ? 
              '<p style="text-align: center; color: #999;">No genres yet. Add some below!</p>' :
              `<div class="item-list">
                ${genres.map(genre => `
                  <div class="item-card">
                    <span>${genre.name}</span>
                    <form action="/remove-genre" method="POST" style="display: inline;" 
                          onsubmit="return confirm('Remove ${genre.name}?')">
                      <input type="hidden" name="genreId" value="${genre.id}">
                      <button type="submit" class="btn btn-danger btn-small">Remove</button>
                    </form>
                  </div>
                `).join('')}
              </div>`
            }
          </div>

          <div class="card">
            <h2>Add New Genre</h2>
            <form action="/add-genre" method="POST">
              <div class="form-group">
                <label>Genre Name:</label>
                <input type="text" name="genreName" required maxlength="50" 
                       placeholder="e.g., Action, Comedy, Film Noir">
              </div>
              <button type="submit" class="btn btn-primary">Add Genre</button>
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

// Add genre
router.post('/add-genre', requireAdmin, validateGenreName, (req, res) => {
  const genreName = req.body.genreName?.trim();
  
  if (!genreName) {
    return res.redirect('/manage-genres?error=Genre name is required');
  }

  req.db.run(
    "INSERT INTO genres (name) VALUES (?)",
    [genreName],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.redirect('/manage-genres?error=Genre already exists');
        }
        return res.redirect('/manage-genres?error=Failed to add genre');
      }
      res.redirect('/manage-genres?message=Genre added successfully');
    }
  );
});

// Remove genre
router.post('/remove-genre', requireAdmin, (req, res) => {
  const genreId = req.body.genreId;
  
  req.db.run(
    "UPDATE genres SET is_active = 0 WHERE id = ?",
    [genreId],
    function(err) {
      if (err) {
        return res.redirect('/manage-genres?error=Failed to remove genre');
      }
      res.redirect('/manage-genres?message=Genre removed');
    }
  );
});

module.exports = router;
