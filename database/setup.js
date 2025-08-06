// database/setup.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database path configuration
const dbPath = process.env.DB_PATH || (process.env.NODE_ENV === 'production' ? '/data/filmclub.db' : './filmclub.db');

// Initialize SQLite database
const db = new sqlite3.Database(dbPath);

// Centralized schema definition
const SCHEMA = {
  weeks: `CREATE TABLE IF NOT EXISTS weeks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_date TEXT NOT NULL,
    genre TEXT,
    genre_source TEXT,
    phase TEXT DEFAULT 'planning',
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    winner_film_id INTEGER,
    winner_score INTEGER
  )`,
  
  nominations: `CREATE TABLE IF NOT EXISTS nominations (
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
  )`,
  
  votes: `CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_id INTEGER,
    user_name TEXT,
    votes_json TEXT,
    voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (week_id) REFERENCES weeks(id)
  )`,
  
  members: `CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1,
    is_admin INTEGER DEFAULT 0
  )`,
  
  genres: `CREATE TABLE IF NOT EXISTS genres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1
  )`
};

// Function to create all tables - can be called from anywhere
function createAllTables(database, callback) {
  database.serialize(() => {
    // Create each table in order
    database.run(SCHEMA.weeks, (err) => {
      if (err) console.error('Error creating weeks table:', err);
    });
    
    database.run(SCHEMA.nominations, (err) => {
      if (err) console.error('Error creating nominations table:', err);
    });
    
    database.run(SCHEMA.votes, (err) => {
      if (err) console.error('Error creating votes table:', err);
    });
    
    database.run(SCHEMA.members, (err) => {
      if (err) console.error('Error creating members table:', err);
    });
    
    database.run(SCHEMA.genres, (err) => {
      if (err) {
        console.error('Error creating genres table:', err);
        if (callback) callback(err);
      } else {
        console.log('All tables created successfully');
        if (callback) callback(null);
      }
    });
  });
}

// Create tables on module load
createAllTables(db);

// Helper functions
function getMembers(callback) {
  db.all("SELECT name FROM members WHERE is_active = 1 ORDER BY name", callback);
}

function getGenres(callback) {
  db.all("SELECT name FROM genres WHERE is_active = 1 ORDER BY name", callback);
}

// Export everything needed
module.exports = db;
module.exports.getMembers = getMembers;
module.exports.getGenres = getGenres;
module.exports.createAllTables = createAllTables;
module.exports.SCHEMA = SCHEMA;
module.exports.dbPath = dbPath;
