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
        <link rel="stylesheet" href="/styles/main.css">
      </head>
      <body>
        <div class="container">
          <div class="card">
            <h1>Set Genre for Week</h1>
            <p><strong>Week starting:</strong> ${new Date(weekDate).toLocaleDateString()}</p>
            
            <form action="/set-genre/${weekDate}" method="POST" onsubmit="return validateGenreForm()">
              <div class="form-group">
                <label>Choose Genre:</label>
                <select name="genre" id="genreSelect" onchange="clearCustomWhenDropdownSelected()">
                  <option value="">Select a genre...</option>
                  ${genres.map(genre => `<option value="${genre.name}">${genre.name}</option>`).join('')}
                </select>
              </div>
              
              <div class="form-group">
                <label>Or enter custom genre:</label>
                <input type="text" name="customGenre" id="customGenre" placeholder="e.g., XMAS FILMS, 80s Movies" oninput="clearDropdownWhenCustomTyped()">
              </div>
              
              <div class="actions">
                <button type="submit" class="btn btn-primary">Set Genre</button>
                <button type="button" class="btn btn-warning" onclick="setRandomGenre()">🎲 Pick Random & Set</button>
                <a href="/" class="btn btn-secondary">Cancel</a>
              </div>
            </form>
          </div>
        </div>

        <script>
        function validateGenreForm() {
          const dropdown = document.getElementById('genreSelect').value;
          const custom = document.getElementById('customGenre').value.trim();
          
          if (!dropdown && !custom) {
            alert('Please either select a genre from the dropdown OR enter a custom genre.');
            return false;
          }
          
          return true;
        }
        
        function clearCustomWhenDropdownSelected() {
          const dropdown = document.getElementById('genreSelect');
          const custom = document.getElementById('customGenre');
          
          if (dropdown.value) {
            custom.value = '';
          }
        }
        
        function clearDropdownWhenCustomTyped() {
          const dropdown = document.getElementById('genreSelect');
          const custom = document.getElementById('customGenre');
          
          if (custom.value.trim()) {
            dropdown.value = '';
          }
        }
        
        function setRandomGenre() {
          const genreSelect = document.querySelector('select[name="genre"]');
          const options = Array.from(genreSelect.options).filter(option => option.value !== "");
          
          if (options.length > 0) {
            const randomIndex = Math.floor(Math.random() * options.length);
            const randomOption = options[randomIndex];
            genreSelect.value = randomOption.value;
            
            // Clear custom field since we're using dropdown
            document.getElementById('customGenre').value = '';
            
            // Submit the form
            document.querySelector('form').submit();
          } else {
            alert('No genres available to choose from!');
          }
        }
        </script>
      </body>
      </html>
    `);
  });
});

// HANDLE GENRE SETTING
router.post('/set-genre/:date', (req, res) => {
  const weekDate = req.params.date;
  // Priority: custom genre first, then dropdown selection
  const genre = (req.body.customGenre && req.body.customGenre.trim()) || req.body.genre;
  const currentUser = 'Unknown'; // We'll improve this later
  
  console.log('Genre setting request:', { customGenre: req.body.customGenre, dropdownGenre: req.body.genre, finalGenre: genre }); // Debug log
  
  if (!genre) {
    return res.status(400).send('Genre is required - please select from dropdown or enter custom genre');
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
      
      console.log('Genre set successfully:', genre); // Debug log
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
