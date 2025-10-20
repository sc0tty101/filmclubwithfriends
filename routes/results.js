// routes/results.js - Updated with authentication
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { validateDate } = require('../middleware/validation');

// View results page - only for completed weeks
router.get('/results/:date', requireAuth, validateDate, (req, res) => {
  const weekDate = req.params.date;

  // Get week info - ONLY for complete phase
  req.db.get(`
    SELECT w.*, g.name as genre_name
    FROM weeks w
    LEFT JOIN genres g ON w.genre_id = g.id
    WHERE w.week_date = ? AND w.phase = 'complete'
  `, [weekDate], (err, week) => {
    if (err || !week) {
      return res.status(404).send('Results not available for this week - voting may still be in progress');
    }

    // Get all nominations with their vote totals
    req.db.all(`
      SELECT 
        n.id,
        f.title,
        f.year,
        f.poster_url,
        f.director,
        f.overview,
        m.name as nominator,
        COALESCE(SUM(v.points), 0) as total_points,
        COUNT(v.id) as vote_count
      FROM nominations n
      JOIN films f ON n.film_id = f.id
      JOIN members m ON n.member_id = m.id
      LEFT JOIN votes v ON n.id = v.nomination_id
      WHERE n.week_id = ?
      GROUP BY n.id
      ORDER BY total_points DESC, f.title
    `, [week.id], (err, nominations) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Database error');
      }

      // Get detailed votes for each nomination
      req.db.all(`
        SELECT 
          v.nomination_id,
          v.rank,
          v.points,
          m.name as voter
        FROM votes v
        JOIN members m ON v.member_id = m.id
        WHERE v.week_id = ?
        ORDER BY v.nomination_id, v.points DESC
      `, [week.id], (err, allVotes) => {
        if (err) allVotes = [];

        // Group votes by nomination
        const votesByNomination = {};
        allVotes.forEach(vote => {
          if (!votesByNomination[vote.nomination_id]) {
            votesByNomination[vote.nomination_id] = [];
          }
          votesByNomination[vote.nomination_id].push(vote);
        });

        const winner = nominations[0];
        const hasVotes = winner && winner.total_points > 0;

        res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Final Results - Film Club</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <link rel="stylesheet" href="/styles/main.css">
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🏆 Final Results</h1>
                <p>Week of ${new Date(weekDate).toLocaleDateString()}</p>
                <p><strong>Genre: ${week.genre_name}</strong></p>
              </div>

              ${hasVotes ? `
                <!-- Winner Display -->
                <div class="card">
                  <div class="winner-display">
                    <h2>🎉 Winner!</h2>
                    <h3>${winner.title} ${winner.year ? `(${winner.year})` : ''}</h3>
                    <p>Nominated by ${winner.nominator}</p>
                    <p><strong>${winner.total_points} points</strong> from ${winner.vote_count} votes</p>
                  </div>
                </div>

                <!-- All Results -->
                <div class="card">
                  <h2>Final Rankings</h2>
                  ${nominations.map((nom, index) => `
                    <div style="margin-bottom: 20px; padding: 15px; background: ${index === 0 ? '#fef3c7' : '#f9fafb'}; border-radius: 8px;">
                      <div style="display: flex; align-items: start; gap: 15px;">
                        <div style="font-size: 24px; font-weight: bold; color: ${index === 0 ? '#f59e0b' : '#6b7280'};">
                          #${index + 1}
                        </div>
                        ${nom.poster_url ? 
                          `<img src="https://image.tmdb.org/t/p/w92${nom.poster_url}" class="film-poster">` :
                          '<div class="poster-placeholder">No poster</div>'
                        }
                        <div style="flex: 1;">
                          <h3 style="margin: 0 0 5px 0;">${nom.title} ${nom.year ? `(${nom.year})` : ''}</h3>
                          <p style="margin: 5px 0;">Nominated by ${nom.nominator}</p>
                          ${nom.director ? `<p style="margin: 5px 0;"><small>Director: ${nom.director}</small></p>` : ''}
                          <p style="margin: 10px 0;">
                            <strong>${nom.total_points} points</strong> 
                            ${nom.vote_count > 0 ? `from ${nom.vote_count} votes` : '(no votes)'}
                          </p>
                        </div>
                      </div>
                      
                      ${votesByNomination[nom.id] && votesByNomination[nom.id].length > 0 ? `
                        <div class="vote-breakdown">
                          <strong>Votes:</strong>
                          ${votesByNomination[nom.id].map(v => 
                            `<span style="display: inline-block; margin: 5px; padding: 5px 10px; background: white; border-radius: 5px;">
                              ${v.voter}: #${v.rank} (${v.points}pts)
                            </span>`
                          ).join('')}
                        </div>
                      ` : ''}
                    </div>
                  `).join('')}
                </div>
              ` : `
                <div class="card">
                  <p style="text-align: center; color: #999;">
                    No votes were submitted for this week.
                  </p>
                </div>
              `}

              <div class="actions center">
                <a href="/" class="btn btn-secondary">Back to Calendar</a>
              </div>
            </div>
          </body>
          </html>
        `);
      });
    });
  });
});

module.exports = router;
