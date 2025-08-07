const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Import database setup
const db = require('./database/setup');

// Import route modules
const membersRoutes = require('./routes/members');
const genresRoutes = require('./routes/genres');
const weeksRoutes = require('./routes/weeks');
const adminRoutes = require('./routes/admin');
const filmsRoutes = require('./routes/films');
const votesRoutes = require('./routes/votes');
const resultsRoutes = require('./routes/results');
const statisticsRoutes = require('./routes/statistics');

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// Make database available to all routes
app.use((req, res, next) => {
  req.db = db;
  next();
});

// Use route modules
app.use('/', membersRoutes);
app.use('/', genresRoutes);
app.use('/', weeksRoutes);
app.use('/', adminRoutes);
app.use('/', filmsRoutes);
app.use('/', votesRoutes);
app.use('/', resultsRoutes);
app.use('/', statisticsRoutes);

// API endpoint for current week films with enhanced data
app.get('/api/week/:weekId/films', (req, res) => {
  const weekId = req.params.weekId;
  
  // Get all nominations for this week with enhanced data
  db.all(`
    SELECT 
      id, user_name, film_title, film_year, poster_url, backdrop_url,
      vote_average, release_date, runtime, overview, director, tmdb_genres,
      nominated_at
    FROM nominations 
    WHERE week_id = ? 
    ORDER BY nominated_at
  `, [weekId], (err, films) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    res.json({ films: films || [] });
  });
});

