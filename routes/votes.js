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
                  </head>
                  <body class="voting-page">
                    <div class="voting-hero">
                      <div class="container">
                        <p class="eyebrow">Week of ${new Date(weekDate).toLocaleDateString()}</p>
                        <h1>🗳️ Cast your rankings</h1>
                        <p class="lead">Drag films into your preferred order. Your #1 pick receives the most points.</p>
                        <div class="hero-meta">
                          <span class="badge">Genre · ${week.genre_name}</span>
                          <span class="badge badge-muted">${nominations.length} nominated films</span>
                          <span class="badge badge-success">${voters.length} members have voted</span>
                        </div>
                      </div>
                    </div>

                    <div class="container">
                      <div class="voting-layout">
                        <section class="card voting-card">
                          <div class="card-header">
                            <div>
                              <p class="eyebrow">Participation</p>
                              <h2>Club check-in</h2>
                            </div>
                            ${isAdmin ? `
                              <form action="/calculate-results/${weekDate}" method="POST">
                                <input type="hidden" name="user" value="${currentUser}">
                                <button type="submit" class="btn btn-primary">Calculate results</button>
                              </form>
                            ` : ''}
                          </div>
                          <div class="status-grid">
                            <div class="status-tile">
                              <p class="status-label">Voters so far</p>
                              <p class="status-value">${voters.length}</p>
                              <p class="status-subtext">${voters.length > 0 ? voters.map(v => v.name).join(', ') : 'Be the first to vote!'}</p>
                            </div>
                            <div class="status-tile">
                              <p class="status-label">Your status</p>
                              <p class="status-value">${hasVoted ? 'Submitted' : 'Pending'}</p>
                              <p class="status-subtext">${hasVoted ? 'Thanks for voting!' : 'Votes lock in when you submit below.'}</p>
                            </div>
                            <div class="status-tile">
                              <p class="status-label">How it works</p>
                              <ul class="mini-steps">
                                <li>Drag films to reorder.</li>
                                <li>Top spot earns the most points.</li>
                                <li>You can only submit once.</li>
                              </ul>
                            </div>
                          </div>
                        </section>

                        ${currentUser && !hasVoted ? `
                          <section class="card voting-card">
                            <div class="card-header">
                              <div>
                                <p class="eyebrow">Your ballot</p>
                                <h2>Rank the nominees</h2>
                                <p class="muted">Drag with the handle to reorder before submitting.</p>
                              </div>
                              <div class="pill">${nominations.length} picks</div>
                            </div>

                            <form action="/vote/${weekDate}" method="POST" id="voteForm">
                              <input type="hidden" name="user" value="${currentUser}">

                              <ul class="ranking-list" id="rankingList">
                                ${nominations.map((nom, index) => `
                                  <li class="ranking-item" draggable="true" data-id="${nom.id}">
                                    <div class="rank-number">${index + 1}</div>
                                    ${nom.poster_url ?
                                      `<img src="https://image.tmdb.org/t/p/w92${nom.poster_url}" class="film-poster">` :
                                      '<div class="poster-placeholder">No poster</div>'
                                    }
                                    <div class="vote-card-body">
                                      <div class="vote-card-title">${nom.title} ${nom.year ? `(${nom.year})` : ''}</div>
                                      <p class="vote-card-meta">Nominated by ${nom.nominator}</p>
                                      ${nom.overview ? `<p class="vote-card-overview">${nom.overview.substring(0, 120)}...</p>` : ''}
                                    </div>
                                    <div class="drag-handle" aria-label="Drag to reorder" title="Drag to reorder">↕</div>
                                  </li>
                                `).join('')}
                              </ul>

                              <input type="hidden" name="rankings" id="rankings">

                              <div class="form-footer">
                                <div>
                                  <p class="muted">Need to bail? You can still view the calendar without submitting.</p>
                                </div>
                                <div class="actions">
                                  <a href="/" class="btn btn-secondary">Back to calendar</a>
                                  <button type="submit" class="btn btn-primary">Submit vote</button>
                                </div>
                              </div>
                            </form>
                          </section>
                        ` : currentUser && hasVoted ? `
                          <section class="card voting-card">
                            <div class="card-header">
                              <h2>Thanks! Your vote is in.</h2>
                              <p class="muted">You can still review this week's nominations below.</p>
                            </div>
                          </section>
                        ` : `
                          <section class="card voting-card">
                            <div class="card-header">
                              <h2>Select yourself to vote</h2>
                              <p class="muted">Use the member selector at the top of the site to unlock the ballot.</p>
                            </div>
                          </section>
                        `}

                        <section class="card voting-card">
                          <div class="card-header">
                            <div>
                              <p class="eyebrow">Reference</p>
                              <h2>All nominations</h2>
                              <p class="muted">Preview posters and nominators at a glance.</p>
                            </div>
                          </div>
                          <div class="nomination-grid">
                            ${nominations.map(nom => `
                              <div class="nomination-card">
                                ${nom.poster_url ?
                                  `<img src="https://image.tmdb.org/t/p/w92${nom.poster_url}" class="nomination-poster">` :
                                  '<div class="poster-placeholder-small">No poster</div>'
                                }
                                <div class="nomination-body">
                                  <div class="nomination-title">${nom.title} ${nom.year ? `(${nom.year})` : ''}</div>
                                  <div class="nomination-meta">Nominated by ${nom.nominator}</div>
                                </div>
                              </div>
                            `).join('')}
                          </div>
                          <div class="actions center">
                            <a href="/" class="btn btn-secondary">Back to calendar</a>
                          </div>
                        </section>
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

                          // Touch support for iOS Safari
                          item.addEventListener('touchstart', function(e) {
                            draggedItem = this;
                            this.classList.add('dragging');
                          }, { passive: true });

                          item.addEventListener('touchmove', function(e) {
                            if (!draggedItem) return;
                            const touch = e.touches[0];
                            const afterElement = getDragAfterElement(list, touch.clientY);
                            if (afterElement == null) {
                              list.appendChild(draggedItem);
                            } else {
                              list.insertBefore(draggedItem, afterElement);
                            }
                            e.preventDefault();
                          }, { passive: false });

                          item.addEventListener('touchend', function() {
                            if (!draggedItem) return;
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
