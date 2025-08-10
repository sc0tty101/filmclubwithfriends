// database/setup.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database path configuration
const dbPath = process.env.DB_PATH || (
  process.env.NODE_ENV === 'production' 
    ? '/data/filmclub.db' 
    : path.join(__dirname, '..', 'filmclub.db')
);

// Initialize SQLite database with foreign keys enabled
const db = new sqlite3.Database(dbPath);

// Enable foreign keys (critical for data integrity)
db.run("PRAGMA foreign_keys = ON");

// Improved schema with better structure
const SCHEMA = {
  // Members table - core users
  members: `CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    is_active INTEGER DEFAULT 1,
    is_admin INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    CHECK (is_active IN (0, 1)),
    CHECK (is_admin IN (0, 1))
  )`,
  
  // Genres table
  genres: `CREATE TABLE IF NOT EXISTS genres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    times_used INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    CHECK (is_active IN (0, 1))
  )`,
  
  // Weeks table - simplified
  weeks: `CREATE TABLE IF NOT EXISTS weeks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_date DATE UNIQUE NOT NULL,
    genre_id INTEGER,
    phase TEXT DEFAULT 'planning',
    genre_setter_id INTEGER,
    phase_changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE SET NULL,
    FOREIGN KEY (genre_setter_id) REFERENCES members(id) ON DELETE SET NULL,
    CHECK (phase IN ('planning', 'nomination', 'voting', 'complete'))
  )`,
  
  // Films table - separate from nominations for reusability
  films: `CREATE TABLE IF NOT EXISTS films (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tmdb_id INTEGER UNIQUE,
    title TEXT NOT NULL,
    year INTEGER,
    director TEXT,
    runtime INTEGER,
    poster_url TEXT,
    backdrop_url TEXT,
    tmdb_rating REAL,
    overview TEXT,
    genres TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(title, year),
    CHECK (year IS NULL OR (year >= 1900 AND year <= 2100))
  )`,
  
  // Nominations table - links members, films, and weeks
  nominations: `CREATE TABLE IF NOT EXISTS nominations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_id INTEGER NOT NULL,
    film_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    nominated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (week_id) REFERENCES weeks(id) ON DELETE CASCADE,
    FOREIGN KEY (film_id) REFERENCES films(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    UNIQUE(week_id, member_id),
    UNIQUE(week_id, film_id)
  )`,
  
  // Votes table - normalized, no JSON
  votes: `CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    nomination_id INTEGER NOT NULL,
    rank INTEGER NOT NULL,
    points INTEGER NOT NULL,
    voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (week_id) REFERENCES weeks(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (nomination_id) REFERENCES nominations(id) ON DELETE CASCADE,
    UNIQUE(week_id, member_id, nomination_id),
    UNIQUE(week_id, member_id, rank),
    CHECK (rank > 0),
    CHECK (points > 0)
  )`,
  
  // Results table - calculated winners
  results: `CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_id INTEGER UNIQUE NOT NULL,
    winning_nomination_id INTEGER NOT NULL,
    total_points INTEGER NOT NULL,
    vote_count INTEGER NOT NULL,
    calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (week_id) REFERENCES weeks(id) ON DELETE CASCADE,
    FOREIGN KEY (winning_nomination_id) REFERENCES nominations(id) ON DELETE CASCADE
  )`,
  
  // Activity log for tracking actions
  activity_log: `CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id INTEGER,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL
  )`
};

// Create indexes for performance
const INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_weeks_date ON weeks(week_date)",
  "CREATE INDEX IF NOT EXISTS idx_weeks_phase ON weeks(phase)",
  "CREATE INDEX IF NOT EXISTS idx_nominations_week ON nominations(week_id)",
  "CREATE INDEX IF NOT EXISTS idx_nominations_member ON nominations(member_id)",
  "CREATE INDEX IF NOT EXISTS idx_votes_week ON votes(week_id)",
  "CREATE INDEX IF NOT EXISTS idx_votes_member ON votes(member_id)",
  "CREATE INDEX IF NOT EXISTS idx_films_tmdb ON films(tmdb_id)",
  "CREATE INDEX IF NOT EXISTS idx_results_week ON results(week_id)",
  "CREATE INDEX IF NOT EXISTS idx_activity_member ON activity_log(member_id)",
  "CREATE INDEX IF NOT EXISTS idx_activity_date ON activity_log(created_at)"
];