// Main home route with enhanced current week display
app.get('/', (req, res) => {
  // Helper functions
  function getMondayOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  }

  function formatDate(date) {
    return date.toISOString().split('T')[0];
  }

  function generateWeeks() {
    const weeks = [];
    const currentMonday = getMondayOfWeek(new Date());
    
    // Generate weeks: 3 previous + current + next 48 weeks = 52 total
    for (let i = -3; i < 49; i++) {
      const weekDate = new Date(currentMonday);
      weekDate.setDate(currentMonday.getDate() + (i * 7));
      
      const isCurrentWeek = i === 0;
      const isPastWeek = i < 0;
      const isNearFuture = i > 0 && i <= 3; // Next 3 weeks
      const isFarFuture = i > 3;
      
      weeks.push({
        date: formatDate(weekDate),
        displayDate: weekDate.toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        }),
        shortDate: weekDate.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric'
        }),
        isCurrentWeek,
        isPastWeek,
        isNearFuture,
        isFarFuture,
        weekOffset: i
      });
    }
    return weeks;
  }

  const weeks = generateWeeks();
  
  // Get members first, then weeks
  db.all("SELECT name FROM members WHERE is_active = 1 ORDER BY name", (err, members) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }

    // Get weeks from database with their current status
    db.all(`SELECT * FROM weeks ORDER BY week_date`, (err, dbWeeks) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Database error');
      }

      // Get nomination and voting counts for each week
      db.all(`
        SELECT 
          w.id as week_id,
          COUNT(DISTINCT n.id) as nomination_count,
          COUNT(DISTINCT v.id) as vote_count
        FROM weeks w
        LEFT JOIN nominations n ON w.id = n.week_id
        LEFT JOIN votes v ON w.id = v.week_id
        GROUP BY w.id
      `, (err, weekStats) => {
        if (err) {
          console.error(err);
          return res.status(500).send('Database error');
        }

        // Get user voting and nomination status for all weeks
        db.all(`
          SELECT v.week_id, v.user_name, 'vote' as type
          FROM votes v
          UNION ALL
          SELECT n.week_id, n.user_name, 'nomination' as type  
          FROM nominations n
        `, (err, userActivity) => {
          if (err) {
            console.error(err);
            return res.status(500).send('Database error');
          }

          // Get winner information for completed weeks
          db.all(`
            SELECT w.id as week_id, n.film_title, n.film_year, n.user_name as nominator
            FROM weeks w
            JOIN nominations n ON w.winner_film_id = n.id
            WHERE w.phase = 'complete'
          `, (err, winners) => {
            if (err) {
              console.error(err);
              return res.status(500).send('Database error');
            }

            // Create lookup objects
            const statsLookup = {};
            weekStats.forEach(stat => {
              statsLookup[stat.week_id] = {
                nominations: stat.nomination_count,
                votes: stat.vote_count
              };
            });

            const winnersLookup = {};
            winners.forEach(winner => {
              winnersLookup[winner.week_id] = {
                title: winner.film_title,
                year: winner.film_year,
                nominator: winner.nominator
              };
            });

            // Merge generated weeks with database data
            const weeksData = weeks.map(week => {
              const dbWeek = dbWeeks.find(w => w.week_date === week.date);
              const stats = dbWeek ? statsLookup[dbWeek.id] || { nominations: 0, votes: 0 } : { nominations: 0, votes: 0 };
              const winner = dbWeek ? winnersLookup[dbWeek.id] : null;
              
              return {
                ...week,
                id: dbWeek?.id,
                genre: dbWeek?.genre,
                phase: dbWeek?.phase || 'planning',
                created_by: dbWeek?.created_by,
                stats,
                winner
              };
            });

            // Split weeks into sections
            const pastWeeks = weeksData.filter(w => w.isPastWeek);
            const currentWeek = weeksData.find(w => w.isCurrentWeek);
            const nearFutureWeeks = weeksData.filter(w => w.isNearFuture);
            const farFutureWeeks = weeksData.filter(w => w.isFarFuture);

            res.send(`
              <!DOCTYPE html>
              <html>
              <head>
                <title>Film Club</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <link rel="stylesheet" href="/styles/main.css">
              </head>
              <body>
                <div class="user-select">
                  <label>You are: </label>
                  <select id="currentUser" onchange="setCurrentUser()">
                    <option value="">Select your name</option>
                    ${members.map(member => `<option value="${member.name}">${member.name}</option>`).join('')}
                  </select>
                </div>

                <div class="container">
                  <div class="header">
                    <h1>🎬 Film Club Calendar</h1>
                    <p>Manage your weekly film selections and voting</p>
                  </div>

                  <div class="nav-buttons">
                    <a href="/manage-genres">🎭 Manage Genres</a>
                    <a href="/statistics">📊 Statistics</a>
                    <a href="/admin/import-genres" id="adminLink" style="display: none;">🔧 Admin</a>
                  </div>

                  <!-- Recent Past Weeks -->
                  ${pastWeeks.length > 0 ? `
                    <div class="section-header">
                      <h2>📅 Recent Weeks</h2>
                    </div>
                    <div id="pastWeeksList">
                      ${pastWeeks.map(week => renderCompactWeek(week)).join('')}
                    </div>
                  ` : ''}

                  <!-- Current Week -->
                  ${currentWeek ? `
                    <div class="section-header">
                      <h2>⭐ This Week</h2>
                    </div>
                    <div id="currentWeek">
                      ${renderFullWeek(currentWeek, userActivity)}
                    </div>
                  ` : ''}

                  <!-- Next Few Weeks -->
                  ${nearFutureWeeks.length > 0 ? `
                    <div class="section-header">
                      <h2>📋 Upcoming Weeks</h2>
                    </div>
                    <div id="nearFutureWeeksList">
                      ${nearFutureWeeks.map(week => renderFullWeek(week, userActivity)).join('')}
                    </div>
                  ` : ''}

                  <!-- Far Future Weeks -->
                  ${farFutureWeeks.length > 0 ? `
                    <div class="section-header">
                      <h2>🔮 Future Schedule</h2>
                    </div>
                    <div id="farFutureWeeksList" class="compact-weeks">
                      ${farFutureWeeks.map(week => renderCompactWeek(week)).join('')}
                    </div>
                  ` : ''}
                </div>

                <script>
                // Store user activity data
                const userActivity = ${JSON.stringify(userActivity)};
                
                function setCurrentUser() {
                  const user = document.getElementById('currentUser').value;
                  localStorage.setItem('currentUser', user);
                  toggleAdminLink(user);
                  updateWeekActions(user);
                }

                function getCurrentUser() {
                  return localStorage.getItem('currentUser');
                }

                function checkUserAndGo(url) {
                  const user = getCurrentUser();
                  if (!user) {
                    alert('Please select your name first!');
                    return false;
                  }
                  window.location.href = url;
                }

                function checkUserAndGoWithUser(baseUrl) {
                  const user = getCurrentUser();
                  if (!user) {
                    alert('Please select your name first!');
                    return false;
                  }
                  window.location.href = baseUrl + '?user=' + encodeURIComponent(user);
                  return true;
                }

                function checkAdminAndGo(url) {
                  const user = getCurrentUser();
                  if (!user) {
                    alert('Please select your name first!');
                    return false;
                  }
                  
                  if (user === 'Bels' || user === 'Scott') {
                    window.location.href = url;
                    return true;
                  } else {
                    alert('Only admins can change genres after nomination phase!');
                    return false;
                  }
                }

                function toggleAdminLink(user) {
                  const adminLink = document.getElementById('adminLink');
                  const adminButtons = document.querySelectorAll('.admin-only');
                  
                  if (user === 'Bels' || user === 'Scott') {
                    adminLink.style.display = 'inline-block';
                    adminButtons.forEach(btn => btn.style.display = 'inline-block');
                  } else {
                    adminLink.style.display = 'none';
                    adminButtons.forEach(btn => btn.style.display = 'none');
                  }
                }
                
                function updateWeekActions(user) {
                  if (!user) return;
                  
                  const userVotes = userActivity.filter(activity => 
                    activity.user_name === user && activity.type === 'vote'
                  );
                  const userNominations = userActivity.filter(activity => 
                    activity.user_name === user && activity.type === 'nomination'
                  );
                  
                  document.querySelectorAll('.week-actions').forEach(actionsDiv => {
                    const weekId = parseInt(actionsDiv.dataset.weekId);
                    const weekDate = actionsDiv.dataset.weekDate;
                    const weekPhase = actionsDiv.dataset.weekPhase;
                    
                    let actions = '';
                    
                    if (weekPhase === 'planning') {
                      actions += \`<a href="/set-genre/\${weekDate}" class="btn btn-primary" onclick="return checkUserAndGo('/set-genre/\${weekDate}')">Set Genre</a>\`;
                    } else if (weekPhase === 'genre') {
                      actions += \`<a href="/random-genre/\${weekDate}" class="btn btn-warning" onclick="return checkUserAndGo('/random-genre/\${weekDate}')">Random Genre</a>\`;
                    } else if (weekPhase === 'nomination') {
                      const userNominated = userNominations.some(nom => nom.week_id === weekId);
                      
                      if (userNominated) {
                        actions += \`<a href="/nominate/\${weekDate}" class="btn btn-success btn-outline" onclick="checkUserAndGoWithUser('/nominate/\${weekDate}'); return false;">✓ Edit Nomination</a>\`;
                      } else {
                        actions += \`<a href="/nominate/\${weekDate}" class="btn btn-success" onclick="checkUserAndGoWithUser('/nominate/\${weekDate}'); return false;">Nominate Film</a>\`;
                      }
                      actions += \`<a href="/set-genre/\${weekDate}" class="btn btn-secondary admin-only" onclick="return checkAdminAndGo('/set-genre/\${weekDate}')">Change Genre</a>\`;
                    } else if (weekPhase === 'voting') {
                      const userVoted = userVotes.some(vote => vote.week_id === weekId);
                      
                      if (userVoted) {
                        actions += \`<a href="/vote/\${weekDate}" class="btn btn-warning btn-outline" onclick="checkUserAndGoWithUser('/vote/\${weekDate}'); return false;">✓ View Your Vote</a>\`;
                      } else {
                        actions += \`<a href="/vote/\${weekDate}" class="btn btn-warning" onclick="checkUserAndGoWithUser('/vote/\${weekDate}'); return false;">Vote</a>\`;
                      }
                      actions += \`<a href="/set-genre/\${weekDate}" class="btn btn-secondary admin-only" onclick="return checkAdminAndGo('/set-genre/\${weekDate}')">Change Genre</a>\`;
                    } else if (weekPhase === 'complete') {
                      actions += \`<a href="/results/\${weekDate}" class="btn btn-success">View Results</a>\`;
                    }
                    
                    actionsDiv.innerHTML = actions;
                  });
                  
                  toggleAdminLink(user);
                }

                // Enhanced current week film display functions
                function loadCurrentWeekFilms() {
                  // Find current week element
                  const currentWeekElement = document.querySelector('[id^="currentWeekFilms-"]');
                  if (!currentWeekElement) return;
                  
                  const weekId = currentWeekElement.id.split('-')[1];
                  
                  // Fetch current week films with enhanced data
                  fetch(\`/api/week/\${weekId}/films\`)
                    .then(response => response.json())
                    .then(data => {
                      if (data.films && data.films.length > 0) {
                        currentWeekElement.innerHTML = renderCurrentWeekFilms(data.films);
                      }
                    })
                    .catch(error => {
                      console.error('Error loading current week films:', error);
                    });
                }

                function renderCurrentWeekFilms(films) {
                  if (films.length === 1) {
                    // Single film - hero display
                    const film = films[0];
                    return renderFilmShowcase(film);
                  } else if (films.length > 1) {
                    // Multiple films - grid display
                    return \`
                      <div class="current-week-grid">
                        \${films.map(film => renderFilmCardCompact(film)).join('')}
                      </div>
                    \`;
                  }
                  return '';
                }

                function renderFilmShowcase(film) {
                  const backdropUrl = film.backdrop_url ? \`https://image.tmdb.org/t/p/w1280\${film.backdrop_url}\` : '';
                  const posterUrl = film.poster_url ? \`https://image.tmdb.org/t/p/w500\${film.poster_url}\` : '';
                  const rating = film.vote_average ? parseFloat(film.vote_average).toFixed(1) : 'N/A';
                  const runtime = film.runtime ? \`\${film.runtime} min\` : '';
                  const releaseDate = film.release_date ? new Date(film.release_date).getFullYear() : '';
                  
                  return \`
                    <div class="film-showcase">
                      \${backdropUrl ? \`<img src="\${backdropUrl}" alt="\${film.film_title}" class="film-backdrop">\` : ''}
                      <div class="film-backdrop-overlay"></div>
                      
                      <div class="film-content">
                        \${posterUrl ? \`<img src="\${posterUrl}" alt="\${film.film_title}" class="film-poster-large">\` : ''}
                        
                        <div class="film-details-large">
                          <h2 class="film-title-large">
                            \${film.film_title} 
                            <span class="film-year-large">(\${film.film_year})</span>
                          </h2>
                          
                          <div class="film-meta-large">
                            \${rating !== 'N/A' ? \`<div class="film-rating">\${rating}</div>\` : ''}
                            \${releaseDate ? \`<span class="film-meta-item">\${releaseDate}</span>\` : ''}
                            \${film.tmdb_genres ? \`<span class="film-meta-item">\${film.tmdb_genres}</span>\` : ''}
                            \${runtime ? \`<span class="film-meta-item">\${runtime}</span>\` : ''}
                          </div>
                          
                          \${film.overview ? \`
                            <div class="film-overview-large">
                              \${film.overview}
                            </div>
                          \` : ''}
                          
                          <div class="film-credits">
                            \${film.director ? \`
                              <div class="film-director">
                                <strong>Director:</strong> \${film.director}
                              </div>
                            \` : ''}
                            <div class="film-nominator">
                              <strong>Nominated by:</strong> \${film.user_name}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  \`;
                }

                function renderFilmCardCompact(film) {
                  const backdropUrl = film.backdrop_url ? \`https://image.tmdb.org/t/p/w500\${film.backdrop_url}\` : '';
                  const posterUrl = film.poster_url ? \`https://image.tmdb.org/t/p/w200\${film.poster_url}\` : '';
                  const rating = film.vote_average ? parseFloat(film.vote_average).toFixed(1) : 'N/A';
                  const releaseDate = film.release_date ? new Date(film.release_date).getFullYear() : '';
                  
                  return \`
                    <div class="film-card-compact">
                      <div class="film-card-backdrop">
                        \${backdropUrl ? \`<img src="\${backdropUrl}" alt="\${film.film_title}">\` : ''}
                        \${posterUrl ? \`<img src="\${posterUrl}" alt="\${film.film_title}" class="film-card-poster">\` : ''}
                      </div>
                      
                      <div class="film-card-content">
                        <h4 class="film-card-title">\${film.film_title} (\${film.film_year})</h4>
                        
                        <div class="film-card-meta">
                          \${rating !== 'N/A' ? \`<span class="film-card-rating">⭐ \${rating}</span>\` : ''}
                          \${releaseDate ? \`<span>\${releaseDate}</span>\` : ''}
                          \${film.runtime ? \`<span>\${film.runtime} min</span>\` : ''}
                        </div>
                        
                        <div class="film-card-nominator">
                          Nominated by \${film.user_name}
                        </div>
                      </div>
                    </div>
                  \`;
                }

                window.onload = function() {
                  const savedUser = localStorage.getItem('currentUser');
                  if (savedUser) {
                    document.getElementById('currentUser').value = savedUser;
                    toggleAdminLink(savedUser);
                    updateWeekActions(savedUser);
                  }
                  
                  // Load enhanced current week films
                  loadCurrentWeekFilms();
                }
                </script>
              </body>
              </html>
            `);

            // Helper function to render full week card (current + next 3 weeks)
            function renderFullWeek(week, userActivity) {
              return `
                <div class="week-card">
                  <div class="week-info">
                    <h3>${week.displayDate}</h3>
                    <div class="genre-info">
                      <strong>Genre:</strong> ${week.genre || 'Not set'}
                      ${week.created_by ? `<span class="genre-creator">by ${week.created_by}</span>` : ''}
                    </div>
                    
                    ${week.isCurrentWeek ? `
                      <!-- Progress Indicator (only for current week) -->
                      <div class="progress-indicator">
                        <div class="progress-step ${week.phase === 'planning' ? 'active' : week.genre ? 'completed' : ''}">
                          <span class="step-icon">🎭</span>
                          <span class="step-label">Genre</span>
                        </div>
                        <div class="progress-step ${week.phase === 'nomination' ? 'active' : ['voting', 'complete'].includes(week.phase) ? 'completed' : ''}">
                          <span class="step-icon">🎬</span>
                          <span class="step-label">Nominations</span>
                        </div>
                        <div class="progress-step ${week.phase === 'voting' ? 'active' : week.phase === 'complete' ? 'completed' : ''}">
                          <span class="step-icon">🗳️</span>
                          <span class="step-label">Voting</span>
                        </div>
                        <div class="progress-step ${week.phase === 'complete' ? 'completed' : ''}">
                          <span class="step-icon">🏆</span>
                          <span class="step-label">Results</span>
                        </div>
                      </div>
                    ` : ''}

                    <!-- Status Info -->
                    <div class="week-status">
                      ${week.phase === 'planning' ? '<span class="status-text">Ready to set genre</span>' : ''}
                      ${week.phase === 'genre' ? '<span class="status-text">Ready for random genre selection</span>' : ''}
                      ${week.phase === 'nomination' ? `<span class="status-text">${week.stats.nominations} nomination${week.stats.nominations !== 1 ? 's' : ''} received</span>` : ''}
                      ${week.phase === 'voting' ? `<span class="status-text">${week.stats.votes} vote${week.stats.votes !== 1 ? 's' : ''} submitted</span>` : ''}
                      ${week.phase === 'complete' && week.winner ? `<span class="status-text">🏆 Winner: ${week.winner.title} (${week.winner.nominator})</span>` : ''}
                    </div>
                  </div>
                  
                  <div class="actions">
                    <span class="phase-badge phase-${week.phase}">${week.phase}</span>
                    <div class="week-actions" data-week-id="${week.id}" data-week-date="${week.date}" data-week-phase="${week.phase}">
                      <!-- Actions will be populated by JavaScript -->
                    </div>
                  </div>
                </div>
                
                ${week.isCurrentWeek && ['nomination', 'voting', 'complete'].includes(week.phase) ? `
                  <!-- Enhanced Current Week Film Display -->
                  <div class="current-week-films" id="currentWeekFilms-${week.id}">
                    <!-- This will be populated by JavaScript with enhanced film data -->
                  </div>
                ` : ''}
              `;
            }

            // Helper function to render compact week card (past + far future weeks)
            function renderCompactWeek(week) {
              return `
                <div class="week-card compact">
                  <div class="week-info">
                    <div class="compact-header">
                      <h4>${week.shortDate}</h4>
                      <span class="phase-badge phase-${week.phase}">${week.phase}</span>
                    </div>
                    
                    <div class="compact-content">
                      <div class="genre-line">
                        <strong>Genre:</strong> ${week.genre || 'Not set'}
                      </div>
                      
                      ${week.winner ? `
                        <div class="winner-line">
                          <strong>🏆 Winner:</strong> ${week.winner.title} (${week.winner.year}) 
                          <span class="nominator">by ${week.winner.nominator}</span>
                        </div>
                      ` : ''}
                    </div>
                  </div>
                  
                  <div class="compact-actions">
                    ${week.phase === 'complete' ? `
                      <a href="/results/${week.date}" class="btn btn-success btn-small">View Results</a>
                    ` : week.phase === 'planning' ? `
                      <div class="week-actions" data-week-id="${week.id}" data-week-date="${week.date}" data-week-phase="${week.phase}">
                        <!-- Actions populated by JavaScript -->
                      </div>
                    ` : ''}
                  </div>
                </div>
              `;
            }
          });
        });
      });
    });
  });
});


// Start the server
app.listen(port, () => {
  console.log(`🎬 Film Club app running on port ${port}`);
  console.log(`Visit http://localhost:${port} to get started!`);
});
