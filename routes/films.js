// routes/films.js - Updated with server-side TMDB API and admin controls
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
      SELECT n.id, f.title, f.year, f.poster_url, m.name as nominator, f.director, f.runtime, f.tmdb_rating, f.overview
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
                        `<img src="https://image.tmdb.org/t/p/w185${nom.poster_url}" class="film-poster" alt="Poster for ${nom.title}">` :
                        `<div class="poster-placeholder" aria-label="No poster">
                          <svg width="40" height="60" viewBox="0 0 40 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect width="40" height="60" rx="6" fill="#e5e7eb"/>
                            <path d="M10 40l7-10 7 10 6-8 7 12H3l7-12z" fill="#cbd5e1"/>
                          </svg>
                        </div>`
                      }
                      <div class="film-details">
                        <div class="film-title">${nom.title}${nom.year ? ` (${nom.year})` : ''}</div>
                        <div class="film-meta">
                          ${nom.director ? `<span title="Director">
                            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a2 2 0 110 4 2 2 0 010-4zm0 5c2.21 0 4 1.79 4 4v1H4v-1c0-2.21 1.79-4 4-4z"/></svg>
                            ${nom.director}
                          </span>` : ''}
                          ${nom.runtime ? `<span title="Runtime">
                            <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="2" fill="none"/><path d="M8 4v4l3 2" stroke="currentColor" stroke-width="2" fill="none"/></svg>
                            ${nom.runtime} min
                          </span>` : ''}
                          ${nom.tmdb_rating ? `<span title="TMDB Rating">
                            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 12l-4.472 2.951 1.705-5.254L1 6.549l5.528-.004L8 1.5l1.472 5.045 5.528.004-4.233 3.148 1.705 5.254z"/></svg>
                            ${nom.tmdb_rating}/10
                          </span>` : ''}
                        </div>
                        ${nom.overview ? `<div class="film-overview">${nom.overview.length > 140 ? nom.overview.substring(0, 140) + '…' : nom.overview}</div>` : ''}
                        <div class="nominator">Nominated by ${nom.nominator}</div>
                      </div>
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
              // Updated to use server-side API endpoints
              
              async function searchFilms() {
                const query = document.getElementById('filmSearch').value;
                if (!query) return;
                
                // Show loading state
                document.getElementById('searchResults').innerHTML = '<div style="text-align:center;"><span class="spinner"></span> Searching...</div>';
                
                try {
                  const response = await fetch('/api/search-films?query=' + encodeURIComponent(query));
                  const data = await response.json();
                  
                  if (!response.ok) {
                    throw new Error(data.error || 'Search failed');
                  }
                  
                  const results = document.getElementById('searchResults');
                  
                  if (data.results && data.results.length > 0) {
                    results.innerHTML = '<div class="search-results">' +
                      data.results.slice(0, 5).map(film => \`
                        <div class="search-result-item" onclick="selectFilm(\${film.id})">
                          <strong>\${film.title}</strong> 
                          \${film.release_date ? '(' + film.release_date.substring(0, 4) + ')' : ''}
                          <br>
                          <small>\${film.overview ? film.overview.substring(0, 100) + '...' : ''}</small>
                        </div>
                      \`).join('') + '</div>';
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
                  
                  const director = film.credits?.crew?.find(c => c.job === 'Director');
                  
                  document.getElementById('selectedDetails').innerHTML = \`
                    <div class="film-card">
                      \${film.poster_path ? 
                        '<img src="https://image.tmdb.org/t/p/w92' + film.poster_path + '" class="film-poster">' :
                        '<div class="poster-placeholder">No poster</div>'
                      }
                      <div>
                        <strong>\${film.title}</strong> 
                        \${film.release_date ? '(' + film.release_date.substring(0, 4) + ')' : ''}<br>
                        \${director ? 'Director: ' + director.name + '<br>' : ''}
                        \${film.runtime ? 'Runtime: ' + film.runtime + ' mins<br>' : ''}
                        \${film.vote_average ? 'Rating: ' + film.vote_average + '/10' : ''}
                      </div>
                      <div style="clear: both;"></div>
                    </div>
                  \`;
                  
                  document.getElementById('tmdbId').value = film.id;
                  document.getElementById('title').value = film.title;
                  document.getElementById('year').value = film.release_date ? film.release_date.substring(0, 4) : '';
                  document.getElementById('posterUrl').value = film.poster_path || '';
                  document.getElementById('director').value = director ? director.name : '';
                  document.getElementById('runtime').value = film.runtime || '';
                  document.getElementById('rating').value = film.vote_average || '';
                  document.getElementById('overview').value = film.overview || '';
                  
                  document.getElementById('selectedDetails').innerHTML += '<button type="button" class="btn btn-secondary btn-small" onclick="clearSelection()">Clear Selection</button>';
                } catch (error) {
                  console.error('Film details error:', error);
                  alert('Failed to load film details: ' + error.message);
                }
              }
              function clearSelection() {
                document.getElementById('selectedFilm').style.display = 'none';
                document.getElementById('selectedDetails').innerHTML = '';
                document.getElementById('filmSearch').value = '';
              }
              // Keyboard navigation for search results
              document.getElementById('filmSearch').addEventListener('keydown', function(e) {
                const results = document.querySelectorAll('.search-result-item');
                if (!results.length) return;
                let idx = Array.from(results).findIndex(r => r.classList.contains('active'));
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  if (idx >= 0) results[idx].classList.remove('active');
                  idx = (idx + 1) % results.length;
                  results[idx].classList.add('active');
                  results[idx].scrollIntoView({block: 'nearest'});
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  if (idx >= 0) results[idx].classList.remove('active');
                  idx = (idx - 1 + results.length) % results.length;
                  results[idx].classList.add('active');
                  results[idx].scrollIntoView({block: 'nearest'});
                } else if (e.key === 'Enter' && idx >= 0) {
                  results[idx].click();
                }
              });
            </script>
            <style>
              .spinner {
                display: inline-block;
                width: 20px;
                height: 20px;
                border: 3px solid #dbeafe;
                border-top: 3px solid #2563eb;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                vertical-align: middle;
                margin-right: 8px;
              }
              @keyframes spin {
                0% { transform: rotate(0deg);}
                100% { transform: rotate(360deg);}
              }
              .search-result-item.active {
                background: #dbeafe;
              }
            </style>
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