// Create views for common queries
const VIEWS = {
  // Current week view
  current_week: `CREATE VIEW IF NOT EXISTS current_week AS
    SELECT w.*, g.name as genre_name
    FROM weeks w
    LEFT JOIN genres g ON w.genre_id = g.id
    WHERE date(w.week_date) <= date('now') 
    AND date(w.week_date, '+7 days') > date('now')
    LIMIT 1`,
  
  // Week summary view
  week_summary: `CREATE VIEW IF NOT EXISTS week_summary AS
    SELECT 
      w.id,
      w.week_date,
      w.phase,
      g.name as genre_name,
      COUNT(DISTINCT n.id) as nomination_count,
      COUNT(DISTINCT v.member_id) as voter_count,
      r.total_points as winner_points,
      wf.title as winner_title,
      wf.year as winner_year,
      wm.name as winner_nominator
    FROM weeks w
    LEFT JOIN genres g ON w.genre_id = g.id
    LEFT JOIN nominations n ON w.id = n.week_id
    LEFT JOIN votes v ON w.id = v.week_id
    LEFT JOIN results r ON w.id = r.week_id
    LEFT JOIN nominations wn ON r.winning_nomination_id = wn.id
    LEFT JOIN films wf ON wn.film_id = wf.id
    LEFT JOIN members wm ON wn.member_id = wm.id
    GROUP BY w.id`,
  
  // Member statistics view
  member_stats: `CREATE VIEW IF NOT EXISTS member_stats AS
    SELECT 
      m.id,
      m.name,
      COUNT(DISTINCT n.id) as total_nominations,
      COUNT(DISTINCT v.week_id) as weeks_voted,
      COUNT(DISTINCT r.id) as wins,
      COALESCE(SUM(r.total_points), 0) as total_winning_points
    FROM members m
    LEFT JOIN nominations n ON m.id = n.member_id
    LEFT JOIN votes v ON m.id = v.member_id
    LEFT JOIN results r ON n.id = r.winning_nomination_id
    WHERE m.is_active = 1
    GROUP BY m.id`
};

// Function to create all tables and indexes
function createAllTables(database, callback) {
  database.serialize(() => {
    // Create tables
    Object.entries(SCHEMA).forEach(([name, sql]) => {
      database.run(sql, (err) => {
        if (err) console.error(`Error creating ${name} table:`, err);
        else console.log(`✓ ${name} table ready`);
      });
    });
    
    // Create indexes
    INDEXES.forEach(sql => {
      database.run(sql, (err) => {
        if (err) console.error('Error creating index:', err);
      });
    });
    
    // Create views
    Object.entries(VIEWS).forEach(([name, sql]) => {
      database.run(sql, (err) => {
        if (err) console.error(`Error creating ${name} view:`, err);
        else console.log(`✓ ${name} view ready`);
      });
    });
    
    if (callback) callback(null);
  });
}

