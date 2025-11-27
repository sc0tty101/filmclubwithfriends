// routes/votes.js - Updated with authentication
const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { validateDate } = require('../middleware/validation');

// Voting page
router.get('/vote/:date', requireAuth, validateDate, (req, res) => {
  const weekDate = req.params.date;
  const currentUser = req.user;

  // Get week info
  req.db.get(`
    SELECT w.*, g.name as genre_name 
    FROM weeks w
    LEFT JOIN genres g ON w.genre_id = g.id
    WHERE w.week_date = ? AND w.phase = 'voting'
  `, [weekDate], (err, week) => {
    if (err || !week) {
      return res.status(404).send('Week not found or not in voting phase');
    }

    // Get nominations
    req.db.all(`
      SELECT n.id, f.title, f.year, f.poster_url, f.overview, m.name as nominator
      FROM nominations n
      JOIN films f ON n.film_id = f.id
      JOIN members m ON n.member_id = m.id
      WHERE n.week_id = ?
      ORDER BY f.title
    `, [week.id], (err, nominations) => {
      if (err || nominations.length === 0) {
        return res.status(404).send('No nominations found');
      }

      // Check if user already voted
      req.db.get(
        `SELECT id FROM votes
         WHERE week_id = ?
         AND member_id = ?
         LIMIT 1`,
        [week.id, currentUser.id],
        (err, hasVoted) => {
          
          // Get all votes to show progress
          req.db.all(
            `SELECT DISTINCT m.name 
             FROM votes v
             JOIN members m ON v.member_id = m.id
             WHERE v.week_id = ?`,
            [week.id],
            (err, voters) => {
              if (err) voters = [];

              // User is already authenticated with admin status in session
              const isAdmin = currentUser.isAdmin;

                res.send(`
                  <!DOCTYPE html>
                  <html>
                  <head>
                    <title>Vote - Film Club</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <link rel="stylesheet" href="/styles/main.css">
                    <style>
                      .ranking-list {
                        list-style: none;
                        padding: 0;
                      }
                      .ranking-item {
                        background: white;
                        border: 1px solid #ddd;
                        border-radius: 8px;
                        padding: 15px;
                        margin-bottom: 10px;
                        cursor: move;
                        display: flex;
                        align-items: center;
                        gap: 15px;
                      }
                      .ranking-item.dragging {
                        opacity: 0.5;
                      }
                      .rank-number {
                        background: #2563eb;
                        color: white;
                        width: 30px;
                        height: 30px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-weight: bold;
                        flex-shrink: 0;
                      }
                      .vote-status {
                        background: #f0f0f0;
                        padding: 10px;
                        border-radius: 8px;
                        margin-bottom: 20px;
                      }
                    </style>
                  </head>
                  <body>
                    <div class="container">
                      <div class="header">
                        <h1>🗳️ Vote for Films</h1>
                        <p>Week of ${new Date(weekDate).toLocaleDateString()}</p>
                        <p><strong>Genre: ${week.genre_name}</strong></p>
                      </div>

                      <!-- Voting Status -->
                      <div class="card">
                        <div class="vote-status">
                          <strong>Voting Progress:</strong> ${voters.length} members have voted
                          ${voters.length > 0 ? `<br><small>${voters.map(v => v.name).join(', ')}</small>` : ''}
                        </div>
                        
                        ${isAdmin ? `
                          <div class="actions center" style="margin-top: 15px;">
                            <form action="/calculate-results/${weekDate}" method="POST">
                              <input type="hidden" name="user" value="${currentUser}">
                              <button type="submit" class="btn btn-primary">Calculate Results</button>
                            </form>
                          </div>
                        ` : ''}
                      </div>

                      ${currentUser && !hasVoted ? `
                        <!-- Voting Form -->
                        <div class="card">
                          <h2>Rank the Films</h2>
                          <p>Drag to reorder. Your top choice gets the most points!</p>
                          
                          <form action="/vote/${weekDate}" method="POST" id="voteForm">
                            <input type="hidden" name="user" value="${currentUser}">
                            
                            <ul class="ranking-list" id="rankingList">
                              ${nominations.map((nom, index) => `
                                <li class="ranking-item" draggable="true" data-id="${nom.id}">
                                  <span class="rank-number">${index + 1}</span>
                                  ${nom.poster_url ? 
                                    `<img src="https://image.tmdb.org/t/p/w92${nom.poster_url}" class="film-poster">` :
                                    '<div class="poster-placeholder">No poster</div>'
                                  }
                                  <div style="flex: 1;">
                                    <strong>${nom.title}</strong> ${nom.year ? `(${nom.year})` : ''}<br>
                                    <small>Nominated by ${nom.nominator}</small>
                                    ${nom.overview ? `<br><small>${nom.overview.substring(0, 100)}...</small>` : ''}
                                  </div>
                                </li>
                              `).join('')}
                            </ul>
                            
                            <input type="hidden" name="rankings" id="rankings">
                            
                            <div class="actions">
                              <button type="submit" class="btn btn-primary">Submit Vote</button>
                              <a href="/" class="btn btn-secondary">Cancel</a>
                            </div>
                          </form>
                        </div>
                      ` : currentUser && hasVoted ? `
                        <div class="card">
                          <p style="text-align: center; color: #999;">
                            ✅ You have already voted for this week
                          </p>
                        </div>
                      ` : `
                        <div class="card">
                          <p style="text-align: center; color: #999;">
                            Please select your name at the top of the page to vote
                          </p>
                        </div>
                      `}

                      <!-- Show all nominations for reference -->
                      <div class="card">
                        <h2>All Nominations</h2>
                        ${nominations.map(nom => `
                          <div class="film-card">
                            ${nom.poster_url ? 
                              `<img src="https://image.tmdb.org/t/p/w92${nom.poster_url}" class="film-poster">` :
                              '<div class="poster-placeholder">No poster</div>'
                            }
                            <div>
                              <strong>${nom.title}</strong> ${nom.year ? `(${nom.year})` : ''}<br>
                              <small>Nominated by ${nom.nominator}</small>
                            </div>
                            <div style="clear: both;"></div>
                          </div>
                        `).join('')}
                      </div>

                      <div class="actions center">
                        <a href="/" class="btn btn-secondary">Back to Calendar</a>
                      </div>
                    </div>

                    <script>
                      // Drag and drop functionality
                      let draggedItem = null;
                      const list = document.getElementById('rankingList');
                      
                      if (list) {
                        const items = list.querySelectorAll('.ranking-item');
                        
                        items.forEach(item => {
                          item.addEventListener('dragstart', function(e) {
                            draggedItem = this;
                            this.classList.add('dragging');
                          });
                          
                          item.addEventListener('dragend', function(e) {
                            this.classList.remove('dragging');
                            draggedItem = null;
                            updateRankNumbers();
                          });
                          
                          item.addEventListener('dragover', function(e) {
                            e.preventDefault();
                            const afterElement = getDragAfterElement(list, e.clientY);
                            if (afterElement == null) {
                              list.appendChild(draggedItem);
                            } else {
                              list.insertBefore(draggedItem, afterElement);
                            }
                          });
                        });
                      }
                      
                      function getDragAfterElement(container, y) {
                        const draggableElements = [...container.querySelectorAll('.ranking-item:not(.dragging)')];
                        
                        return draggableElements.reduce((closest, child) => {
                          const box = child.getBoundingClientRect();
                          const offset = y - box.top - box.height / 2;
                          
                          if (offset < 0 && offset > closest.offset) {
                            return { offset: offset, element: child };
                          } else {
                            return closest;
                          }
                        }, { offset: Number.NEGATIVE_INFINITY }).element;
                      }
                      
                      function updateRankNumbers() {
                        const items = document.querySelectorAll('.ranking-item');
                        items.forEach((item, index) => {
                          item.querySelector('.rank-number').textContent = index + 1;
                        });
                      }
                      
                      // Form submission
                      const form = document.getElementById('voteForm');
                      if (form) {
                        form.addEventListener('submit', function(e) {
                          e.preventDefault();
                          const items = document.querySelectorAll('.ranking-item');
                          const rankings = Array.from(items).map((item, index) => ({
                            nominationId: item.dataset.id,
                            rank: index + 1
                          }));
                          
                          document.getElementById('rankings').value = JSON.stringify(rankings);
                          this.submit();
                        });
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
});

// Handle vote submission
router.post('/vote/:date', requireAuth, validateDate, (req, res) => {
  const weekDate = req.params.date;
  const currentUser = req.user;
  const { rankings } = req.body;

  if (!rankings) {
    return res.status(400).send('Rankings required');
  }

  let parsedRankings;
  try {
    parsedRankings = JSON.parse(rankings);
  } catch (e) {
    return res.status(400).send('Invalid rankings data');
  }

  // Get week
  req.db.get("SELECT id FROM weeks WHERE week_date = ?", [weekDate], (err, week) => {
    if (err || !week) {
      return res.status(404).send('Week not found');
    }

    // Submit votes using helper function
    const dbHelpers = require('../database/setup');
    dbHelpers.submitVotes(week.id, currentUser.id, parsedRankings, (err) => {
      if (err) {
        console.error('Vote submission error:', err);
        return res.status(500).send('Failed to submit vote');
      }
      res.redirect(`/vote/${weekDate}`);
    });
  });
});

// Calculate results route (admin only)
const calculateResultsHandler = (req, res) => {
  const weekDate = req.params.date;

  req.db.get("SELECT id FROM weeks WHERE week_date = ?", [weekDate], (err, week) => {
    if (err || !week) {
      return res.status(404).send('Week not found');
    }

    const dbHelpers = require('../database/setup');
    dbHelpers.calculateResults(week.id, (err, winner) => {
      if (err) {
        console.error('Calculate results error:', err);
        return res.status(500).send('Failed to calculate results');
      }
      res.redirect(`/results/${weekDate}`);
    });
  });
};

router.post('/calculate-results/:date', requireAdmin, validateDate, calculateResultsHandler);
router.get('/calculate-results/:date', requireAdmin, validateDate, calculateResultsHandler);

module.exports = router;
