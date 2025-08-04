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

// ENHANCED HOME PAGE - Replace the main route in index.js
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
    const startDate = getMondayOfWeek(new Date());
    
    for (let i = 0; i < 52; i++) {
      const weekDate = new Date(startDate);
      weekDate.setDate(startDate.getDate() + (i * 7));
      weeks.push({
        date: formatDate(weekDate),
        displayDate: weekDate.toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
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

          // Create stats lookup
          const statsLookup = {};
          weekStats.forEach(stat => {
            statsLookup[stat.week_id] = {
              nominations: stat.nomination_count,
              votes: stat.vote_count
            };
          });

          // Merge generated weeks with database data
          const weeksData = weeks.map(week => {
            const dbWeek = dbWeeks.find(w => w.week_date === week.date);
            const stats = dbWeek ? statsLookup[dbWeek.id] || { nominations: 0, votes: 0 } : { nominations: 0, votes: 0 };
            
            return {
              ...week,
              id: dbWeek?.id,
              genre: dbWeek?.genre,
              phase: dbWeek?.phase || 'planning',
              created_by: dbWeek?.created_by,
              stats
            };
          });

          res.send(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Film Club</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <link rel="stylesheet" href="/styles.css">
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
                  <a href="/manage-users">👥 Manage Members</a>
                  <a href="/manage-genres">🎭 Manage Genres</a>
                  <a href="/statistics">📊 Statistics</a>
                  <a href="/admin/import-genres" id="adminLink" style="display: none;">🔧 Admin</a>
                </div>

                <div id="weeksList">
                  ${weeksData.map(week => `
                    <div class="week-card">
                      <div class="week-info">
                        <h3>${week.displayDate}</h3>
                        <div class="genre-info">
                          <strong>Genre:</strong> ${week.genre || 'Not set'}
                          ${week.created_by ? `<span class="genre-creator">by ${week.created_by}</span>` : ''}
                        </div>
                        
                        <!-- Progress Indicator -->
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

                        <!-- Status Info -->
                        <div class="week-status">
                          ${week.phase === 'planning' ? '<span class="status-text">Ready to set genre</span>' : ''}
                          ${week.phase === 'genre' ? '<span class="status-text">Ready for random genre selection</span>' : ''}
                          ${week.phase === 'nomination' ? `<span class="status-text">${week.stats.nominations} nomination${week.stats.nominations !== 1 ? 's' : ''} received</span>` : ''}
                          ${week.phase === 'voting' ? `<span class="status-text">${week.stats.votes} vote${week.stats.votes !== 1 ? 's' : ''} submitted</span>` : ''}
                          ${week.phase === 'complete' ? '<span class="status-text">Winner decided!</span>' : ''}
                        </div>
                      </div>
                      
                      <div class="actions">
                        <span class="phase-badge phase-${week.phase}">${week.phase}</span>
                        <div class="week-actions" data-week-id="${week.id}" data-week-date="${week.date}" data-week-phase="${week.phase}">
                          <!-- Actions will be populated by JavaScript based on selected user -->
                        </div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>

              <script>
              // Store user activity data
              const userActivity = ${JSON.stringify(userActivity)};
              
              // Save current user in browser storage
              function setCurrentUser() {
                const user = document.getElementById('currentUser').value;
                localStorage.setItem('currentUser', user);
                toggleAdminLink(user);
                updateWeekActions(user);
              }

              function handleNominate(weekDate) {
                const user = getCurrentUser();
                if (!user) {
                  alert('Please select your name first!');
                  return false;
                }
                window.location.href = '/nominate/' + weekDate + '?user=' + encodeURIComponent(user);
              }

              // Load current user on page load
              window.onload = function() {
                const savedUser = localStorage.getItem('currentUser');
                if (savedUser) {
                  document.getElementById('currentUser').value = savedUser;
                  toggleAdminLink(savedUser);
                  updateWeekActions(savedUser);
                }
              }

              // Helper function to check if user is selected
              function getCurrentUser() {
                return localStorage.getItem('currentUser');
              }

              // Check user before actions
              function checkUserAndGo(url) {
                const user = getCurrentUser();
                if (!user) {
                  alert('Please select your name first!');
                  return false;
                }
                window.location.href = url;
              }

              // Check user and pass user parameter
              function checkUserAndGoWithUser(baseUrl) {
                const user = getCurrentUser();
                if (!user) {
                  alert('Please select your name first!');
                  return false;
                }
                window.location.href = baseUrl + '?user=' + encodeURIComponent(user);
                return true;
              }

              // Check admin privileges before actions
              function checkAdminAndGo(url) {
                const user = getCurrentUser();
                if (!user) {
                  alert('Please select your name first!');
                  return false;
                }
                
                // Check if user is admin
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
                
                // Get user's votes and nominations
                const userVotes = userActivity.filter(activity => 
                  activity.user_name === user && activity.type === 'vote'
                );
                const userNominations = userActivity.filter(activity => 
                  activity.user_name === user && activity.type === 'nomination'
                );
                
                // Update each week's actions
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
                
                // Re-apply admin visibility
                toggleAdminLink(user);
              }
              </script>
            </body>
            </html>
          `);
        });
      });
    });
  });
});

// STATISTICS PAGE (placeholder for now)
app.get('/statistics', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Statistics - Film Club</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="/styles.css">
    </head>
    <body>
      <div class="container">
        <div class="card">
          <h1>📊 Statistics</h1>
          <p>Statistics and awards features coming soon!</p>
          <p>This will show member voting patterns, popular genres, and end-of-year awards.</p>
          <br>
          <a href="/" class="btn">Back to Calendar</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Start the server
app.listen(port, () => {
  console.log(`🎬 Film Club app running on port ${port}`);
  console.log(`Visit http://localhost:${port} to get started!`);
});
