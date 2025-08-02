const express = require('express');
const router = express.Router();

// TMDB API key (you already have this in your main app)
const TMDB_API_KEY = 'ac0757cdc5f572f37ea1a48e787f9e99';

// NOMINATION PAGE
router.get('/nominate/:date', (req, res) => {
  const weekDate = req.params.date;
  
  // Get week info and existing nominations
  req.db.get("SELECT * FROM weeks WHERE week_date = ?", [weekDate], (err, week) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }
    
    if (!week) {
      return res.status(404).send('Week not found');
    }
    
    // Get existing nominations for this week
    req.db.all(
      "SELECT * FROM nominations WHERE week_id = ? ORDER BY nominated_at",
      [week.id],
      (err, nominations) => {
        if (err) {
          console.error(err);
          return res.status(500).send('Database error');
        }

        res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Nominate Film - Film Club</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <link rel="stylesheet" href="/styles.css">
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🎬 Nominate a Film</h1>
                <p><strong>Week:</strong> ${new Date(weekDate).toLocaleDateString()}</p>
                <p><strong>Genre:</strong> ${week.genre}</p>
              </div>

              <div class="card">
                <h2>Current Nominations (${nominations.length})</h2>
                <div class="nominations-list">
                  ${nominations.length === 0 ? 
                    '<p style="text-align: center; color: #666;">No nominations yet. Be the first!</p>' :
                    nominations.map(nom => `
                      <div class="nomination-item">
                        <div class="film-info">
                          ${nom.poster_url ? `<img src="https://image.tmdb.org/t/p/w92${nom.poster_url}" alt="${nom.film_title}" class="film-poster">` : ''}
                          <div class="film-details">
                            <h4>${nom.film_title} (${nom.film_year})</h4>
                            <p><strong>Nominated by:</strong> ${nom.user_name}</p>
                          </div>
                        </div>
                      </div>
                    `).join('')
                  }
                </div>
              </div>

              <div class="card">
                <h2>Add Your Nomination</h2>
                <div class="form-group">
                  <label>Search for a film:</label>
                  <input type="text" id="filmSearch" placeholder="Start typing a film title..." onkeyup="searchFilms()">
                  <div id="searchResults" class="search-results"></div>
                </div>

                <form id="nominationForm" action="/nominate/${weekDate}" method="POST" style="display: none;">
                  <input type="hidden" id="selectedFilmId" name="tmdbId">
                  <input type="hidden" id="selectedFilmTitle" name="filmTitle">
                  <input type="hidden" id="selectedFilmYear" name="filmYear">
                  <input type="hidden" id="selectedPosterUrl" name="posterUrl">
                  
                  <div class="selected-film" id="selectedFilm"></div>
                  
                  <div class="actions">
                    <button type="submit" class="btn btn-primary">Nominate This Film</button>
                    <button type="button" class="btn btn-secondary" onclick="clearSelection()">Clear Selection</button>
                  </div>
                </form>
              </div>

              <div class="actions center">
                <a href="/" class="btn btn-secondary">Back to Calendar</a>
                ${nominations.length >= 3 ? '<button class="btn btn-success" onclick="moveToVoting()">Move to Voting Phase</button>' : ''}
              </div>
            </div>

            <script>
            let searchTimeout;
            
            function searchFilms() {
              const query = document.getElementById('filmSearch').value.trim();
              
              if (query.length < 2) {
                document.getElementById('searchResults').innerHTML = '';
                return;
              }
              
              // Debounce search
              clearTimeout(searchTimeout);
              searchTimeout = setTimeout(() => {
                fetch(\`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=\${encodeURIComponent(query)}\`)
                  .then(response => response.json())
                  .then(data => {
                    displaySearchResults(data.results || []);
                  })
                  .catch(error => {
                    console.error('Search error:', error);
                    document.getElementById('searchResults').innerHTML = '<p style="color: red;">Search failed. Please try again.</p>';
                  });
              }, 300);
            }
            
            function displaySearchResults(films) {
              const resultsDiv = document.getElementById('searchResults');
              
              if (films.length === 0) {
                resultsDiv.innerHTML = '<p style="color: #666;">No films found. Try a different search.</p>';
                return;
              }
              
              resultsDiv.innerHTML = films.slice(0, 8).map(film => \`
                <div class="search-result-item" onclick="selectFilm(\${film.id}, '\${film.title.replace(/'/g, "\\\\'")}', '\${film.release_date ? film.release_date.substring(0, 4) : 'Unknown'}', '\${film.poster_path || ''}')">
                  <div class="result-info">
                    \${film.poster_path ? \`<img src="https://image.tmdb.org/t/p/w92\${film.poster_path}" alt="\${film.title}" class="result-poster">\` : '<div class="result-poster-placeholder">No Image</div>'}
                    <div class="result-details">
                      <strong>\${film.title}</strong> (\${film.release_date ? film.release_date.substring(0, 4) : 'Unknown'})
                      <p>\${film.overview ? film.overview.substring(0, 150) + '...' : 'No description available.'}</p>
                    </div>
                  </div>
                </div>
              \`).join('');
            }
            
            function selectFilm(id, title, year, posterPath) {
              document.getElementById('selectedFilmId').value = id;
              document.getElementById('selectedFilmTitle').value = title;
              document.getElementById('selectedFilmYear').value = year;
              document.getElementById('selectedPosterUrl').value = posterPath;
              
              document.getElementById('selectedFilm').innerHTML = \`
                <h3>Selected Film:</h3>
                <div class="selected-film-display">
                  \${posterPath ? \`<img src="https://image.tmdb.org/t/p/w154\${posterPath}" alt="\${title}" class="selected-poster">\` : ''}
                  <div class="selected-details">
                    <h4>\${title} (\${year})</h4>
                  </div>
                </div>
              \`;
              
              document.getElementById('nominationForm').style.display = 'block';
              document.getElementById('searchResults').innerHTML = '';
              document.getElementById('filmSearch').value = '';
            }
            
            function clearSelection() {
              document.getElementById('nominationForm').style.display = 'none';
              document.getElementById('filmSearch').value = '';
              document.getElementById('searchResults').innerHTML = '';
            }
            
            function moveToVoting() {
              if (confirm('Move this week to voting phase? Members will no longer be able to nominate films.')) {
                fetch('/move-to-voting/${weekDate}', { method: 'POST' })
                  .then(() => window.location.href = '/')
                  .catch(error => alert('Error moving to voting phase'));
              }
            }
            </script>
          </body>
          </html>
        `);
      }
    );
  });
});

// HANDLE FILM NOMINATION
router.post('/nominate/:date', (req, res) => {
  const weekDate = req.params.date;
  const { tmdbId, filmTitle, filmYear, posterUrl } = req.body;
  const userName = 'CurrentUser'; // We'll improve this with user session later
  
  if (!tmdbId || !filmTitle) {
    return res.status(400).send('Film information is required');
  }
  
  // Get week ID
  req.db.get("SELECT id FROM weeks WHERE week_date = ?", [weekDate], (err, week) => {
    if (err || !week) {
      console.error(err);
      return res.status(500).send('Week not found');
    }
    
    // Check if user already nominated for this week
    req.db.get(
      "SELECT id FROM nominations WHERE week_id = ? AND user_name = ?",
      [week.id, userName],
      (err, existing) => {
        if (err) {
          console.error(err);
          return res.status(500).send('Database error');
        }
        
        if (existing) {
          return res.status(400).send('You have already nominated a film for this week');
        }
        
        // Insert nomination
        req.db.run(
          "INSERT INTO nominations (week_id, user_name, film_title, film_year, poster_url, tmdb_id) VALUES (?, ?, ?, ?, ?, ?)",
          [week.id, userName, filmTitle, filmYear, posterUrl, tmdbId],
          function(err) {
            if (err) {
              console.error(err);
              return res.status(500).send('Failed to save nomination');
            }
            
            res.redirect(`/nominate/${weekDate}?message=Film nominated successfully`);
          }
        );
      }
    );
  });
});

// MOVE TO VOTING PHASE
router.post('/move-to-voting/:date', (req, res) => {
  const weekDate = req.params.date;
  
  req.db.run(
    "UPDATE weeks SET phase = 'voting' WHERE week_date = ?",
    [weekDate],
    function(err) {
      if (err) {
        console.error(err);
        return res.status(500).send('Database error');
      }
      res.json({ success: true });
    }
  );
});

module.exports = router;
