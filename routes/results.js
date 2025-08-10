const express = require('express');
const router = express.Router();

// Helper function for ordinal suffixes
function getOrdinalSuffix(num) {
  const j = num % 10;
  const k = num % 100;
  if (j == 1 && k != 11) return "st";
  if (j == 2 && k != 12) return "nd";
  if (j == 3 && k != 13) return "rd";
  return "th";
}

function getConsensusLevel(results) {
  if (results.length < 2) return "N/A";
  const topScore = results[0].totalScore;
  const secondScore = results[1].totalScore;
  const margin = topScore - secondScore;
  if (margin <= 2) return "Very Low";
  if (margin <= 5) return "Low";
  if (margin <= 10) return "Medium";
  if (margin <= 15) return "High";
  return "Very High";
}

// VIEW RESULTS PAGE
router.get('/results/:date', (req, res) => {
  const weekDate = req.params.date;

  // Get week info with winner details (join winner nomination to films and members)
  req.db.get(`
    SELECT w.*, 
           f.title as winner_title, f.year as winner_year, 
           f.poster_url as winner_poster, m.name as winner_nominator
      FROM weeks w
      LEFT JOIN nominations n ON w.winner_film_id = n.id
      LEFT JOIN films f ON n.film_id = f.id
      LEFT JOIN members m ON n.member_id = m.id
     WHERE w.week_date = ?
  `, [weekDate], (err, week) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }

    if (!week || week.phase !== 'complete') {
      return res.status(404).send('Results not available for this week');
    }

    // Get all nominations with their scores and vote breakdown
    req.db.all(`
      SELECT n.id, f.title as film_title, f.year as film_year, f.poster_url, m.name as nominator
        FROM nominations n
        JOIN films f ON n.film_id = f.id
        JOIN members m ON n.member_id = m.id
       WHERE n.week_id = ?
       ORDER BY f.title
    `, [week.id], (err, nominations) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Database error');
      }

      // Get all votes for this week
      req.db.all(`
        SELECT member_id, votes_json 
          FROM votes 
         WHERE week_id = ?
      `, [week.id], (err, votes) => {
        if (err) {
          console.error(err);
          return res.status(500).send('Database error');
        }

        // Calculate scores and vote breakdown for each film
        const filmResults = nominations.map(film => {
          let totalScore = 0;
          let voteBreakdown = [];
          let voterCount = 0;

          votes.forEach(vote => {
            try {
              const voteData = JSON.parse(vote.votes_json);
              const points = voteData[film.id] || 0;
              if (points > 0) {
                totalScore += points;
                voteBreakdown.push({
                  voter: vote.member_id, // You could join for name if desired
                  points: points,
                  rank: nominations.length - points + 1
                });
                voterCount++;
              }
            } catch (e) {
              console.error('Error parsing vote:', e);
            }
          });

          // Sort breakdown by points (highest first)
          voteBreakdown.sort((a, b) => b.points - a.points);

          return {
            ...film,
            totalScore,
            voteBreakdown,
            voterCount,
            averageScore: voterCount > 0 ? (totalScore / voterCount).toFixed(1) : 0
          };
        });

        // Sort by total score (highest first)
        filmResults.sort((a, b) => b.totalScore - a.totalScore);

        // Get voting participation stats
        const totalVoters = votes.length;
        const totalNominations = nominations.length;

        // (render results as before, use updated fields)
        // ... omitted for brevity ...
      });
    });
  });
});

// CALCULATE RESULTS - update to use normalized vote structure
router.post('/calculate-results/:date', (req, res) => {
  const weekDate = req.params.date;

  // Get week info
  req.db.get("SELECT * FROM weeks WHERE week_date = ?", [weekDate], (err, week) => {
    if (err || !week) {
      console.error('Week not found:', err);
      return res.json({ success: false, error: 'Week not found' });
    }

    // Get all votes for this week
    req.db.all("SELECT votes_json FROM votes WHERE week_id = ?", [week.id], (err, votes) => {
      if (err) {
        console.error('Error getting votes:', err);
        return res.json({ success: false, error: 'Database error getting votes' });
      }

      if (votes.length === 0) {
        return res.json({ success: false, error: 'No votes found for this week' });
      }

      // Calculate total points for each nomination_id
      const filmScores = {};
      votes.forEach(vote => {
        try {
          const voteData = JSON.parse(vote.votes_json);
          Object.entries(voteData).forEach(([nominationId, points]) => {
            filmScores[nominationId] = (filmScores[nominationId] || 0) + points;
          });
        } catch (e) {
          console.error('Error parsing vote:', e);
        }
      });

      // Find winner nomination_id
      let winnerId = null;
      let highestScore = 0;
      Object.entries(filmScores).forEach(([nominationId, score]) => {
        if (score > highestScore) {
          highestScore = score;
          winnerId = nominationId;
        }
      });

      if (!winnerId) {
        return res.json({ success: false, error: 'No winner could be determined' });
      }

      // Update week to complete and store winner nomination id
      req.db.run(
        "UPDATE weeks SET phase = 'complete', winner_film_id = ?, winner_score = ? WHERE id = ?",
        [winnerId, highestScore, week.id],
        function (err) {
          if (err) {
            console.error('Error saving results:', err);
            return res.json({ success: false, error: 'Failed to save results' });
          }

          res.json({
            success: true,
            winner: winnerId,
            score: highestScore
          });
        }
      );
    });
  });
});

module.exports = router;