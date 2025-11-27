// database/setup.js - Simplified version
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database path configuration
const dbPath = process.env.DB_PATH || (
  process.env.NODE_ENV === 'production' 
    ? '/data/filmclub.db' 
    : path.join(__dirname, '..', 'filmclub.db')
);

// Initialize SQLite database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Database connection failed:', err);
    process.exit(1);
  }
});

// Enable foreign keys - MUST be set for each connection
db.run("PRAGMA foreign_keys = ON", (err) => {
  if (err) {
    console.error('❌ Failed to enable foreign keys:', err);
  }
});

// Helper to ensure foreign keys are enabled for new connections
function enableForeignKeys(database) {
  database.run("PRAGMA foreign_keys = ON");
}

// Simplified schema - only essential tables
const SCHEMA = {
  // Members table
  members: `CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    is_active INTEGER DEFAULT 1,
    is_admin INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    CHECK (is_active IN (0, 1)),
    CHECK (is_admin IN (0, 1))
  )`,
  
  // Genres table
  genres: `CREATE TABLE IF NOT EXISTS genres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    CHECK (is_active IN (0, 1))
  )`,
  
  // Weeks table
  weeks: `CREATE TABLE IF NOT EXISTS weeks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_date DATE UNIQUE NOT NULL,
    genre_id INTEGER,
    phase TEXT DEFAULT 'planning',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE SET NULL,
    CHECK (phase IN ('planning', 'nomination', 'voting', 'complete'))
  )`,
  
  // Films table
  films: `CREATE TABLE IF NOT EXISTS films (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tmdb_id INTEGER UNIQUE,
    title TEXT NOT NULL,
    year INTEGER,
    director TEXT,
    runtime INTEGER,
    poster_url TEXT,
    tmdb_rating REAL,
    overview TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(title, year)
  )`,
  
  // Nominations table
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
  
  // Votes table
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
  
  // Results table
  results: `CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_id INTEGER UNIQUE NOT NULL,
    winning_nomination_id INTEGER NOT NULL,
    total_points INTEGER NOT NULL,
    calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (week_id) REFERENCES weeks(id) ON DELETE CASCADE,
    FOREIGN KEY (winning_nomination_id) REFERENCES nominations(id) ON DELETE CASCADE
  )`
};

// Create indexes for performance
const INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_weeks_date ON weeks(week_date)",
  "CREATE INDEX IF NOT EXISTS idx_weeks_phase ON weeks(phase)",
  "CREATE INDEX IF NOT EXISTS idx_nominations_week ON nominations(week_id)",
  "CREATE INDEX IF NOT EXISTS idx_votes_week ON votes(week_id)",
  "CREATE INDEX IF NOT EXISTS idx_films_tmdb ON films(tmdb_id)",
  "CREATE INDEX IF NOT EXISTS idx_results_week ON results(week_id)"
];

// Function to create all tables
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
    
    if (callback) callback(null);
  });
}

// Essential helper functions only
const dbHelpers = {
  // Get all active members
  getMembers: function(callback) {
    db.all(
      "SELECT id, name, is_admin FROM members WHERE is_active = 1 ORDER BY name",
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
      "SELECT id, name FROM genres WHERE is_active = 1 ORDER BY name",
      callback
    );
  },
  
  // Get or create film
  getOrCreateFilm: function(filmData, callback) {
    const { tmdb_id, title, year, director, runtime, poster_url, tmdb_rating, overview } = filmData;
    
    // Try to find existing film
    const findSql = tmdb_id 
      ? "SELECT id FROM films WHERE tmdb_id = ?"
      : "SELECT id FROM films WHERE title = ? AND year = ?";
    
    const findParams = tmdb_id ? [tmdb_id] : [title, year];
    
    db.get(findSql, findParams, (err, existing) => {
      if (err) return callback(err);
      
      if (existing) {
        callback(null, existing.id);
      } else {
        // Insert new film
        db.run(
          `INSERT INTO films (tmdb_id, title, year, director, runtime, poster_url, tmdb_rating, overview)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [tmdb_id, title, year, director, runtime, poster_url, tmdb_rating, overview],
          function(err) {
            callback(err, this ? this.lastID : null);
          }
        );
      }
    });
  },
  
  // Submit votes
  submitVotes: function(weekId, memberId, rankedNominations, callback) {
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
    db.serialize(() => {
      const rollback = (err) => {
        db.run("ROLLBACK", () => callback(err));
      };

      db.run("BEGIN TRANSACTION");

      db.get(`
        SELECT
          n.id as nomination_id,
          COALESCE(SUM(v.points), 0) as total_points
        FROM nominations n
        LEFT JOIN votes v ON n.id = v.nomination_id AND v.week_id = n.week_id
        WHERE n.week_id = ?
        GROUP BY n.id
        ORDER BY total_points DESC, n.id ASC
        LIMIT 1
      `, [weekId], (err, winner) => {
        if (err) return rollback(err);

        if (!winner) {
          return rollback(new Error('No nominations found for this week'));
        }

        // Store result (idempotent for repeated calculations)
        db.run(
          `INSERT INTO results (week_id, winning_nomination_id, total_points)
           VALUES (?, ?, ?)
           ON CONFLICT(week_id) DO UPDATE SET
             winning_nomination_id = excluded.winning_nomination_id,
             total_points = excluded.total_points,
             calculated_at = CURRENT_TIMESTAMP`,
          [weekId, winner.nomination_id, winner.total_points],
          (err) => {
            if (err) return rollback(err);

            // Update week phase
            db.run(
              "UPDATE weeks SET phase = 'complete' WHERE id = ?",
              [weekId],
              (updateErr) => {
                if (updateErr) return rollback(updateErr);

                db.run("COMMIT", (commitErr) => callback(commitErr, winner));
              }
            );
          }
        );
      });
    });
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

// Create a new database connection (used for admin operations)
function createNewConnection(path) {
  const newDb = new sqlite3.Database(path || dbPath);
  enableForeignKeys(newDb);
  return newDb;
}

// Export everything
module.exports = {
  db,
  dbPath,
  SCHEMA,
  createAllTables,
  enableForeignKeys,
  createNewConnection,
  ...dbHelpers
};
