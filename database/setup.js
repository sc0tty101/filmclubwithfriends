// database/setup.js
const sqlite3 = require('sqlite3').verbose();

// Initialize SQLite database
const db = new sqlite3.Database('/data/filmclub.db');

// Create tables when module is loaded
db.serialize(() => {
  // Weeks table - stores each week's info
  db.run(`CREATE TABLE IF NOT EXISTS weeks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_date TEXT NOT NULL,
    genre TEXT,
    genre_source TEXT,
    phase TEXT DEFAULT 'planning',
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    winner_film_id INTEGER,
    winner_score INTEGER
  )`);

  // Enhanced Nominations table - stores film nominations with full TMDB data
  db.run(`CREATE TABLE IF NOT EXISTS nominations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_id INTEGER,
    user_name TEXT,
    film_title TEXT,
    film_year INTEGER,
    poster_url TEXT,
    backdrop_url TEXT,
    tmdb_id INTEGER,
    vote_average REAL,
    release_date TEXT,
    runtime INTEGER,
    overview TEXT,
    director TEXT,
    tmdb_genres TEXT,
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

  // Members table - stores club members
  db.run(`CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1,
    is_admin INTEGER DEFAULT 0
  )`);

  // Genres table - stores available genres
  db.run(`CREATE TABLE IF NOT EXISTS genres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1
  )`);
});

// Helper functions
function getMembers(callback) {
  db.all("SELECT name FROM members WHERE is_active = 1 ORDER BY name", callback);
}

function getGenres(callback) {
  db.all("SELECT name FROM genres WHERE is_active = 1 ORDER BY name", callback);
}

// Export database instance and helper functions
module.exports = db;
module.exports.getMembers = getMembers;
module.exports.getGenres = getGenres;
