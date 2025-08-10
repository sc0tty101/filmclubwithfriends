const express = require('express');
const router = express.Router();

// ENHANCED VOTING PAGE
router.get('/vote/:date', (req, res) => {
  const weekDate = req.params.date;
  const currentUser = req.query.user || 'Unknown';

  // Get week info
  req.db.get("SELECT * FROM weeks WHERE week_date = ?", [weekDate], (err, week) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }

    if (!week || week.phase !== 'voting') {
      return res.status(404).send('Week not found or not in voting phase');
    }

    // Get nominations for this week with film and nominator info
    req.db.all(
      `SELECT n.id, n.member_id, m.name as user_name, f.title as film_title, f.year as film_year, f.poster_url
         FROM nominations n
         JOIN films f ON n.film_id = f.id
         JOIN members m ON n.member_id = m.id
        WHERE n.week_id = ?
        ORDER BY f.title`,
      [week.id],
      (err, nominations) => {
        if (err) {
          console.error(err);
          return res.status(500).send('Database error');
        }

        if (nominations.length === 0) {
          return res.send('No nominations found for this week.');
        }

        // Get all votes to show progress
        req.db.all(
          "SELECT member_id FROM votes WHERE week_id = ?",
          [week.id],
          (err, allVotes) => {
            if (err) {
              console.error(err);
              return res.status(500).send('Database error');
            }

            // Check if user already voted
            req.db.get(
              "SELECT * FROM votes WHERE week_id = ? AND member_id = (SELECT id FROM members WHERE name = ?)",
              [week.id, currentUser],
              (err, existingVote) => {
                if (err) {
                  console.error(err);
                  return res.status(500).send('Database error');
                }

                const canVote = currentUser !== 'Unknown' && !existingVote;
                let userVotes = {};

                if (existingVote) {
                  try {
                    userVotes = JSON.parse(existingVote.votes_json);
                  } catch (e) {
                    console.error('Error parsing existing votes:', e);
                  }
                }

                // (render voting page as before, just use nominations as above)
                // Adjust referencing to nominations' new fields: user_name, film_title, film_year, poster_url, etc.
                // ... omitted for brevity ...
              }
            );
          }
        );
      }
    );
  });
});

// HANDLE VOTE SUBMISSION
router.post('/vote/:date', (req, res) => {
  const weekDate = req.params.date;
  const { userName, votes } = req.body;

  if (!userName || userName === 'Unknown' || !votes) {
    return res.json({ success: false, error: 'User name and votes are required' });
  }

  // Get week ID and member ID
  req.db.get("SELECT id FROM weeks WHERE week_date = ?", [weekDate], (err, week) => {
    if (err || !week) {
      console.error(err);
      return res.json({ success: false, error: 'Week not found' });
    }

    req.db.get("SELECT id FROM members WHERE name = ?", [userName], (err, member) => {
      if (err || !member) {
        return res.json({ success: false, error: 'User not found' });
      }

      // Check if user already voted
      req.db.get(
        "SELECT id FROM votes WHERE week_id = ? AND member_id = ?",
        [week.id, member.id],
        (err, existing) => {
          if (err) {
            console.error(err);
            return res.json({ success: false, error: 'Database error' });
          }

          if (existing) {
            return res.json({ success: false, error: 'You have already voted for this week' });
          }

          // Insert vote
          req.db.run(
            "INSERT INTO votes (week_id, member_id, votes_json) VALUES (?, ?, ?)",
            [week.id, member.id, JSON.stringify(votes)],
            function (err) {
              if (err) {
                console.error(err);
                return res.json({ success: false, error: 'Failed to save vote' });
              }

              res.json({ success: true });
            }
          );
        }
      );
    });
  });
});

module.exports = router;