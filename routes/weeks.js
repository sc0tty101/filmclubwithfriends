const express = require('express');
const router = express.Router();
const { getGenres } = require('../database/setup');

// SET GENRE PAGE
router.get('/set-genre/:date', (req, res) => {
  const weekDate = req.params.date;
  
  // Get genres from database
  getGenres((err, genres) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Set Genre - Film Club</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="/styles.css">
      </head>
      <body>
        <div class="container">
          <div class="card">
            <h1>Set Genre for Week</h1>
            <p><strong>Week starting:</strong> ${new Date(weekDate).toLocaleDateString()}</p>
            
            <form action="/set-genre/${weekDate}" method="POST">
              <div class="form-group">
                <label>Choose Genre:</label>
                <select name="genre" required>
                  <option value="">Select a genre...</option>
                  ${genres.map(genre => `<option value="${genre.name}">${genre.name}</option>`).join('')}
                </select>
              </div>
              
              <div class="form-group">
                <label>Or enter custom genre:</label>
                <input type="text" name="customGenre" placeholder="e.g., XMAS FILMS, 80s Movies">
              </div>
              
              <div class="actions">
                <button type="submit" class="btn btn-primary">Set Genre</button>
                <a href="/" class="btn btn-secondary">Cancel</a>
              </div>
            </form>
          </div>
        </div>
      </body>
      </html>
    `);
  });
});

// HANDLE GENRE SETTING
router.post('/set-genre/:date', (req, res) => {
  const weekDate = req.params.date;
  const genre = req.body.customGenre || req.body.genre;
  const currentUser = 'Unknown'; // We'll improve this later
  
  if (!genre) {
    return res.status(400).send('Genre is required');
  }

  // Insert or update week in database
  req.db.run(
    `INSERT OR REPLACE INTO weeks (week_date, genre, genre_source, phase, created_by) 
     VALUES (?, ?, 'user', 'nomination', ?)`,
    [weekDate, genre, currentUser],
    function(err) {
      if (err) {
        console.error(err);
        return res.status(500).send('Database error');
      }
      res.redirect('/');
    }
  );
});

// RANDOM GENRE ENDPOINT
router.get('/random-genre/:date', (req, res) => {
  const weekDate = req.params.date;
  
  // Get genres from database and pick random one
  getGenres((err, genres) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }

    if (genres.length === 0) {
      return res.status(400).send('No genres available. Please add some genres first.');
    }

    const randomGenre = genres[Math.floor(Math.random() * genres.length)].name;
    
    req.db.run(
      `UPDATE weeks SET genre = ?, genre_source = 'random', phase = 'nomination' 
       WHERE week_date = ?`,
      [randomGenre, weekDate],
      function(err) {
        if (err) {
          console.error(err);
          return res.status(500).send('Database error');
        }
        res.redirect('/');
      }
    );
  });
});

module.exports = router;
