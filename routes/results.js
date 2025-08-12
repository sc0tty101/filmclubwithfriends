// routes/results.js - Final results display (complete phase only)
const express = require('express');
const router = express.Router();

// View results page - only for completed weeks
router.get('/results/:date', (req, res) => {
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
              <div class="stepper">
                <div class="step completed"><div class="step-circle">1</div><span>Nomination</span></div>
                <div class="step completed"><div class="step-circle">2</div><span>Voting</span></div>
                <div class="step active"><div class="step-circle">3</div><span>Results</span></div>
              </div>
              ${hasVotes ? `
                <div class="card">
                  <div class="winner-display">
                    <h2>🎉 Winner!</h2>
                    <h3>${winner.title} ${winner.year ? `(${winner.year})` : ''}</h3>
                    <p>Nominated by ${winner.nominator}</p>
                    <p><strong>${winner.total_points} points</strong> from ${winner.vote_count} votes</p>
                  </div>
                </div>
                <div class="card">
                  <h2>Final Rankings</h2>
                  ${nominations.map((nom, index) => `
                    <div class="film-card${index === 0 ? ' winner' : ''}">
                      ${nom.poster_url ? 
                        `<img src="https://image.tmdb.org/t/p/w185${nom.poster_url}" class="film-poster" alt="Poster for ${nom.title}">` :
                        `<div class="poster-placeholder" aria-label="No poster">
                          <svg width="40" height="60" viewBox="0 0 40 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect width="40" height="60" rx="6" fill="#e5e7eb"/>
                            <path d="M10 40l7-10 7 10 6-8 7 12H3l7-12z" fill="#cbd5e1"/>
                          </svg>
                        </div>`
                      }
                      <div class="film-details">
                        <div class="film-title">${nom.title}${nom.year ? ` (${nom.year})` : ''}</div>
                        <div class="film-meta">
                          ${nom.director ? `<span title="Director">
                            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a2 2 0 110 4 2 2 0 010-4zm0 5c2.21 0 4 1.79 4 4v1H4v-1c0-2.21 1.79-4 4-4z"/></svg>
                            ${nom.director}
                          </span>` : ''}
                          ${nom.runtime ? `<span title="Runtime">
                            <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="2" fill="none"/><path d="M8 4v4l3 2" stroke="currentColor" stroke-width="2" fill="none"/></svg>
                            ${nom.runtime} min
                          </span>` : ''}
                          ${nom.tmdb_rating ? `<span title="TMDB Rating">
                            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 12l-4.472 2.951 1.705-5.254L1 6.549l5.528-.004L8 1.5l1.472 5.045 5.528.004-4.233 3.148 1.705 5.254z"/></svg>
                            ${nom.tmdb_rating}/10
                          </span>` : ''}
                        </div>
                        ${nom.overview ? `<div class="film-overview">${nom.overview.length > 140 ? nom.overview.substring(0, 140) + '…' : nom.overview}</div>` : ''}
                        <div class="nominator">Nominated by ${nom.nominator}</div>
                        <div style="margin-top: 8px;">
                          <strong>${nom.total_points} points</strong> 
                          ${nom.vote_count > 0 ? `from ${nom.vote_count} votes` : '(no votes)'}
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
