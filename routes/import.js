// ... [top unchanged] ...
const { getOrCreateFilm } = require('../database/setup');
// ... [keep previous helper functions] ...

// In your POST '/admin/import-historical' route, replace nomination import logic with:
router.post('/admin/import-historical', (req, res) => {
  const { nominations, members, fetchTMDB } = req.body;

  if (!nominations || nominations.length === 0) {
    return res.status(400).json({ error: 'No data to import' });
  }

  let weeksImported = 0;
  let nominationsImported = 0;
  let membersCreated = 0;
  let tmdbEnhanced = 0;
  const errors = [];
  const weekIds = {};

  // Start transaction
  req.db.serialize(() => {
    req.db.run("BEGIN TRANSACTION");

    // Step 1: Create missing members (same as before)...
    // Step 2: Group nominations by week (same as before)...

    // Step 3: Process each week
    // (replace the nomination insert logic inside processNomination)
    async function processNomination() {
      // ...inside your nomination loop, after extracting filmTitle, filmYear...
      // Get or create film
      getOrCreateFilm({
        title: filmTitle,
        year: filmYear,
        // If you have tmdb-enhanced data, use it here as well
        // (optional: director, poster_url, etc)
      }, (err, filmId) => {
        if (err || !filmId) {
          errors.push(`Failed to save film "${filmTitle}": ${err ? err.message : 'Unknown error'}`);
          nomIndex++;
          processNomination();
          return;
        }

        req.db.get("SELECT id FROM members WHERE name = ?", [nom.nominator], (err, member) => {
          if (err || !member) {
            errors.push(`Member not found: ${nom.nominator}`);
            nomIndex++;
            processNomination();
            return;
          }

          req.db.run(
            "INSERT INTO nominations (week_id, film_id, member_id) VALUES (?, ?, ?)",
            [weekId, filmId, member.id],
            function (err) {
              if (err) {
                errors.push(`Failed to import nomination for "${filmTitle}": ${err.message}`);
              } else {
                nominationsImported++;
                // If this is the winner, update the week
                if (winner && nom.film === winner.film && nom.nominator === winner.nominator) {
                  req.db.run(
                    "UPDATE weeks SET winner_film_id = ?, winner_score = ? WHERE id = ?",
                    [this.lastID, nom.voteScore, weekId]
                  );
                }
              }
              nomIndex++;
              processNomination();
            }
          );
        });
      });
    }
    // ...rest of logic unchanged...
  });
});

// ... rest unchanged ...