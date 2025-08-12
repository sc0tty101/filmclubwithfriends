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
  // Fetch week, nominations, and user nomination status from DB, then build HTML and send response
  req.db.get("SELECT * FROM weeks WHERE week_date = ?", [weekDate], (err, week) => {
    if (err || !week) {
      return res.status(404).send('Week not found');
    }
    req.db.all("SELECT n.*, f.title, f.year, f.poster_url, f.director, f.runtime, f.tmdb_rating, f.overview, m.name as nominator FROM nominations n JOIN films f ON n.film_id = f.id JOIN members m ON n.member_id = m.id WHERE n.week_id = ?", [week.id], (err, nominations) => {
      if (err) {
        return res.status(500).send('Failed to load nominations');
      }
      req.db.get("SELECT id FROM members WHERE name = ? AND is_active = 1", [currentUser], (err, member) => {
        const userNominated = member ? nominations.some(n => n.nominator === currentUser) : false;
        // Check if user is admin
        req.db.get("SELECT is_admin FROM members WHERE name = ? AND is_active = 1", [currentUser], (err, adminRow) => {
          const isAdmin = adminRow && adminRow.is_admin;
          // Build nomination HTML blocks
          const nominationsHtml = nominations.length === 0
            ? '<p style="text-align: center; color: #999;">No nominations yet</p>'
            : nominations.map(function(nom) {
                return '<div class="film-card">' +
                  (nom.poster_url
                    ? '<img src="https://image.tmdb.org/t/p/w185' + nom.poster_url + '" class="film-poster" alt="Poster for ' + nom.title + '">' 
                    : '<div class="poster-placeholder" aria-label="No poster">\
                        <svg width="40" height="60" viewBox="0 0 40 60" fill="none" xmlns="http://www.w3.org/2000/svg">\
                          <rect width="40" height="60" rx="6" fill="#e5e7eb"/>\
                          <path d="M10 40l7-10 7 10 6-8 7 12H3l7-12z" fill="#cbd5e1"/>\
                        </svg>\
                      </div>') +
                  '<div class="film-details">' +
                    '<div class="film-title">' + nom.title + (nom.year ? ' (' + nom.year + ')' : '') + '</div>' +
                    '<div class="film-meta">' +
                      (nom.director ? '<span title="Director">\
                        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a2 2 0 110 4 2 2 0 010-4zm0 5c2.21 0 4 1.79 4 4v1H4v-1c0-2.21 1.79-4 4-4z"/></svg>\
                        ' + nom.director + '</span>' : '') +
                      (nom.runtime ? '<span title="Runtime">\
                        <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="2" fill="none"/><path d="M8 4v4l3 2" stroke="currentColor" stroke-width="2" fill="none"/></svg>\
                        ' + nom.runtime + ' min</span>' : '') +
                      (nom.tmdb_rating ? '<span title="TMDB Rating">\
                        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 12l-4.472 2.951 1.705-5.254L1 6.549l5.528-.004L8 1.5l1.472 5.045 5.528.004-4.233 3.148 1.705 5.254z"/></svg>\
                        ' + nom.tmdb_rating + '/10</span>' : '') +
                    '</div>' +
                    (nom.overview ? '<div class="film-overview">' + (nom.overview.length > 140 ? nom.overview.substring(0, 140) + '…' : nom.overview) + '</div>' : '') +
                    '<div class="nominator">Nominated by ' + nom.nominator + '</div>' +
                  '</div>' +
                '</div>';
              }).join('');
          const beginVotingHtml = (nominations.length >= 3 && week.phase === 'nomination' && isAdmin)
            ? '<div class="actions center">\
                <form action="/begin-voting/' + weekDate + '" method="POST">\
                  <input type="hidden" name="user" value="' + currentUser + '">\
                  <button type="submit" class="btn btn-warning">Begin Voting</button>\
                </form>\
              </div>'
            : '';
          let nominateSection = '';
          if (currentUser && !userNominated && week.phase === 'nomination') {
            nominateSection = '<div class="card">\
              <h2>Nominate Your Film</h2>\
              <form onsubmit="return false;">\
                <div class="form-group">\
                  <label>Search for a film:</label>\
                  <input type="text" id="filmSearch" placeholder="Enter film title...">\
                  <button type="button" onclick="searchFilms()" class="btn btn-primary">Search</button>\
                </div>\
              </form>\
              <div id="searchResults"></div>\
              <div id="selectedFilm" style="display: none;">\
                <h3>Selected Film:</h3>\
                <div id="selectedDetails"></div>\
                <form action="/nominate/' + weekDate + '" method="POST" id="nominateForm">\
                  <input type="hidden" name="user" value="' + currentUser + '">\
                  <input type="hidden" name="tmdbId" id="tmdbId">\
                  <input type="hidden" name="title" id="title">\
                  <input type="hidden" name="year" id="year">\
                  <input type="hidden" name="posterUrl" id="posterUrl">\
                  <input type="hidden" name="director" id="director">\
                  <input type="hidden" name="runtime" id="runtime">\
                  <input type="hidden" name="rating" id="rating">\
                  <input type="hidden" name="overview" id="overview">\
                  <button type="submit" class="btn btn-success">Confirm Nomination</button>\
                </form>\
              </div>\
            </div>';
          } else if (!currentUser) {
            nominateSection = '<div class="card">\
              <div class="alert alert-error" style="text-align: center;">Please select your name at the top of the page to nominate</div>\
            </div>';
          } else if (userNominated) {
            nominateSection = '<div class="card">\
              <div class="alert alert-success" style="text-align: center;">You have already nominated a film for this week</div>\
            </div>';
          } else if (week.phase !== 'nomination') {
            nominateSection = '<div class="card">\
              <div class="alert alert-error" style="text-align: center;">Nomination phase has ended for this week</div>\
            </div>';
          }
          res.send(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Nominate Film - Film Club</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <link rel="stylesheet" href="/styles/main.css">
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
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🎬 Nominate a Film</h1>
                  <p>Week of ${new Date(weekDate).toLocaleDateString()}</p>
                  <p><strong>Genre: ${week.genre_name}</strong></p>
                </div>
                <div class="stepper">
                  <div class="step active"><div class="step-circle">1</div><span>Nomination</span></div>
                  <div class="step"><div class="step-circle">2</div><span>Voting</span></div>
                  <div class="step"><div class="step-circle">3</div><span>Results</span></div>
                </div>
                <div class="card">
                  <h2>Current Nominations (${nominations.length})</h2>
                  ${nominationsHtml}
                  ${beginVotingHtml}
                </div>
                ${nominateSection}
                <div class="actions center">
                  <a href="/" class="btn btn-secondary">Back to Calendar</a>
                </div>
              </div>
              <!-- Add your scripts here -->
            </body>
            </html>
          `);
        });
      });
    });
  });
// Remove all code after this point that is not part of a route or valid JS
                <head>
                  <title>Nominate Film - Film Club</title>
                  <meta name="viewport" content="width=device-width, initial-scale=1">
                  <link rel="stylesheet" href="/styles/main.css">
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
                </head>
                <body>
                  <div class="container">
                    <div class="header">
                      <h1>🎬 Nominate a Film</h1>
                      <p>Week of ${new Date(weekDate).toLocaleDateString()}</p>
                      <p><strong>Genre: ${week.genre_name}</strong></p>
                    </div>
                    <div class="stepper">
                      <div class="step active"><div class="step-circle">1</div><span>Nomination</span></div>
                      <div class="step"><div class="step-circle">2</div><span>Voting</span></div>
                      <div class="step"><div class="step-circle">3</div><span>Results</span></div>
                    </div>
                    <div class="card">
                      <h2>Current Nominations (${nominations.length})</h2>
                      ${nominationsHtml}
                      ${beginVotingHtml}
                    </div>
                    ${nominateSection}
                    <div class="actions center">
                      <a href="/" class="btn btn-secondary">Back to Calendar</a>
                    </div>
                  </div>
                  <script>
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
