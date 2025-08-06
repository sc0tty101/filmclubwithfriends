const express = require('express');
const router = express.Router();

// ENHANCED NOMINATION PAGE - Replace the GET /nominate/:date route in routes/films.js
router.get('/nominate/:date', (req, res) => {
  const weekDate = req.params.date;
  const currentUser = req.query.user || 'Unknown';
  
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

        // Check if current user already nominated
        const userNomination = nominations.find(nom => nom.user_name === currentUser);
        const canNominate = currentUser !== 'Unknown' && !userNomination;
        const needsMoreFilms = nominations.length < 3;

        res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Nominate Film - Film Club</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <link rel="stylesheet" href="/styles/main.css">
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🎬 Nominate a Film</h1>
                <p><strong>Week:</strong> ${new Date(weekDate).toLocaleDateString()}</p>
                <p><strong>Genre:</strong> ${week.genre}</p>
                <p><strong>Current User:</strong> ${currentUser}</p>
                
                <!-- Progress Indicator -->
                <div class="progress-indicator large">
                  <div class="progress-step completed">
                    <span class="step-icon">🎭</span>
                    <span class="step-label">Genre Set</span>
                  </div>
                  <div class="progress-step active">
                    <span class="step-icon">🎬</span>
                    <span class="step-label">Nominations</span>
                  </div>
                  <div class="progress-step">
                    <span class="step-icon">🗳️</span>
                    <span class="step-label">Voting</span>
                  </div>
                  <div class="progress-step">
                    <span class="step-icon">🏆</span>
                    <span class="step-label">Results</span>
                  </div>
                </div>
              </div>

              <div class="card">
                <div class="section-header">
                  <h2>Current Nominations</h2>
                  <div class="nomination-progress">
                    <span class="count-badge ${nominations.length >= 3 ? 'complete' : ''}">${nominations.length}</span>
                    <span class="progress-text">
                      ${nominations.length === 0 ? 'No nominations yet. Be the first!' : 
                        nominations.length < 3 ? `Need ${3 - nominations.length} more nomination${3 - nominations.length !== 1 ? 's' : ''} to start voting` :
                        'Ready for voting! 🎉'}
                    </span>
                  </div>
                </div>
                
                <div class="nominations-list">
                  ${nominations.length === 0 ? 
                    '<div class="empty-state"><p>No nominations yet. Be the first to nominate a film!</p></div>' :
                    nominations.map(nom => `
                      <div class="nomination-item">
                        <div class="film-info">
                          ${nom.poster_url ? `<img src="https://image.tmdb.org/t/p/w92${nom.poster_url}" alt="${nom.film_title}" class="film-poster">` : '<div class="poster-placeholder">No Image</div>'}
                          <div class="film-details">
                            <h4>${nom.film_title} (${nom.film_year})</h4>
                            <p><strong>Nominated by:</strong> ${nom.user_name}</p>
                          </div>
                        </div>
                        ${nom.user_name === currentUser ? `
                          <div class="nomination-actions">
                            <button class="btn btn-secondary btn-small" onclick="editNomination(${nom.id}, '${nom.film_title}', '${nom.film_year}')">Edit</button>
                          </div>
                        ` : ''}
                      </div>
                    `).join('')
                  }
                </div>
              </div>

              ${canNominate ? `
                <div class="card">
                  <h2>Add Your Nomination</h2>
                  <div id="errorMessage" class="alert alert-error" style="display: none;"></div>
                  
                  <div class="form-group">
                    <label>Search for a film:</label>
                    <input type="text" id="filmSearch" placeholder="Start typing a film title..." onkeyup="searchFilms()">
                    <div id="searchResults" class="search-results"></div>
                  </div>

                  <form id="nominationForm" style="display: none;">
                    <input type="hidden" id="selectedFilmId" name="tmdbId">
                    <input type="hidden" id="selectedFilmTitle" name="filmTitle">
                    <input type="hidden" id="selectedFilmYear" name="filmYear">
                    <input type="hidden" id="selectedPosterUrl" name="posterUrl">
                    
                    <div class="selected-film" id="selectedFilm"></div>
                    
                    <div class="actions">
                      <button type="button" class="btn btn-primary" onclick="submitNomination()">Nominate This Film</button>
                      <button type="button" class="btn btn-secondary" onclick="clearSelection()">Clear Selection</button>
                    </div>
                  </form>
                </div>
              ` : `
                <div class="card">
                  <div class="alert ${currentUser === 'Unknown' ? 'alert-error' : 'alert-success'}">
                    ${currentUser === 'Unknown' ? 
                      'Please select your name on the main page first.' : 
                      `You (${currentUser}) have already nominated a film for this week. You can edit your nomination above.`}
                  </div>
                </div>
              `}

              <div class="card">
                <div class="progress-actions">
                  <a href="/" class="btn btn-secondary">Back to Calendar</a>
                  
                  ${needsMoreFilms ? `
                    <div class="voting-status">
                      <button class="btn btn-success" disabled title="Need at least 3 films to start voting">
                        🗳️ Start Voting
                      </button>
                      <div class="voting-requirement">
                        <span class="requirement-text">Need ${3 - nominations.length} more nomination${3 - nominations.length !== 1 ? 's' : ''} to start voting</span>
                        <div class="mini-progress">
                          ${Array.from({length: 3}, (_, i) => `
                            <div class="mini-dot ${i < nominations.length ? 'filled' : ''}"></div>
                          `).join('')}
                        </div>
                      </div>
                    </div>
                  ` : `
                    <button class="btn btn-success btn-large" onclick="moveToVoting()">
                      🗳️ Start Voting Phase (${nominations.length} films ready)
                    </button>
                  `}
                </div>
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
                fetch(\`https://api.themoviedb.org/3/search/movie?api_key=${process.env.TMDB_API_KEY}&query=\${encodeURIComponent(query)}\`)
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
                  \${posterPath ? \`<img src="https://image.tmdb.org/t/p/w154\${posterPath}" alt="\${title}" class="selected-poster">\` : '<div class="selected-poster-placeholder">No Image</div>'}
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
              document.getElementById('errorMessage').style.display = 'none';
            }
            
            function submitNomination() {
              const formData = {
                tmdbId: document.getElementById('selectedFilmId').value,
                filmTitle: document.getElementById('selectedFilmTitle').value,
                filmYear: document.getElementById('selectedFilmYear').value,
                posterUrl: document.getElementById('selectedPosterUrl').value,
                userName: '${currentUser}'
              };
              
              fetch('/nominate/${weekDate}', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
              })
              .then(response => response.json())
              .then(data => {
                if (data.success) {
                  window.location.reload();
                } else {
                  showError(data.error || 'Failed to nominate film');
                }
              })
              .catch(error => {
                showError('Network error. Please try again.');
              });
            }
            
            function showError(message) {
              const errorDiv = document.getElementById('errorMessage');
              errorDiv.textContent = message;
              errorDiv.style.display = 'block';
            }
            
            function editNomination(nominationId, currentTitle, currentYear) {
              if (confirm(\`Replace "\${currentTitle} (\${currentYear})" with a new film?\`)) {
                fetch('/delete-nomination/' + nominationId, { method: 'POST' })
                  .then(response => response.json())
                  .then(data => {
                    if (data.success) {
                      window.location.reload();
                    } else {
                      alert('Failed to remove current nomination');
                    }
                  })
                  .catch(error => {
                    alert('Error removing nomination');
                  });
              }
            }
            
            function moveToVoting() {
              const user = localStorage.getItem('currentUser');
              if (!user) {
                alert('Please select your name on the main page first!');
                return false;
              }
              
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
  const { tmdbId, filmTitle, filmYear, posterUrl, userName } = req.body;
  
  if (!tmdbId || !filmTitle || !userName || userName === 'Unknown') {
    return res.json({ success: false, error: 'Film information and user name are required' });
  }
  
  // Get week ID
  req.db.get("SELECT id FROM weeks WHERE week_date = ?", [weekDate], (err, week) => {
    if (err || !week) {
      console.error(err);
      return res.json({ success: false, error: 'Week not found' });
    }
    
    // Check if user already nominated for this week
    req.db.get(
      "SELECT id FROM nominations WHERE week_id = ? AND user_name = ?",
      [week.id, userName],
      (err, existing) => {
        if (err) {
          console.error(err);
          return res.json({ success: false, error: 'Database error' });
        }
        
        if (existing) {
          return res.json({ success: false, error: 'You have already nominated a film for this week' });
        }
        
        // Insert nomination
        req.db.run(
          "INSERT INTO nominations (week_id, user_name, film_title, film_year, poster_url, tmdb_id) VALUES (?, ?, ?, ?, ?, ?)",
          [week.id, userName, filmTitle, filmYear, posterUrl, tmdbId],
          function(err) {
            if (err) {
              console.error(err);
              return res.json({ success: false, error: 'Failed to save nomination' });
            }
            
            res.json({ success: true });
          }
        );
      }
    );
  });
});

// DELETE NOMINATION
router.post('/delete-nomination/:id', (req, res) => {
  const nominationId = req.params.id;
  
  req.db.run(
    "DELETE FROM nominations WHERE id = ?",
    [nominationId],
    function(err) {
      if (err) {
        console.error(err);
        return res.json({ success: false, error: 'Database error' });
      }
      
      if (this.changes === 0) {
        return res.json({ success: false, error: 'Nomination not found' });
      }
      
      res.json({ success: true });
    }
  );
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
