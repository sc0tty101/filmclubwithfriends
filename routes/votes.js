const express = require('express');
const router = express.Router();

// VOTING PAGE
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
    
    // Get nominations for this week
    req.db.all(
      "SELECT * FROM nominations WHERE week_id = ? ORDER BY film_title",
      [week.id],
      (err, nominations) => {
        if (err) {
          console.error(err);
          return res.status(500).send('Database error');
        }

        if (nominations.length === 0) {
          return res.send('No nominations found for this week.');
        }

        // Check if user already voted
        req.db.get(
          "SELECT * FROM votes WHERE week_id = ? AND user_name = ?",
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

            res.send(`
              <!DOCTYPE html>
              <html>
              <head>
                <title>Vote - Film Club</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <link rel="stylesheet" href="/styles.css">
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <h1>🗳️ Vote for Films</h1>
                    <p><strong>Week:</strong> ${new Date(weekDate).toLocaleDateString()}</p>
                    <p><strong>Genre:</strong> ${week.genre}</p>
                    <p><strong>Current User:</strong> ${currentUser}</p>
                  </div>

                  <div class="card">
                    <h2>Nominated Films (${nominations.length})</h2>
                    <p><strong>Instructions:</strong> Drag films to rank them from best (top) to worst (bottom). 
                    Top film gets ${nominations.length} points, second gets ${nominations.length - 1} points, etc.</p>
                    
                    ${canVote ? `
                      <div id="errorMessage" class="alert alert-error" style="display: none;"></div>
                      
                      <div id="votingArea">
                        <div class="voting-instructions">
                          <p>Drag and drop to rank the films (best at top):</p>
                        </div>
                        
                        <div id="filmList" class="film-ranking-list">
                          ${nominations.map((nom, index) => `
                            <div class="ranking-item" data-film-id="${nom.id}" data-points="${nominations.length - index}">
                              <div class="rank-number">${index + 1}</div>
                              <div class="film-info">
                                ${nom.poster_url ? `<img src="https://image.tmdb.org/t/p/w92${nom.poster_url}" alt="${nom.film_title}" class="film-poster">` : ''}
                                <div class="film-details">
                                  <h4>${nom.film_title} (${nom.film_year})</h4>
                                  <p>Nominated by: ${nom.user_name}</p>
                                </div>
                              </div>
                              <div class="points-display">
                                <span class="points">${nominations.length - index} pts</span>
                              </div>
                            </div>
                          `).join('')}
                        </div>
                        
                        <div class="actions center">
                          <button class="btn btn-primary" onclick="submitVote()">Submit My Vote</button>
                          <a href="/" class="btn btn-secondary">Back to Calendar</a>
                        </div>
                      </div>
                    ` : `
                      <div class="voting-results">
                        ${existingVote ? `
                          <div class="alert alert-success">
                            <h3>Your Vote (submitted ${new Date(existingVote.voted_at).toLocaleDateString()}):</h3>
                            <div class="vote-summary">
                              ${Object.entries(userVotes).sort((a, b) => b[1] - a[1]).map(([filmId, points]) => {
                                const film = nominations.find(n => n.id == filmId);
                                return film ? `
                                  <div class="vote-item">
                                    <span>${points} pts - ${film.film_title} (${film.film_year})</span>
                                  </div>
                                ` : '';
                              }).join('')}
                            </div>
                          </div>
                        ` : `
                          <div class="alert alert-error">
                            ${currentUser === 'Unknown' ? 'Please select your name on the main page first.' : 'You have already voted for this week.'}
                          </div>
                        `}
                        
                        <div class="actions center">
                          <a href="/" class="btn btn-secondary">Back to Calendar</a>
                          <button class="btn btn-success" onclick="moveToComplete()">Calculate Results</button>
                        </div>
                      </div>
                    `}
                  </div>
                </div>

                <script>
                let draggedElement = null;
                
                // Make items draggable
                function initializeDragging() {
                  const items = document.querySelectorAll('.ranking-item');
                  items.forEach(item => {
                    item.draggable = true;
                    item.addEventListener('dragstart', handleDragStart);
                    item.addEventListener('dragover', handleDragOver);
                    item.addEventListener('drop', handleDrop);
                    item.addEventListener('dragend', handleDragEnd);
                  });
                }
                
                function handleDragStart(e) {
                  draggedElement = this;
                  this.style.opacity = '0.5';
                }
                
                function handleDragOver(e) {
                  e.preventDefault();
                }
                
                function handleDrop(e) {
                  e.preventDefault();
                  if (this !== draggedElement) {
                    const filmList = document.getElementById('filmList');
                    const children = Array.from(filmList.children);
                    const draggedIndex = children.indexOf(draggedElement);
                    const targetIndex = children.indexOf(this);
                    
                    if (draggedIndex < targetIndex) {
                      filmList.insertBefore(draggedElement, this.nextSibling);
                    } else {
                      filmList.insertBefore(draggedElement, this);
                    }
                    
                    updateRankings();
                  }
                }
                
                function handleDragEnd(e) {
                  this.style.opacity = '';
                  draggedElement = null;
                }
                
                function updateRankings() {
                  const items = document.querySelectorAll('.ranking-item');
                  const totalFilms = items.length;
                  
                  items.forEach((item, index) => {
                    const rankNumber = item.querySelector('.rank-number');
                    const pointsDisplay = item.querySelector('.points');
                    const points = totalFilms - index;
                    
                    rankNumber.textContent = index + 1;
                    pointsDisplay.textContent = points + ' pts';
                    item.dataset.points = points;
                  });
                }
                
                function submitVote() {
                  const items = document.querySelectorAll('.ranking-item');
                  const votes = {};
                  
                  items.forEach(item => {
                    const filmId = item.dataset.filmId;
                    const points = parseInt(item.dataset.points);
                    votes[filmId] = points;
                  });
                  
                  fetch('/vote/${weekDate}', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      userName: '${currentUser}',
                      votes: votes
                    })
                  })
                  .then(response => response.json())
                  .then(data => {
                    if (data.success) {
                      window.location.reload();
                    } else {
                      showError(data.error || 'Failed to submit vote');
                    }
                  })
                  .catch(error => {
                    showError('Network error. Please try again.');
                  });
                }
                
                function showError(message) {
                  const errorDiv = document.getElementById('errorMessage');
                  if (errorDiv) {
                    errorDiv.textContent = message;
                    errorDiv.style.display = 'block';
                  }
                }
                
                function moveToComplete() {
                  if (confirm('Calculate final results? This will end the voting phase.')) {
                    fetch('/calculate-results/${weekDate}', { method: 'POST' })
                      .then(response => response.json())
                      .then(data => {
                        if (data.success) {
                          alert('Results calculated! Winner: ' + data.winner);
                          window.location.href = '/';
                        } else {
                          alert('Error calculating results');
                        }
                      })
                      .catch(error => alert('Error calculating results'));
                  }
                }
                
                // Initialize dragging when page loads
                window.onload = function() {
                  initializeDragging();
                }
                </script>
              </body>
              </html>
            `);
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
  
  // Get week ID
  req.db.get("SELECT id FROM weeks WHERE week_date = ?", [weekDate], (err, week) => {
    if (err || !week) {
      console.error(err);
      return res.json({ success: false, error: 'Week not found' });
    }
    
    // Check if user already voted
    req.db.get(
      "SELECT id FROM votes WHERE week_id = ? AND user_name = ?",
      [week.id, userName],
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
          "INSERT INTO votes (week_id, user_name, votes_json) VALUES (?, ?, ?)",
          [week.id, userName, JSON.stringify(votes)],
          function(err) {
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

// CALCULATE RESULTS
router.post('/calculate-results/:date', (req, res) => {
  const weekDate = req.params.date;
  
  // Get week info
  req.db.get("SELECT * FROM weeks WHERE week_date = ?", [weekDate], (err, week) => {
    if (err || !week) {
      return res.json({ success: false, error: 'Week not found' });
    }
    
    // Get all votes for this week
    req.db.all(
      "SELECT votes_json FROM votes WHERE week_id = ?",
      [week.id],
      (err, votes) => {
        if (err) {
          console.error(err);
          return res.json({ success: false, error: 'Database error' });
        }
        
        // Calculate total points for each film
        const filmScores = {};
        
        votes.forEach(vote => {
          try {
            const voteData = JSON.parse(vote.votes_json);
            Object.entries(voteData).forEach(([filmId, points]) => {
              filmScores[filmId] = (filmScores[filmId] || 0) + points;
            });
          } catch (e) {
            console.error('Error parsing vote:', e);
          }
        });
        
        // Find winner
        let winnerId = null;
        let highestScore = 0;
        
        Object.entries(filmScores).forEach(([filmId, score]) => {
          if (score > highestScore) {
            highestScore = score;
            winnerId = filmId;
          }
        });
        
        if (!winnerId) {
          return res.json({ success: false, error: 'No votes found' });
        }
        
        // Get winner film details
        req.db.get(
          "SELECT film_title, film_year FROM nominations WHERE id = ?",
          [winnerId],
          (err, winnerFilm) => {
            if (err || !winnerFilm) {
              return res.json({ success: false, error: 'Winner film not found' });
            }
            
            // Update week to complete and store winner
            req.db.run(
              "UPDATE weeks SET phase = 'complete', winner_film_id = ?, winner_score = ? WHERE id = ?",
              [winnerId, highestScore, week.id],
              function(err) {
                if (err) {
                  console.error(err);
                  return res.json({ success: false, error: 'Failed to save results' });
                }
                
                res.json({ 
                  success: true, 
                  winner: `${winnerFilm.film_title} (${winnerFilm.film_year})`,
                  score: highestScore
                });
              }
            );
          }
        );
      }
    );
  });
});

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

module.exports = router;
