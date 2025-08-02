const express = require('express');
const router = express.Router();
const { getGenres } = require('../database/setup');

// GENRE MANAGEMENT PAGE
router.get('/manage-genres', (req, res) => {
  getGenres((err, genres) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Manage Genres - Film Club</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="/styles.css">
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎭 Manage Film Genres</h1>
            <p>Add or remove genres for your film club</p>
          </div>

          <div class="card">
            <h2>Current Genres (${genres.length})</h2>
            <div class="genre-list">
              ${genres.length === 0 ? 
                '<p style="text-align: center; color: #666;">No genres yet. Add some below!</p>' :
                `<div class="genre-grid">
                  ${genres.map(genre => `
                    <div class="genre-card">
                      <span class="genre-name">${genre.name}</span>
                      <form action="/remove-genre" method="POST" style="display: inline;" onsubmit="return confirm('Are you sure you want to remove ${genre.name}?')">
                        <input type="hidden" name="genreName" value="${genre.name}">
                        <button type="submit" class="btn btn-danger">Remove</button>
                      </form>
                    </div>
                  `).join('')}
                </div>`
              }
            </div>
          </div>

          <div class="card">
            <h2>Add New Genre</h2>
            <form action="/add-genre" method="POST">
              <div class="form-group">
                <label>Genre Name:</label>
                <input type="text" name="genreName" placeholder="e.g., Western, Film Noir, Superhero" required maxlength="50">
              </div>
              <div class="actions">
                <button type="submit" class="btn btn-primary">Add Genre</button>
              </div>
            </form>
            
            <div class="genre-suggestions">
              <h4>💡 Genre Ideas:</h4>
              <p>
                <strong>Classic:</strong> Western, Film Noir, Silent Films<br>
                <strong>Modern:</strong> Superhero, Found Footage, Mockumentary<br>
                <strong>Seasonal:</strong> Christmas Films, Summer Blockbusters, Halloween Horror<br>
                <strong>Origin:</strong> French Cinema, Japanese Films, Bollywood<br>
                <strong>Decade:</strong> 80s Movies, 90s Classics, 2000s Nostalgia<br>
                <strong>Fun:</strong> So Bad It's Good, Guilty Pleasures, Cult Classics
              </p>
            </div>
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

// ADD GENRE
router.post('/add-genre', (req, res) => {
  const genreName = req.body.genreName?.trim();
  
  if (!genreName) {
    return res.redirect('/manage-genres?message=Genre name is required&type=error');
  }

  if (genreName.length > 50) {
    return res.redirect('/manage-genres?message=Genre name too long (max 50 characters)&type=error');
  }

  req.db.run(
    "INSERT INTO genres (name) VALUES (?)",
    [genreName],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.redirect('/manage-genres?message=Genre already exists&type=error');
        }
        console.error(err);
        return res.redirect('/manage-genres?message=Failed to add genre&type=error');
      }
      res.redirect('/manage-genres?message=Genre added successfully');
    }
  );
});

// REMOVE GENRE
router.post('/remove-genre', (req, res) => {
  const genreName = req.body.genreName;
  
  if (!genreName) {
    return res.redirect('/manage-genres?message=Genre name is required&type=error');
  }

  req.db.run(
    "UPDATE genres SET is_active = 0 WHERE name = ?",
    [genreName],
    function(err) {
      if (err) {
        console.error(err);
        return res.redirect('/manage-genres?message=Failed to remove genre&type=error');
      }
      
      if (this.changes === 0) {
        return res.redirect('/manage-genres?message=Genre not found&type=error');
      }
      
      res.redirect('/manage-genres?message=Genre removed successfully');
    }
  );
});

module.exports = router;