// Helper functions with better error handling
const dbHelpers = {
  // Get all active members
  getMembers: function(callback) {
    db.all(
      "SELECT id, name, email, is_admin FROM members WHERE is_active = 1 ORDER BY name",
      callback
    );
  },
  
  // Get member by name or id
  getMember: function(identifier, callback) {
    const isId = typeof identifier === 'number';
    const sql = isId 
      ? "SELECT * FROM members WHERE id = ? AND is_active = 1"
      : "SELECT * FROM members WHERE name = ? AND is_active = 1";
    db.get(sql, [identifier], callback);
  },
  
  // Get all active genres
  getGenres: function(callback) {
    db.all(
      "SELECT id, name, description, times_used FROM genres WHERE is_active = 1 ORDER BY name",
      callback
    );
  },
  
  // Get or create film
  getOrCreateFilm: function(filmData, callback) {
    const { tmdb_id, title, year, director, runtime, poster_url, backdrop_url, tmdb_rating, overview, genres } = filmData;
    
    // Try to find existing film
    const findSql = tmdb_id 
      ? "SELECT id FROM films WHERE tmdb_id = ?"
      : "SELECT id FROM films WHERE title = ? AND year = ?";
    
    const findParams = tmdb_id ? [tmdb_id] : [title, year];
    
    db.get(findSql, findParams, (err, existing) => {
      if (err) return callback(err);
      
      if (existing) {
        // Update existing film with new data if we have it
        if (tmdb_id) {
          db.run(
            `UPDATE films SET 
              title = COALESCE(?, title),
              year = COALESCE(?, year),
              director = COALESCE(?, director),
              runtime = COALESCE(?, runtime),
              poster_url = COALESCE(?, poster_url),
              backdrop_url = COALESCE(?, backdrop_url),
              tmdb_rating = COALESCE(?, tmdb_rating),
              overview = COALESCE(?, overview),
              genres = COALESCE(?, genres)
            WHERE id = ?`,
            [title, year, director, runtime, poster_url, backdrop_url, tmdb_rating, overview, genres, existing.id],
            (err) => callback(err, existing.id)
          );
        } else {
          callback(null, existing.id);
        }
      } else {
        // Insert new film
        db.run(
          `INSERT INTO films (tmdb_id, title, year, director, runtime, poster_url, backdrop_url, tmdb_rating, overview, genres)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [tmdb_id, title, year, director, runtime, poster_url, backdrop_url, tmdb_rating, overview, genres],
          function(err) {
            callback(err, this ? this.lastID : null);
          }
        );
      }
    });
  },
  
  // Add nomination
  addNomination: function(weekId, filmId, memberId, callback) {
    db.run(
      "INSERT INTO nominations (week_id, film_id, member_id) VALUES (?, ?, ?)",
      [weekId, filmId, memberId],
      callback
    );
  },
  
  // Submit votes (replaces JSON approach)
  submitVotes: function(weekId, memberId, rankedNominations, callback) {
    // rankedNominations should be array of {nominationId, rank}
    const totalNominations = rankedNominations.length;
    
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");
      
      let errors = [];
      let completed = 0;
      
      rankedNominations.forEach(({nominationId, rank}) => {
        const points = totalNominations - rank + 1;
        
        db.run(
          `INSERT OR REPLACE INTO votes (week_id, member_id, nomination_id, rank, points)
           VALUES (?, ?, ?, ?, ?)`,
          [weekId, memberId, nominationId, rank, points],
          (err) => {
            if (err) errors.push(err);
            completed++;
            
            if (completed === rankedNominations.length) {
              if (errors.length > 0) {
                db.run("ROLLBACK", () => callback(errors[0]));
              } else {
                db.run("COMMIT", callback);
              }
            }
          }
        );
      });
    });
  },
  
  // Calculate results
  calculateResults: function(weekId, callback) {
    db.get(`
      SELECT 
        n.id as nomination_id,
        SUM(v.points) as total_points,
        COUNT(v.id) as vote_count
      FROM nominations n
      LEFT JOIN votes v ON n.id = v.nomination_id
      WHERE n.week_id = ?
      GROUP BY n.id
      ORDER BY total_points DESC
      LIMIT 1
    `, [weekId], (err, winner) => {
      if (err || !winner) return callback(err || new Error('No votes found'));
      
      // Store result
      db.run(
        `INSERT OR REPLACE INTO results (week_id, winning_nomination_id, total_points, vote_count)
         VALUES (?, ?, ?, ?)`,
        [weekId, winner.nomination_id, winner.total_points, winner.vote_count],
        (err) => {
          if (!err) {
            // Update week phase
            db.run(
              "UPDATE weeks SET phase = 'complete' WHERE id = ?",
              [weekId],
              () => callback(err, winner)
            );
          } else {
            callback(err);
          }
        }
      );
    });
  },
  
  // Log activity
  logActivity: function(memberId, action, entityType, entityId, details) {
    db.run(
      `INSERT INTO activity_log (member_id, action, entity_type, entity_id, details)
       VALUES (?, ?, ?, ?, ?)`,
      [memberId, action, entityType, entityId, details]
    );
  }
};

// Initialize database on module load
createAllTables(db, (err) => {
  if (err) {
    console.error('Database initialization failed:', err);
  } else {
    console.log('✓ Database initialized successfully');
  }
});

// Export everything
module.exports = {
  db,
  dbPath,
  SCHEMA,
  createAllTables,
  ...dbHelpers
};
