// routes/weeks.js - Simplified week genre setting
const express = require('express');
const router = express.Router();
const { getGenres } = require('../database/setup');

// Set genre page
router.get('/set-genre/:date', (req, res) => {
  const weekDate = req.params.date;
  const currentUser = req.query.user || '';
  
  getGenres((err, genres) => {
    if (err) {
      console.error(err);
      genres = [];
    }

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Set Genre - Film Club</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="/styles/main.css">
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Set Genre for Week</h1>
            <p>Week starting: ${new Date(weekDate).toLocaleDateString()}</p>
          </div>
          
          <div class="card">
            <form action="/set-genre/${weekDate}" method="POST">
              <input type="hidden" name="user" value="${currentUser}">
              
              <div class="form-group">
                <label>Choose Genre:</label>
                <select name="genre" id="genreSelect" autofocus aria-label="Choose genre">
                  <option value="">Select a genre...</option>
                  ${genres.map(genre => 
                    `<option value="${genre.id}">${genre.name}</option>`
                  ).join('')}
                </select>
              </div>
              
              <div class="form-group">
                <label>Or enter custom genre:</label>
                <input type="text" name="customGenre" id="customGenre" 
                       placeholder="e.g., XMAS FILMS, 80s Movies" aria-label="Custom genre">
              </div>
              
              <div class="actions">
                <button type="submit" class="btn btn-primary">Set Genre</button>
                <button type="button" class="btn btn-warning" onclick="setRandomGenre()" id="randomBtn">
                  <span id="randomSpinner" style="display:none;" class="spinner"></span>🎲 Random Genre
                </button>
                <a href="/" class="btn btn-secondary">Cancel</a>
              </div>
            </form>
          </div>
        </div>

        <script>
          // Clear the other field when one is used
          document.getElementById('genreSelect').addEventListener('change', function() {
            if (this.value) document.getElementById('customGenre').value = '';
          });
          
          document.getElementById('customGenre').addEventListener('input', function() {
            if (this.value) document.getElementById('genreSelect').value = '';
          });
          
          function setRandomGenre() {
            const btn = document.getElementById('randomBtn');
            const spinner = document.getElementById('randomSpinner');
            spinner.style.display = 'inline-block';
            btn.disabled = true;
            setTimeout(() => {
              const select = document.getElementById('genreSelect');
              const options = Array.from(select.options).filter(o => o.value);
              if (options.length > 0) {
                const random = options[Math.floor(Math.random() * options.length)];
                select.value = random.value;
                document.getElementById('customGenre').value = '';
                document.querySelector('form').submit();
              } else {
                alert('No genres available!');
              }
              spinner.style.display = 'none';
              btn.disabled = false;
            }, 400);
          }
        </script>
        <style>
          .spinner {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid #dbeafe;
            border-top: 2px solid #2563eb;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            vertical-align: middle;
            margin-right: 4px;
          }
          @keyframes spin {
            0% { transform: rotate(0deg);}
            100% { transform: rotate(360deg);}
          }
        </style>
      </body>
      </html>
    `);
  });
});

// Handle genre setting
router.post('/set-genre/:date', (req, res) => {
  const weekDate = req.params.date;
  const genreId = req.body.genre;
  const customGenre = req.body.customGenre?.trim();
  
  if (!genreId && !customGenre) {
    return res.status(400).send('Please select or enter a genre');
  }

  // Function to create or update week
  function setWeekGenre(finalGenreId) {
    // Check if week exists
    req.db.get("SELECT id FROM weeks WHERE week_date = ?", [weekDate], (err, week) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Database error');
      }

      if (week) {
        // Update existing week
        req.db.run(
          "UPDATE weeks SET genre_id = ?, phase = 'nomination' WHERE id = ?",
          [finalGenreId, week.id],
          (err) => {
            if (err) {
              console.error(err);
              return res.status(500).send('Failed to update week');
            }
            res.redirect('/');
          }
        );
      } else {
        // Create new week
        req.db.run(
          "INSERT INTO weeks (week_date, genre_id, phase) VALUES (?, ?, 'nomination')",
          [weekDate, finalGenreId],
          (err) => {
            if (err) {
              console.error(err);
              return res.status(500).send('Failed to create week');
            }
            res.redirect('/');
          }
        );
      }
    });
  }

  // If custom genre, create it first
  if (customGenre) {
    req.db.run("INSERT INTO genres (name) VALUES (?)", [customGenre], function(err) {
      if (err) {
        // Maybe it exists already
        req.db.get("SELECT id FROM genres WHERE name = ?", [customGenre], (err, genre) => {
          if (err || !genre) {
            return res.status(500).send('Failed to create genre');
          }
          setWeekGenre(genre.id);
        });
      } else {
        setWeekGenre(this.lastID);
      }
    });
  } else {
    setWeekGenre(genreId);
  }
});

module.exports = router;
