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

// HOME PAGE - Shows calendar and current status
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

  function getWeekActions(week) {
    const actions = [];
    
    if (week.phase === 'planning') {
      actions.push(`<a href="/set-genre/${week.date}" class="btn btn-primary" onclick="return checkUserAndGo('/set-genre/${week.date}')">Set Genre</a>`);
    } else if (week.phase === 'genre') {
      actions.push(`<a href="/random-genre/${week.date}" class="btn btn-warning" onclick="return checkUserAndGo('/random-genre/${week.date}')">Random Genre</a>`);
    } else if (week.phase === 'nomination') {
      actions.push(`<a href="/nominate/${week.date}" class="btn btn-success" onclick="return checkUserAndGoWithUser('/nominate/${week.date}')">Nominate Film</a>`);
      actions.push(`<a href="/set-genre/${week.date}" class="btn btn-secondary admin-only" onclick="return checkAdminAndGo('/set-genre/${week.date}')">Change Genre</a>`);
    } else if (week.phase === 'voting') {
      actions.push(`<a href="/vote/${week.date}" class="btn btn-warning" onclick="return checkUserAndGoWithUser('/vote/${week.date}')">Vote</a>`);
      actions.push(`<a href="/set-genre/${week.date}" class="btn btn-secondary admin-only" onclick="return checkAdminAndGo('/set-genre/${week.date}')">Change Genre</a>`);
    } else if (week.phase === 'complete') {
      actions.push(`<a href="/results/${week.date}" class="btn btn-success">View Results</a>`);
    }
    
    return actions.join('');
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

      // Merge generated weeks with database data
      const weeksData = weeks.map(week => {
        const dbWeek = dbWeeks.find(w => w.week_date === week.date);
        return {
          ...week,
          id: dbWeek?.id,
          genre: dbWeek?.genre,
          phase: dbWeek?.phase || 'planning',
          created_by: dbWeek?.created_by
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

            ${weeksData.map(week => `
              <div class="week-card">
                <div class="week-info">
                  <h3>${week.displayDate}</h3>
                  <p><strong>Genre:</strong> ${week.genre || 'Not set'}</p>
                  ${week.created_by ? `<p><strong>Set by:</strong> ${week.created_by}</p>` : ''}
                </div>
                <div class="actions">
                  <span class="phase-badge phase-${week.phase}">${week.phase}</span>
                  ${getWeekActions(week)}
                </div>
              </div>
            `).join('')}
          </div>

          <script>
            // Save current user in browser storage
            function setCurrentUser() {
              const user = document.getElementById('currentUser').value;
              localStorage.setItem('currentUser', user);
              toggleAdminLink(user);
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
          </script>
        </body>
        </html>
      `);
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
