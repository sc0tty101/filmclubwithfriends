// routes/films.js - Corrected version with fixed template literals
const express = require('express');
const axios = require('axios');
const router = express.Router();
const { getOrCreateFilm } = require('../database/setup');

// TMDB API configuration
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// API ROUTES - Server-side TMDB proxy endpoints

// Search films endpoint
router.get('/api/search-films', async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter required' });
    }

    const response = await axios.get(`${TMDB_BASE_URL}/search/movie`, {
      params: {
        api_key: TMDB_API_KEY,
        query: query,
        language: 'en-US'
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('TMDB search error:', error.message);
    res.status(500).json({ 
      error: 'Failed to search films',
      details: error.message 
    });
  }
});

// Get film details endpoint
router.get('/api/film/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const response = await axios.get(`${TMDB_BASE_URL}/movie/${id}`, {
      params: {
        api_key: TMDB_API_KEY,
        append_to_response: 'credits',
        language: 'en-US'
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('TMDB film details error:', error.message);
    res.status(500).json({ 
      error: 'Failed to get film details',
      details: error.message 
    });
  }
});

// PAGE ROUTES - Nomination page and phase transitions

// Nomination page
router.get('/nominate/:date', (req, res) => {
  const weekDate = req.params.date;
  const currentUser = req.query.user || '';

  // Get week and its nominations
  req.db.get(`
    SELECT w.*, g.name as genre_name 
    FROM weeks w
    LEFT JOIN genres g ON w.genre_id = g.id
    WHERE w.week_date = ?
  `, [weekDate], (err, week) => {
    if (err || !week) {
      return res.status(404).send('Week not found');
    }

    // Get existing nominations
    req.db.all(`
      SELECT n.id, f.title, f.year, f.poster_url, m.name as nominator
      FROM nominations n
      JOIN films f ON n.film_id = f.id
      JOIN members m ON n.member_id = m.id
      WHERE n.week_id = ?
      ORDER BY n.nominated_at
    `, [week.id], (err, nominations) => {
      if (err) {
        console.error(err);
        nominations = [];
      }

      // Check if current user already nominated
      const userNominated = nominations.some(n => n.nominator === currentUser);

      // Check if current user is admin
      req.db.get("SELECT is_admin FROM members WHERE name = ? AND is_active = 1", [currentUser], (err, member) => {
        const isAdmin = member && member.is_admin;

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
                <p>Week of ${new Date(weekDate).toLocaleDateString()}</p>
                <p><strong>Genre: ${week.genre_name}</strong></p>
              </div>

              <!-- Current Nominations -->
              <div class="card">
                <h2>Current Nominations (${nominations.length})</h2>
                ${nominations.length === 0 ? 
                  '<p style="text-align: center; color: #999;">No nominations yet</p>' :
                  nominations.map(nom => `
                    <div class="film-card">
                      ${nom.poster_url ? 
                        `<img src="https://image.tmdb.org/t/p/w92${nom.poster_url}" class="film-poster">` :
                        '<div class="poster-placeholder">No poster</div>'
                      }
                      <div>
                        <strong>${nom.title}</strong> ${nom.year ? `(${nom.year})` : ''}<br>
                        <small>Nominated by ${nom.nominator}</small>
                      </div>
                      <div style="clear: both;"></div>
                    </div>
                  `).join('')
                }
                
                ${nominations.length >= 3 && week.phase === 'nomination' && isAdmin ? `
                  <div class="actions center">
                    <form action="/begin-voting/${weekDate}" method="POST">
                      <input type="hidden" name="user" value="${currentUser}">
                      <button type="submit" class="btn btn-warning">Begin Voting</button>
                    </form>
                  </div>
                ` : ''}
              </div>

              <!-- Nomination Form -->
              ${currentUser && !userNominated && week.phase === 'nomination' ? `
                <div class="card">
                  <h2>Nominate Your Film</h2>
                  <form onsubmit="return false;">
                    <div class="form-group">
                      <label>Search for a film:</label>
                      <input type="text" id="filmSearch" placeholder="Enter film title...">
                      <button type="button" onclick="searchFilms()" class="btn btn-primary">Search</button>
                    </div>
                  </form>
                  
                  <div id="searchResults"></div>
                  
                  <div id="selectedFilm" style="display: none;">
                    <h3>Selected Film:</h3>
                    <div id="selectedDetails"></div>
                    <form action="/nominate/${weekDate}" method="POST" id="nominateForm">
                      <input type="hidden" name="user" value="${currentUser}">
                      <input type="hidden" name="tmdbId" id="tmdbId">
                      <input type="hidden" name="title" id="title">
                      <input type="hidden" name="year" id="year">
                      <input type="hidden" name="posterUrl" id="posterUrl">
                      <input type="hidden" name="director" id="director">
                      <input type="hidden" name="runtime" id="runtime">
                      <input type="hidden" name="rating" id="rating">
                      <input type="hidden" name="overview" id="overview">
                      <button type="submit" class="btn btn-success">Confirm Nomination</button>
                    </form>
                  </div>
                </div>
              ` : !currentUser ? `
                <div class="card">
                  <p style="text-align: center; color: #999;">
                    Please select your name at the top of the page to nominate
                  </p>
                </div>
              ` : userNominated ? `
                <div class="card">
                  <p style="text-align: center; color: #999;">
                    You have already nominated a film for this week
                  </p>
                </div>
              ` : week.phase !== 'nomination' ? `
                <div class="card">
                  <p style="text-align: center; color: #999;">
                    Nomination phase has ended for this week
                  </p>
                </div>
              ` : ''}

              <div class="actions center">
                <a href="/" class="btn btn-secondary">Back to Calendar</a>
              </div>
            </div>

            <script>
              async function searchFilms() {
                const query = document.getElementById('filmSearch').value;
                if (!query) return;
                
                document.getElementById('searchResults').innerHTML = '<p>Searching...</p>';
                
                try {
                  const response = await fetch('/api/search-films?query=' + encodeURIComponent(query));
                  const data = await response.json();
                  
                  if (!response.ok) {
                    throw new Error(data.error || 'Search failed');
                  }
                  
                  const results = document.getElementById('searchResults');
                  
                  if (data.results && data.results.length > 0) {
                    results.innerHTML = '<div class="search-results">' +
                      data.results.slice(0, 5).map(function(film) {
                        return '<div class="search-result-item" onclick="selectFilm(' + film.id + ')">' +
                          '<strong>' + film.title + '</strong> ' +
                          (film.release_date ? '(' + film.release_date.substring(0, 4) + ')' : '') +
                          '<br><small>' + (film.overview ? film.overview.substring(0, 100) + '...' : '') + '</small>' +
                          '</div>';
                      }).join('') + '</div>';
                  } else {
                    results.innerHTML = '<p>No results found</p>';
                  }
                } catch (error) {
                  console.error('Search error:', error);
                  document.getElementById('searchResults').innerHTML = 
                    '<p style="color: red;">Search failed: ' + error.message + '</p>';
                }
              }
              
              async function selectFilm(tmdbId) {
                try {
                  const response = await fetch('/api/film/' + tmdbId);
                  const film = await response.json();
                  
                  if (!response.ok) {
                    throw new Error(film.error || 'Failed to load film details');
                  }
                  
                  document.getElementById('selectedFilm').style.display = 'block';
                  document.getElementById('searchResults').innerHTML = '';
                  
                  const director = film.credits && film.credits.crew ? film.credits.crew.find(function(c) { return c.job === 'Director'; }) : null;
                  
                  let detailsHTML = '<div class="film-card">';
                  
                  if (film.poster_path) {
                    detailsHTML += '<img src="https://image.tmdb.org/t/p/w92' + film.poster_path + '" class="film-poster">';
                  } else {
                    detailsHTML += '<div class="poster-placeholder">No poster</div>';
                  }
                  
                  detailsHTML += '<div><strong>' + film.title + '</strong> ';
                  
                  if (film.release_date) {
                    detailsHTML += '(' + film.release_date.substring(0, 4) + ')';
                  }
                  
                  detailsHTML += '<br>';
                  
                  if (director) {
                    detailsHTML += 'Director: ' + director.name + '<br>';
                  }
                  
                  if (film.runtime) {
                    detailsHTML += 'Runtime: ' + film.runtime + ' mins<br>';
                  }
                  
                  if (film.vote_average) {
                    detailsHTML += 'Rating: ' + film.vote_average + '/10';
                  }
                  
                  detailsHTML += '</div><div style="clear: both;"></div></div>';
                  
                  document.getElementById('selectedDetails').innerHTML = detailsHTML;
                  
                  document.getElementById('tmdbId').value = film.id;
                  document.getElementById('title').value = film.title;
                  document.getElementById('year').value = film.release_date ? film.release_date.substring(0, 4) : '';
                  document.getElementById('posterUrl').value = film.poster_path || '';
                  document.getElementById('director').value = director ? director.name : '';
                  document.getElementById('runtime').value = film.runtime || '';
                  document.getElementById('rating').value = film.vote_average || '';
                  document.getElementById('overview').value = film.overview || '';
                } catch (error) {
                  console.error('Film details error:', error);
                  alert('Failed to load film details: ' + error.message);
                }
              }
            </script>
          </body>
          </html>
        `);
      });
    });
  });
});

// Handle nomination
router.post('/nominate/:date', (req, res) => {
  const weekDate = req.params.date;
  const { user, tmdbId, title, year, posterUrl, director, runtime, rating, overview } = req.body;

  if (!user || !title) {
    return res.status(400).send('User and film title required');
  }

  // Get week, member, and create film
  req.db.get("SELECT id FROM weeks WHERE week_date = ?", [weekDate], (err, week) => {
    if (err || !week) {
      return res.status(404).send('Week not found');
    }

    req.db.get("SELECT id FROM members WHERE name = ?", [user], (err, member) => {
      if (err || !member) {
        return res.status(404).send('Member not found');
      }

      // Check if already nominated
      req.db.get(
        "SELECT id FROM nominations WHERE week_id = ? AND member_id = ?",
        [week.id, member.id],
        (err, existing) => {
          if (existing) {
            return res.status(400).send('You already nominated');
          }

          // Create film
          getOrCreateFilm({
            tmdb_id: tmdbId || null,
            title,
            year: year || null,
            director: director || null,
            runtime: runtime || null,
            poster_url: posterUrl || null,
            tmdb_rating: rating || null,
            overview: overview || null
          }, (err, filmId) => {
            if (err || !filmId) {
              return res.status(500).send('Failed to save film');
            }

            // Create nomination
            req.db.run(
              "INSERT INTO nominations (week_id, film_id, member_id) VALUES (?, ?, ?)",
              [week.id, filmId, member.id],
              (err) => {
                if (err) {
                  return res.status(500).send('Failed to save nomination');
                }
                res.redirect(`/nominate/${weekDate}?user=${user}`);
              }
            );
          });
        }
      );
    });
  });
});

// Begin voting phase (admin only)
router.post('/begin-voting/:date', (req, res) => {
  const weekDate = req.params.date;
  const currentUser = req.query.user || req.body.user;
  
  // Check if user is admin
  req.db.get("SELECT is_admin FROM members WHERE name = ? AND is_active = 1", [currentUser], (err, member) => {
    if (err || !member || !member.is_admin) {
      return res.status(403).send('Admin access required');
    }
    
    // Update phase to voting
    req.db.run(
      "UPDATE weeks SET phase = 'voting' WHERE week_date = ?",
      [weekDate],
      (err) => {
        if (err) {
          return res.status(500).send('Failed to begin voting');
        }
        res.redirect('/');
      }
    );
  });
});

// Move to voting phase (admin only) - LEGACY route for existing buttons
router.post('/move-to-voting/:date', (req, res) => {
  const weekDate = req.params.date;
  const currentUser = req.query.user || req.body.user;
  
  // Check if user is admin
  req.db.get("SELECT is_admin FROM members WHERE name = ? AND is_active = 1", [currentUser], (err, member) => {
    if (err || !member || !member.is_admin) {
      return res.status(403).send('Admin access required');
    }
    
    req.db.run(
      "UPDATE weeks SET phase = 'voting' WHERE week_date = ?",
      [weekDate],
      (err) => {
        if (err) {
          return res.status(500).send('Failed to update phase');
        }
        res.redirect('/');
      }
    );
  });
});

module.exports = router;
