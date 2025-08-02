const sqlite3 = require('sqlite3').verbose();

// Initialize SQLite database
const db = new sqlite3.Database('./filmclub.db');

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
