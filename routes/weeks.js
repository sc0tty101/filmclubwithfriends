// routes/weeks.js - Updated with authentication
const express = require('express');
const router = express.Router();
const { getGenres } = require('../database/setup');
const { dbGet, dbRun, dbTransaction } = require('../utils/dbHelpers');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { validateDate } = require('../middleware/validation');
const { PHASES } = require('../config/constants');

// Set genre page
router.get('/set-genre/:date', requireAuth, validateDate, (req, res) => {
  const weekDate = req.params.date;
  const currentUser = req.session?.userName || '';

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
                <select name="genre" id="genreSelect">
                  <option value="">Select a genre...</option>
                  ${genres.map(genre => 
                    `<option value="${genre.id}">${genre.name}</option>`
                  ).join('')}
                </select>
              </div>
              
              <div class="form-group">
                <label>Or enter custom genre:</label>
                <input type="text" name="customGenre" id="customGenre" 
                       placeholder="e.g., XMAS FILMS, 80s Movies">
              </div>
              
              <div class="actions">
                <button type="submit" class="btn btn-primary">Set Genre</button>
                <button type="button" class="btn btn-warning" onclick="setRandomGenre()">
                  🎲 Random Genre
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
          }
        </script>
      </body>
      </html>
    `);
  });
});

// Handle genre setting
router.post('/set-genre/:date', requireAuth, validateDate, (req, res) => {
  const weekDate = req.params.date;
  const genreId = req.body.genre;
  const customGenre = req.body.customGenre?.trim();
  
  if (!genreId && !customGenre) {
    return res.status(400).send('Please select or enter a genre');
  }

  // Function to create or update week
  function setWeekGenre(finalGenreId) {
    // Check if week exists and ensure phase allows updates
    req.db.get("SELECT id, phase, genre_id FROM weeks WHERE week_date = ?", [weekDate], (err, week) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Database error');
      }

      if (week && week.phase && !['planning', 'nomination'].includes(week.phase)) {
        return res.status(400).send('Cannot change genre after voting has started.');
      }

      if (week) {
        // Update existing week
        const genreChanged = String(week.genre_id || '') !== String(finalGenreId);

        const updateWeek = () => {
          req.db.run(
            "UPDATE weeks SET genre_id = ? WHERE id = ?",
            [finalGenreId, week.id],
            (err) => {
              if (err) {
                console.error(err);
                return res.status(500).send('Failed to update week');
              }
              res.redirect('/');
            }
          );
        };

        if (genreChanged) {
          req.db.run(
            'DELETE FROM nominations WHERE week_id = ?',
            [week.id],
            (deleteErr) => {
              if (deleteErr) {
                console.error(deleteErr);
                return res.status(500).send('Failed to clear nominations for updated genre');
              }
              updateWeek();
            }
          );
        } else {
          updateWeek();
        }
      } else {
        // Create new week
        req.db.run(
          "INSERT INTO weeks (week_date, genre_id) VALUES (?, ?)",
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

// Open nominations (admin only)
router.post('/open-nominations/:date', requireAdmin, validateDate, (req, res) => {
  const weekDate = req.params.date;

  req.db.get(
    "SELECT id, genre_id, phase FROM weeks WHERE week_date = ?",
    [weekDate],
    (err, week) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Database error');
      }

      if (!week) {
        return res.status(404).send('Week not found');
      }

      if (!week.genre_id) {
        return res.status(400).send('Set a genre before opening nominations');
      }

      if (week.phase === 'nomination') {
        return res.redirect('/');
      }

      req.db.run(
        "UPDATE weeks SET phase = 'nomination' WHERE id = ?",
        [week.id],
        (updateErr) => {
          if (updateErr) {
            console.error(updateErr);
            return res.status(500).send('Failed to open nominations');
          }
          res.redirect('/');
        }
      );
    }
  );
});

// Reset a week's data (admin only) - clears nominations, votes, results, and genre
router.post('/reset-week/:date', requireAdmin, validateDate, async (req, res) => {
  const weekDate = req.params.date;

  try {
    let week = await dbGet(
      req.db,
      'SELECT id FROM weeks WHERE week_date = ?',
      [weekDate]
    );

    // If the week doesn't exist yet, create a blank entry so we can reset it
    if (!week) {
      const insertResult = await dbRun(
        req.db,
        'INSERT INTO weeks (week_date, phase, genre_id) VALUES (?, ?, NULL)',
        [weekDate, PHASES.PLANNING]
      );
      week = { id: insertResult.lastID };
    }

    await dbTransaction(req.db, [
      { sql: 'DELETE FROM votes WHERE week_id = ?', params: [week.id] },
      { sql: 'DELETE FROM results WHERE week_id = ?', params: [week.id] },
      { sql: 'DELETE FROM nominations WHERE week_id = ?', params: [week.id] },
      {
        sql: 'UPDATE weeks SET genre_id = NULL, phase = ? WHERE id = ?',
        params: [PHASES.PLANNING, week.id]
      }
    ]);

    res.redirect('/');
  } catch (err) {
    console.error('Reset week error:', err);
    res.status(500).send('Failed to reset week');
  }
});

module.exports = router;
