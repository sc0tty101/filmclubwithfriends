const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse form data and JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public')); // For CSS/JS files

// Your TMDB API key
const TMDB_API_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJhYzA3NTdjZGM1ZjU3MmYzN2VhMWE0OGU3ODdmOWU5OSIsIm5iZiI6MTc0MTQ4OTQwNi43NjMsInN1YiI6IjY3Y2QwNGZlNDJjNzUyMTI1MmY1ZDE3ZiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.LW0oDgeFsv-dlssVgpI8klhDAWv3_CDNlIXd3ijK6KY';

// Film club members (you can change these names!)
const CLUB_MEMBERS = [
  'Alice', 'Bob', 'Charlie', 'Diana', 'Eve'
];

// Predefined genres for random selection
const GENRES = [
  'Action', 'Comedy', 'Drama', 'Horror', 'Sci-Fi', 
  'Romance', 'Thriller', 'Documentary', 'Animation', 'Musical'
];

// Initialize SQLite database
const db = new sqlite3.Database('./filmclub.db');

// Create tables when app starts
db.serialize(() => {
  // Weeks table - stores each week's info
  db.run(`CREATE TABLE IF NOT EXISTS weeks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_date TEXT NOT NULL,
    genre TEXT,
    genre_source TEXT,
    phase TEXT DEFAULT 'planning',
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Nominations table - stores film nominations
  db.run(`CREATE TABLE IF NOT EXISTS nominations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_id INTEGER,
    user_name TEXT,
    film_title TEXT,
    film_year INTEGER,
    poster_url TEXT,
    tmdb_id INTEGER,
    nominated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (week_id) REFERENCES weeks(id)
  )`);

  // Votes table - stores voting data
  db.run(`CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_id INTEGER,
    user_name TEXT,
    votes_json TEXT,
    voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (week_id) REFERENCES weeks(id)
  )`);
});

// Helper function to get Monday of current week
function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

// Helper function to format date as YYYY-MM-DD
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// Generate weeks for the next year
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

// HOME PAGE - Shows calendar and current status
app.get('/', (req, res) => {
  const weeks = generateWeeks();
  
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
        <style>
          body { 
            font-family: Arial, sans-serif; 
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
          }
          .container { max-width: 1200px; margin: 0 auto; }
          .header { text-align: center; margin-bottom: 30px; }
          .week-card {
            background: white;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 15px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .week-info h3 { margin: 0 0 10px 0; color: #333; }
          .week-info p { margin: 5px 0; color: #666; }
          .phase-badge {
            padding: 5px 10px;
            border-radius: 15px;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
          }
          .phase-planning { background: #e3f2fd; color: #1976d2; }
          .phase-genre { background: #fff3e0; color: #f57c00; }
          .phase-nomination { background: #e8f5e8; color: #388e3c; }
          .phase-voting { background: #fce4ec; color: #c2185b; }
          .phase-complete { background: #f3e5f5; color: #7b1fa2; }
          .actions {
            display: flex;
            gap: 10px;
          }
          .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            text-decoration: none;
            font-size: 14px;
          }
          .btn-primary { background: #2196f3; color: white; }
          .btn-success { background: #4caf50; color: white; }
          .btn-warning { background: #ff9800; color: white; }
          .user-select {
            position: fixed;
            top: 20px;
            right: 20px;
            background: white;
            padding: 10px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          select { padding: 5px; }
        </style>
      </head>
      <body>
        <div class="user-select">
          <label>You are: </label>
          <select id="currentUser" onchange="setCurrentUser()">
            <option value="">Select your name</option>
            ${CLUB_MEMBERS.map(member => `<option value="${member}">${member}</option>`).join('')}
          </select>
        </div>

        <div class="container">
          <div class="header">
            <h1>🎬 Film Club Calendar</h1>
            <p>Manage your weekly film selections and voting</p>
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
          }

          // Load current user on page load
          window.onload = function() {
            const savedUser = localStorage.getItem('currentUser');
            if (savedUser) {
              document.getElementById('currentUser').value = savedUser;
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
        </script>
      </body>
      </html>
    `);
  });
});

// Helper function to generate action buttons for each week
function getWeekActions(week) {
  const actions = [];
  
  if (week.phase === 'planning') {
    actions.push(`<a href="/set-genre/${week.date}" class="btn btn-primary" onclick="return checkUserAndGo('/set-genre/${week.date}')">Set Genre</a>`);
  } else if (week.phase === 'genre') {
    actions.push(`<a href="/random-genre/${week.date}" class="btn btn-warning" onclick="return checkUserAndGo('/random-genre/${week.date}')">Random Genre</a>`);
  } else if (week.phase === 'nomination') {
    actions.push(`<a href="/nominate/${week.date}" class="btn btn-success" onclick="return checkUserAndGo('/nominate/${week.date}')">Nominate Film</a>`);
  } else if (week.phase === 'voting') {
    actions.push(`<a href="/vote/${week.date}" class="btn btn-warning" onclick="return checkUserAndGo('/vote/${week.date}')">Vote</a>`);
  }
  
  return actions.join('');
}

// SET GENRE PAGE
app.get('/set-genre/:date', (req, res) => {
  const weekDate = req.params.date;
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Set Genre - Film Club</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; }
        h1 { text-align: center; margin-bottom: 30px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input, select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
        .btn { padding: 12px 24px; border: none; border-radius: 4px; cursor: pointer; margin: 5px; }
        .btn-primary { background: #2196f3; color: white; }
        .btn-secondary { background: #666; color: white; }
        .actions { text-align: center; margin-top: 30px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Set Genre for Week</h1>
        <p><strong>Week starting:</strong> ${new Date(weekDate).toLocaleDateString()}</p>
        
        <form action="/set-genre/${weekDate}" method="POST">
          <div class="form-group">
            <label>Choose Genre:</label>
            <select name="genre" required>
              <option value="">Select a genre...</option>
              ${GENRES.map(genre => `<option value="${genre}">${genre}</option>`).join('')}
            </select>
          </div>
          
          <div class="form-group">
            <label>Or enter custom genre:</label>
            <input type="text" name="customGenre" placeholder="e.g., XMAS FILMS, 80s Movies">
          </div>
          
          <div class="actions">
            <button type="submit" class="btn btn-primary">Set Genre</button>
            <a href="/" class="btn btn-secondary">Cancel</a>
          </div>
        </form>
      </div>
    </body>
    </html>
  `);
});

// HANDLE GENRE SETTING
app.post('/set-genre/:date', (req, res) => {
  const weekDate = req.params.date;
  const genre = req.body.customGenre || req.body.genre;
  const currentUser = req.headers.referer ? 'Unknown' : 'Unknown'; // We'll improve this
  
  if (!genre) {
    return res.status(400).send('Genre is required');
  }

  // Insert or update week in database
  db.run(
    `INSERT OR REPLACE INTO weeks (week_date, genre, genre_source, phase, created_by) 
     VALUES (?, ?, 'user', 'nomination', ?)`,
    [weekDate, genre, currentUser],
    function(err) {
      if (err) {
        console.error(err);
        return res.status(500).send('Database error');
      }
      res.redirect('/');
    }
  );
});

// RANDOM GENRE ENDPOINT
app.get('/random-genre/:date', (req, res) => {
  const weekDate = req.params.date;
  const randomGenre = GENRES[Math.floor(Math.random() * GENRES.length)];
  
  db.run(
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

// Start the server
app.listen(port, () => {
  console.log(`🎬 Film Club app running on port ${port}`);
  console.log(`Visit http://localhost:${port} to get started!`);
});
