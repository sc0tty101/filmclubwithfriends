const express = require('express');
const router = express.Router();

// ENHANCED VOTING PAGE - Replace the GET /vote/:date route in routes/votes.js
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

        // Get all votes to show progress
        req.db.all(
          "SELECT user_name FROM votes WHERE week_id = ?",
          [week.id],
          (err, allVotes) => {
            if (err) {
              console.error(err);
              return res.status(500).send('Database error');
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
                const totalVoters = allVotes.length;
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
                    <link rel="stylesheet" href="/styles/main.css">
                  </head>
                  <body>
                    <div class="container">
                      <div class="header">
                        <h1>🗳️ Vote for Films</h1>
                        <p><strong>Week:</strong> ${new Date(weekDate).toLocaleDateString()}</p>
                        <p><strong>Genre:</strong> ${week.genre}</p>
                        <p><strong>Current User:</strong> ${currentUser}</p>
                        
                        <!-- Progress Indicator -->
                        <div class="progress-indicator large">
                          <div class="progress-step completed">
                            <span class="step-icon">🎭</span>
                            <span class="step-label">Genre Set</span>
                          </div>
                          <div class="progress-step completed">
                            <span class="step-icon">🎬</span>
                            <span class="step-label">Nominations</span>
                          </div>
                          <div class="progress-step active">
                            <span class="step-icon">🗳️</span>
                            <span class="step-label">Voting</span>
                          </div>
                          <div class="progress-step">
                            <span class="step-icon">🏆</span>
                            <span class="step-label">Results</span>
                          </div>
                        </div>
                        
                        <!-- Voting Progress -->
                        <div class="voting-progress">
                          <div class="vote-count">
                            <span class="count-badge">${totalVoters}</span>
                            <span class="progress-text">vote${totalVoters !== 1 ? 's' : ''} submitted</span>
                          </div>
                        </div>
                      </div>

                      <div class="card">
                        <div class="section-header">
                          <h2>Nominated Films (${nominations.length})</h2>
                          ${canVote ? `
                            <div class="voting-instructions">
                              <strong>Instructions:</strong> Drag films to rank them from best (top) to worst (bottom). 
                              Top film gets ${nominations.length} points, second gets ${nominations.length - 1} points, etc.
                            </div>
                          ` : ''}
                        </div>
                        
                        ${canVote ? `
                          <div id="errorMessage" class="alert alert-error" style="display: none;"></div>
                          
                          <div id="votingArea">
                            <div id="filmList" class="film-ranking-list">
                              ${nominations.map((nom, index) => `
                                <div class="ranking-item" data-film-id="${nom.id}" data-points="${nominations.length - index}">
                                  <div class="drag-handle">⋮⋮</div>
                                  <div class="rank-number">${index + 1}</div>
                                  <div class="film-info">
                                    ${nom.poster_url ? `<img src="https://image.tmdb.org/t/p/w92${nom.poster_url}" alt="${nom.film_title}" class="film-poster">` : '<div class="poster-placeholder">No Image</div>'}
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
                            
                            <div class="voting-help">
                              <p>💡 <strong>Tip:</strong> Drag the films to reorder them. Your top choice will get the most points!</p>
                            </div>
                          </div>
                        ` : `
                          <div class="voting-results">
                            ${existingVote ? `
                              <div class="alert alert-success">
                                <h3>✅ Your Vote (submitted ${new Date(existingVote.voted_at).toLocaleDateString()}):</h3>
                                <div class="vote-summary">
                                  ${Object.entries(userVotes).sort((a, b) => b[1] - a[1]).map(([filmId, points]) => {
                                    const film = nominations.find(n => n.id == filmId);
                                    const rank = nominations.length - points + 1;
                                    return film ? `
                                      <div class="vote-item">
                                        <div class="vote-rank">${rank}${rank === 1 ? 'st' : rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th'}</div>
                                        <div class="vote-film">
                                          ${film.poster_url ? `<img src="https://image.tmdb.org/t/p/w92${film.poster_url}" alt="${film.film_title}" class="vote-poster">` : ''}
                                          <div class="vote-details">
                                            <strong>${film.film_title} (${film.film_year})</strong>
                                            <span class="vote-points">${points} points</span>
                                          </div>
                                        </div>
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
                            
                            <!-- Show all nominations for non-voters -->
                            <div class="all-nominations">
                              <h3>All Nominated Films:</h3>
                              ${nominations.map(nom => `
                                <div class="nomination-display">
                                  ${nom.poster_url ? `<img src="https://image.tmdb.org/t/p/w92${nom.poster_url}" alt="${nom.film_title}" class="film-poster">` : '<div class="poster-placeholder">No Image</div>'}
                                  <div class="film-details">
                                    <h4>${nom.film_title} (${nom.film_year})</h4>
                                    <p>Nominated by: ${nom.user_name}</p>
                                  </div>
                                </div>
                              `).join('')}
                            </div>
                          </div>
                        `}
                      </div>

                      <div class="card">
                        <div class="progress-actions">
                          <a href="/" class="btn btn-secondary">Back to Calendar</a>
                          
                          ${canVote ? `
                            <button class="btn btn-primary btn-large" onclick="submitVote()">
                              🗳️ Submit My Vote
                            </button>
                          ` : `
                            <button class="btn btn-success btn-large" onclick="moveToComplete()">
                              🏆 Calculate Results (${totalVoters} votes)
                            </button>
                          `}
                        </div>
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
                      this.classList.add('dragging');
                    }
                    
                    function handleDragOver(e) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
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
                      this.classList.remove('dragging');
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
                        
                        // Add visual feedback for top choices
                        item.classList.remove('rank-1', 'rank-2', 'rank-3');
                        if (index < 3) {
                          item.classList.add(\`rank-\${index + 1}\`);
                        }
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
                      
                      // Show loading state
                      const submitBtn = event.target;
                      const originalText = submitBtn.textContent;
                      submitBtn.textContent = 'Submitting...';
                      submitBtn.disabled = true;
                      
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
                          submitBtn.textContent = originalText;
                          submitBtn.disabled = false;
                        }
                      })
                      .catch(error => {
                        showError('Network error. Please try again.');
                        submitBtn.textContent = originalText;
                        submitBtn.disabled = false;
                      });
                    }
                    
                    function showError(message) {
                      const errorDiv = document.getElementById('errorMessage');
                      if (errorDiv) {
                        errorDiv.textContent = message;
                        errorDiv.style.display = 'block';
                        errorDiv.scrollIntoView({ behavior: 'smooth' });
                      }
                    }
                    
                    function moveToComplete() {
                      if (confirm('Calculate final results? This will end the voting phase.')) {
                        console.log('About to calculate results for:', '${weekDate}'); // Debug log
                        
                        fetch('/calculate-results/${weekDate}', { method: 'POST' })
                          .then(response => {
                            console.log('Response status:', response.status); // Debug log
                            return response.json();
                          })
                          .then(data => {
                            console.log('Response data:', data); // Debug log
                            
                            if (data.success) {
                              alert('Results calculated! Winner: ' + data.winner);
                              window.location.href = '/';
                            } else {
                              // Show the actual error message instead of generic "Error calculating results"
                              alert('Error calculating results: ' + (data.error || 'Unknown error'));
                              console.error('Server error:', data);
                            }
                          })
                          .catch(error => {
                            console.error('Network error:', error);
                            alert('Network error calculating results: ' + error.message);
                          });
                      }
                    }
                    
                    // Initialize dragging when page loads
                    window.onload = function() {
                      const canVote = ${canVote};
                      if (canVote) {
                        initializeDragging();
                      }
                    }
                    </script>
                  </body>
                  </html>
                `);
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

// NOTE: /calculate-results route has been moved to routes/results.js to avoid duplicate routes

module.exports = router;
