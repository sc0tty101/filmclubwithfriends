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

// Helper function to determine consensus level
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
  
  // Get week info with winner details
  req.db.get(`
    SELECT w.*, n.film_title as winner_title, n.film_year as winner_year, 
           n.poster_url as winner_poster, n.user_name as winner_nominator
    FROM weeks w 
    LEFT JOIN nominations n ON w.winner_film_id = n.id 
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
      SELECT n.id, n.film_title, n.film_year, n.poster_url, n.user_name as nominator
      FROM nominations n
      WHERE n.week_id = ?
      ORDER BY n.film_title
    `, [week.id], (err, nominations) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Database error');
      }

      // Get all votes for this week
      req.db.all(`
        SELECT user_name, votes_json 
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
                  voter: vote.user_name,
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

        res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Results - Film Club</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <link rel="stylesheet" href="/styles.css">
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🏆 Week Results</h1>
                <p><strong>Week:</strong> ${new Date(weekDate).toLocaleDateString()}</p>
                <p><strong>Genre:</strong> ${week.genre}</p>
                <div class="stats-summary">
                  <span class="stat-item">📊 ${totalVoters} voters</span>
                  <span class="stat-item">🎬 ${totalNominations} films</span>
                  <span class="stat-item">🎯 ${week.winner_score} winning points</span>
                </div>
              </div>

              <div class="card winner-card">
                <h2>🥇 Winner</h2>
                <div class="winner-display">
                  ${week.winner_poster ? `<img src="https://image.tmdb.org/t/p/w200${week.winner_poster}" alt="${week.winner_title}" class="winner-poster">` : ''}
                  <div class="winner-details">
                    <h3>${week.winner_title} (${week.winner_year})</h3>
                    <p><strong>Nominated by:</strong> ${week.winner_nominator}</p>
                    <div class="winner-stats">
                      <div class="stat-badge">
                        <span class="stat-number">${week.winner_score}</span>
                        <span class="stat-label">Total Points</span>
                      </div>
                      <div class="stat-badge">
                        <span class="stat-number">${filmResults[0]?.averageScore || 0}</span>
                        <span class="stat-label">Avg Score</span>
                      </div>
                      <div class="stat-badge">
                        <span class="stat-number">${filmResults[0]?.voterCount || 0}</span>
                        <span class="stat-label">Voters</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="card">
                <h2>📊 Detailed Results</h2>
                <div class="results-list">
                  ${filmResults.map((film, index) => `
                    <div class="result-item ${index === 0 ? 'winner' : ''}">
                      <div class="result-header">
                        <div class="result-rank">${index + 1}</div>
                        <div class="film-info">
                          ${film.poster_url ? `<img src="https://image.tmdb.org/t/p/w92${film.poster_url}" alt="${film.film_title}" class="film-poster">` : ''}
                          <div class="film-details">
                            <h4>${film.film_title} (${film.film_year})</h4>
                            <p>Nominated by: ${film.nominator}</p>
                          </div>
                        </div>
                        <div class="result-score">
                          <div class="total-score">${film.totalScore} pts</div>
                          <div class="avg-score">avg: ${film.averageScore}</div>
                        </div>
                      </div>
                      
                      ${film.voteBreakdown.length > 0 ? `
                        <div class="vote-breakdown">
                          <h5>Vote Breakdown:</h5>
                          <div class="votes-grid">
                            ${film.voteBreakdown.map(vote => `
                              <div class="vote-detail">
                                <span class="voter-name">${vote.voter}</span>
                                <span class="vote-info">${vote.points} pts (${vote.rank}${getOrdinalSuffix(vote.rank)} choice)</span>
                              </div>
                            `).join('')}
                          </div>
                        </div>
                      ` : `
                        <div class="vote-breakdown">
                          <p class="no-votes">No votes received</p>
                        </div>
                      `}
                    </div>
                  `).join('')}
                </div>
              </div>

              <div class="card">
                <h2>🗳️ Voting Summary</h2>
                <div class="voting-summary">
                  <div class="summary-stats">
                    <div class="summary-stat">
                      <strong>Participation Rate:</strong> 
                      <span class="highlight">${totalVoters} out of ${votes.length > 0 ? totalVoters : 'unknown'} members voted</span>
                    </div>
                    <div class="summary-stat">
                      <strong>Most Competitive:</strong> 
                      <span class="highlight">Top 3 films within ${filmResults.length >= 3 ? Math.abs(filmResults[0].totalScore - filmResults[2].totalScore) : 'N/A'} points</span>
                    </div>
                    <div class="summary-stat">
                      <strong>Consensus Level:</strong> 
                      <span class="highlight">${getConsensusLevel(filmResults)} consensus</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="actions center">
                <a href="/" class="btn btn-primary">Back to Calendar</a>
                <button class="btn btn-secondary" onclick="shareResults()">Share Results</button>
              </div>
            </div>

            <script>
            function shareResults() {
              const resultsText = \`🏆 Film Club Results - ${week.genre}\\n\\nWinner: ${week.winner_title} (${week.winner_year}) - ${week.winner_score} points\\nNominated by: ${week.winner_nominator}\\n\\nFull results: \${window.location.href}\`;
              
              if (navigator.share) {
                navigator.share({
                  title: 'Film Club Results',
                  text: resultsText
                });
              } else {
                navigator.clipboard.writeText(resultsText).then(() => {
                  alert('Results copied to clipboard!');
                }).catch(() => {
                  alert('Results text:\\n\\n' + resultsText);
                });
              }
            }
            </script>
          </body>
          </html>
        `);
      });
    });
  });
});

module.exports = router;
