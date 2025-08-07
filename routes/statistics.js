// routes/statistics.js
const express = require('express');
const router = express.Router();

// Helper function to calculate statistics
function calculateStatistics(db, callback) {
  const stats = {
    memberStats: [],
    genreStats: [],
    weeklyTrends: [],
    funAwards: {},
    lastUpdated: new Date().toISOString()
  };

  // Get all members
  db.all(`
    SELECT DISTINCT name 
    FROM members 
    WHERE is_active = 1 
    ORDER BY name
  `, (err, members) => {
    if (err) {
      console.error('Error getting members:', err);
      return callback(err, null);
    }

    if (members.length === 0) {
      return callback(null, stats);
    }

    let completed = 0;
    const totalQueries = members.length;

    // Calculate stats for each member
    members.forEach(member => {
      db.get(`
        SELECT 
          COUNT(DISTINCT n.week_id) as total_nominations,
          COUNT(DISTINCT CASE WHEN w.winner_film_id = n.id THEN n.week_id END) as wins,
          COUNT(DISTINCT v.week_id) as weeks_voted,
          (SELECT COUNT(DISTINCT id) FROM weeks WHERE phase = 'complete') as total_completed_weeks
        FROM members m
        LEFT JOIN nominations n ON m.name = n.user_name
        LEFT JOIN weeks w ON n.week_id = w.id
        LEFT JOIN votes v ON m.name = v.user_name
        WHERE m.name = ?
      `, [member.name], (err, memberData) => {
        if (err) {
          console.error('Error calculating member stats:', err);
        } else {
          // Calculate win rate and participation rate
          const winRate = memberData.total_nominations > 0 
            ? ((memberData.wins / memberData.total_nominations) * 100).toFixed(1) 
            : 0;
          const participationRate = memberData.total_completed_weeks > 0
            ? ((memberData.weeks_voted / memberData.total_completed_weeks) * 100).toFixed(1)
            : 0;

          stats.memberStats.push({
            name: member.name,
            wins: memberData.wins || 0,
            totalNominations: memberData.total_nominations || 0,
            winRate: parseFloat(winRate),
            weeksVoted: memberData.weeks_voted || 0,
            participationRate: parseFloat(participationRate)
          });
        }

        completed++;
        if (completed === totalQueries) {
          // Sort by wins descending
          stats.memberStats.sort((a, b) => b.wins - a.wins);

          // Continue with genre stats
          calculateGenreStats(db, stats, callback);
        }
      });
    });
  });
}

function calculateGenreStats(db, stats, callback) {
  db.all(`
    SELECT 
      w.genre,
      COUNT(DISTINCT w.id) as times_used,
      COUNT(DISTINCT n.id) as total_nominations,
      COUNT(DISTINCT v.id) as total_votes,
      AVG(w.winner_score) as avg_winning_score
    FROM weeks w
    LEFT JOIN nominations n ON w.id = n.week_id
    LEFT JOIN votes v ON w.id = v.week_id
    WHERE w.phase = 'complete' AND w.genre IS NOT NULL
    GROUP BY w.genre
    ORDER BY times_used DESC
    LIMIT 10
  `, (err, genreData) => {
    if (err) {
      console.error('Error calculating genre stats:', err);
    } else {
      stats.genreStats = genreData || [];
    }

    // Continue with weekly trends
    calculateWeeklyTrends(db, stats, callback);
  });
}

function calculateWeeklyTrends(db, stats, callback) {
  db.all(`
    SELECT 
      w.week_date,
      w.genre,
      w.winner_score,
      COUNT(DISTINCT v.id) as voter_count,
      COUNT(DISTINCT n.id) as nomination_count,
      (SELECT COUNT(*) FROM members WHERE is_active = 1) as total_members
    FROM weeks w
    LEFT JOIN votes v ON w.id = v.week_id
    LEFT JOIN nominations n ON w.id = n.week_id
    WHERE w.phase = 'complete'
    GROUP BY w.id
    ORDER BY w.week_date DESC
    LIMIT 12
  `, (err, trendData) => {
    if (err) {
      console.error('Error calculating trends:', err);
    } else {
      stats.weeklyTrends = trendData || [];
    }

    // Continue with fun awards
    calculateFunAwards(db, stats, callback);
  });
}

function calculateFunAwards(db, stats, callback) {
  // Golden Nominator - Most wins (already have from memberStats)
  if (stats.memberStats.length > 0) {
    stats.funAwards.goldenNominator = stats.memberStats[0].name;
  }

  // The Optimist - Always votes their own film first
  db.get(`
    SELECT 
      n.user_name,
      COUNT(*) as self_first_votes
    FROM votes v
    JOIN nominations n ON v.week_id = n.week_id AND v.user_name = n.user_name
    WHERE json_extract(v.votes_json, '$.' || n.id) = (
      SELECT COUNT(*) FROM nominations WHERE week_id = n.week_id
    )
    GROUP BY n.user_name
    ORDER BY self_first_votes DESC
    LIMIT 1
  `, (err, optimist) => {
    if (!err && optimist) {
      stats.funAwards.optimist = optimist.user_name;
    }

    // Most Consistent Voter - Highest participation rate
    if (stats.memberStats.length > 0) {
      const mostConsistent = stats.memberStats.reduce((prev, current) => 
        (prev.participationRate > current.participationRate) ? prev : current
      );
      stats.funAwards.mostConsistent = mostConsistent.name;
    }

    // Genre Champion - Most wins in a specific genre
    db.get(`
      SELECT 
        n.user_name,
        w.genre,
        COUNT(*) as genre_wins
      FROM nominations n
      JOIN weeks w ON n.week_id = w.id AND w.winner_film_id = n.id
      WHERE w.genre IS NOT NULL
      GROUP BY n.user_name, w.genre
      ORDER BY genre_wins DESC
      LIMIT 1
    `, (err, genreChamp) => {
      if (!err && genreChamp) {
        stats.funAwards.genreChampion = {
          name: genreChamp.user_name,
          genre: genreChamp.genre,
          wins: genreChamp.genre_wins
        };
      }

      // All done! Save to cache and return
      saveStatsToCache(db, stats, callback);
    });
  });
}

function saveStatsToCache(db, stats, callback) {
  const statsJson = JSON.stringify(stats);
  
  db.run(`
    INSERT OR REPLACE INTO statistics_cache (id, stats_json, calculated_at)
    VALUES (1, ?, datetime('now'))
  `, [statsJson], (err) => {
    if (err) {
      console.error('Error saving stats to cache:', err);
    }
    callback(null, stats);
  });
}

function getStatsFromCache(db, callback) {
  db.get(`
    SELECT stats_json, 
           datetime(calculated_at) as calculated_at,
           (strftime('%s', 'now') - strftime('%s', calculated_at)) as age_seconds
    FROM statistics_cache 
    WHERE id = 1
  `, (err, row) => {
    if (err || !row) {
      // No cache, calculate fresh
      calculateStatistics(db, callback);
    } else {
      // Check if cache is older than 24 hours (86400 seconds)
      if (row.age_seconds > 86400) {
        // Recalculate if stale
        calculateStatistics(db, callback);
      } else {
        // Use cached data
        try {
          const stats = JSON.parse(row.stats_json);
          stats.lastUpdated = row.calculated_at;
          callback(null, stats);
        } catch (e) {
          // If parsing fails, recalculate
          calculateStatistics(db, callback);
        }
      }
    }
  });
}

// Main statistics page route
router.get('/statistics', (req, res) => {
  // First ensure the cache table exists
  req.db.run(`
    CREATE TABLE IF NOT EXISTS statistics_cache (
      id INTEGER PRIMARY KEY,
      stats_json TEXT,
      calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Error creating cache table:', err);
    }

    // Get statistics (from cache or fresh)
    getStatsFromCache(req.db, (err, stats) => {
      if (err) {
        console.error('Error getting statistics:', err);
        return res.status(500).send('Error loading statistics');
      }

      // Prepare data for charts
      const memberNames = stats.memberStats.map(m => m.name);
      const memberWins = stats.memberStats.map(m => m.wins);
      const memberWinRates = stats.memberStats.map(m => m.winRate);
      const memberParticipation = stats.memberStats.map(m => m.participationRate);

      const genreNames = stats.genreStats.map(g => g.genre);
      const genreUsage = stats.genreStats.map(g => g.times_used);

      const trendDates = stats.weeklyTrends.map(w => new Date(w.week_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      const trendVoters = stats.weeklyTrends.map(w => w.voter_count);

      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Statistics - Film Club</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <link rel="stylesheet" href="/styles/main.css">
          <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
          <style>
            .stats-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: var(--space-6);
              flex-wrap: wrap;
              gap: var(--space-3);
            }
            
            .last-updated {
              color: var(--gray-600);
              font-size: 0.875rem;
            }
            
            .chart-container {
              position: relative;
              height: 300px;
              margin: var(--space-6) 0;
            }
            
            .chart-container.small {
              height: 200px;
            }
            
            .stats-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
              gap: var(--space-4);
              margin: var(--space-6) 0;
            }
            
            .stat-card {
              background: var(--gray-50);
              padding: var(--space-4);
              border-radius: var(--radius-lg);
              text-align: center;
              border: 1px solid var(--gray-200);
            }
            
            .stat-card .number {
              font-size: 2rem;
              font-weight: 700;
              color: var(--primary-color);
              display: block;
              margin-bottom: var(--space-2);
            }
            
            .stat-card .label {
              font-size: 0.875rem;
              color: var(--gray-600);
              font-weight: 500;
            }
            
            .award-card {
              background: var(--gold-gradient);
              padding: var(--space-6);
              border-radius: var(--radius-xl);
              text-align: center;
              margin: var(--space-4) 0;
              box-shadow: var(--shadow-lg);
              border: 2px solid #f59e0b;
            }
            
            .award-card .emoji {
              font-size: 3rem;
              display: block;
              margin-bottom: var(--space-3);
            }
            
            .award-card .winner {
              font-size: 1.5rem;
              font-weight: 700;
              color: #7c2d12;
              margin-bottom: var(--space-2);
            }
            
            .award-card .title {
              font-size: 1rem;
              color: #92400e;
              font-weight: 600;
            }
            
            .award-card .detail {
              font-size: 0.875rem;
              color: #78350f;
              margin-top: var(--space-2);
            }
            
            .member-table {
              overflow-x: auto;
              margin: var(--space-6) 0;
            }
            
            .member-table table {
              width: 100%;
              border-collapse: collapse;
            }
            
            .member-table th,
            .member-table td {
              padding: var(--space-3);
              text-align: left;
              border-bottom: 1px solid var(--gray-200);
            }
            
            .member-table th {
              background: var(--gray-50);
              font-weight: 600;
              color: var(--gray-700);
              font-size: 0.875rem;
            }
            
            .member-table tr:hover {
              background: var(--gray-50);
            }
            
            .rank-badge {
              display: inline-block;
              width: 1.5rem;
              height: 1.5rem;
              border-radius: var(--radius-full);
              background: var(--gray-600);
              color: white;
              text-align: center;
              line-height: 1.5rem;
              font-size: 0.75rem;
              font-weight: 600;
            }
            
            .rank-badge.gold {
              background: var(--gold-gradient);
              color: #7c2d12;
            }
            
            .rank-badge.silver {
              background: linear-gradient(135deg, #e5e7eb, #9ca3af);
              color: #374151;
            }
            
            .rank-badge.bronze {
              background: linear-gradient(135deg, #f59e0b, #d97706);
              color: white;
            }
            
            @media (max-width: 768px) {
              .chart-container {
                height: 250px;
              }
              
              .stats-grid {
                grid-template-columns: repeat(2, 1fr);
              }
              
              .member-table {
                font-size: 0.875rem;
              }
              
              .member-table th,
              .member-table td {
                padding: var(--space-2);
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📊 Film Club Statistics</h1>
              <p>Track performance, participation, and fun metrics across all members</p>
            </div>

            <div class="card">
              <div class="stats-header">
                <h2>📈 Dashboard</h2>
                <div>
                  <span class="last-updated">Last updated: ${new Date(stats.lastUpdated).toLocaleString()}</span>
                  <button onclick="refreshStats()" class="btn btn-primary btn-small" style="margin-left: var(--space-3);">
                    🔄 Refresh
                  </button>
                </div>
              </div>
              
              <!-- Quick Stats Overview -->
              <div class="stats-grid">
                <div class="stat-card">
                  <span class="number">${stats.weeklyTrends.length}</span>
                  <span class="label">Weeks Completed</span>
                </div>
                <div class="stat-card">
                  <span class="number">${stats.memberStats.length}</span>
                  <span class="label">Active Members</span>
                </div>
                <div class="stat-card">
                  <span class="number">${stats.memberStats.reduce((sum, m) => sum + m.totalNominations, 0)}</span>
                  <span class="label">Total Films</span>
                </div>
                <div class="stat-card">
                  <span class="number">${stats.genreStats.length}</span>
                  <span class="label">Genres Used</span>
                </div>
              </div>
            </div>

            <!-- Member Leaderboard -->
            <div class="card">
              <h2>🏆 Member Leaderboard</h2>
              
              <!-- Wins Chart -->
              <div class="chart-container">
                <canvas id="winsChart"></canvas>
              </div>
              
              <!-- Detailed Member Stats Table -->
              <div class="member-table">
                <table>
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Member</th>
                      <th>Wins</th>
                      <th>Nominations</th>
                      <th>Win Rate</th>
                      <th>Participation</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${stats.memberStats.map((member, index) => `
                      <tr>
                        <td>
                          <span class="rank-badge ${index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : ''}">
                            ${index + 1}
                          </span>
                        </td>
                        <td><strong>${member.name}</strong></td>
                        <td>${member.wins}</td>
                        <td>${member.totalNominations}</td>
                        <td>${member.winRate}%</td>
                        <td>${member.participationRate}%</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
              
              <!-- Win Rate Comparison -->
              <h3 style="margin-top: var(--space-8);">Win Rate Comparison</h3>
              <div class="chart-container small">
                <canvas id="winRateChart"></canvas>
              </div>
            </div>

            <!-- Club Trends -->
            <div class="card">
              <h2>📈 Club Trends</h2>
              
              <!-- Participation Over Time -->
              <h3>Weekly Participation</h3>
              <div class="chart-container">
                <canvas id="participationChart"></canvas>
              </div>
              
              <!-- Genre Popularity -->
              <h3>Most Popular Genres</h3>
              <div class="chart-container small">
                <canvas id="genreChart"></canvas>
              </div>
            </div>

            <!-- Fun Awards -->
            <div class="card">
              <h2>🎭 Fun Awards</h2>
              
              <div class="awards-grid">
                ${stats.funAwards.goldenNominator ? `
                  <div class="award-card">
                    <span class="emoji">🏆</span>
                    <div class="winner">${stats.funAwards.goldenNominator}</div>
                    <div class="title">Golden Nominator</div>
                    <div class="detail">Most winning nominations</div>
                  </div>
                ` : ''}
                
                ${stats.funAwards.mostConsistent ? `
                  <div class="award-card">
                    <span class="emoji">⭐</span>
                    <div class="winner">${stats.funAwards.mostConsistent}</div>
                    <div class="title">Most Consistent</div>
                    <div class="detail">Highest participation rate</div>
                  </div>
                ` : ''}
                
                ${stats.funAwards.optimist ? `
                  <div class="award-card">
                    <span class="emoji">😊</span>
                    <div class="winner">${stats.funAwards.optimist}</div>
                    <div class="title">The Optimist</div>
                    <div class="detail">Always backs their own films</div>
                  </div>
                ` : ''}
                
                ${stats.funAwards.genreChampion ? `
                  <div class="award-card">
                    <span class="emoji">🎬</span>
                    <div class="winner">${stats.funAwards.genreChampion.name}</div>
                    <div class="title">Genre Champion</div>
                    <div class="detail">${stats.funAwards.genreChampion.wins} wins in ${stats.funAwards.genreChampion.genre}</div>
                  </div>
                ` : ''}
              </div>
            </div>

            <div class="actions center">
              <a href="/" class="btn btn-primary">Back to Calendar</a>
            </div>
          </div>

          <script>
            // Chart configuration
            Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
            
            // Wins Bar Chart
            const winsCtx = document.getElementById('winsChart').getContext('2d');
            new Chart(winsCtx, {
              type: 'bar',
              data: {
                labels: ${JSON.stringify(memberNames)},
                datasets: [{
                  label: 'Wins',
                  data: ${JSON.stringify(memberWins)},
                  backgroundColor: 'rgba(37, 99, 235, 0.8)',
                  borderColor: 'rgba(37, 99, 235, 1)',
                  borderWidth: 2,
                  borderRadius: 8
                }]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    display: false
                  },
                  tooltip: {
                    callbacks: {
                      label: function(context) {
                        return context.parsed.y + ' wins';
                      }
                    }
                  }
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    ticks: {
                      stepSize: 1
                    }
                  }
                }
              }
            });
            
            // Win Rate Chart
            const winRateCtx = document.getElementById('winRateChart').getContext('2d');
            new Chart(winRateCtx, {
              type: 'bar',
              data: {
                labels: ${JSON.stringify(memberNames)},
                datasets: [{
                  label: 'Win Rate %',
                  data: ${JSON.stringify(memberWinRates)},
                  backgroundColor: 'rgba(34, 197, 94, 0.8)',
                  borderColor: 'rgba(34, 197, 94, 1)',
                  borderWidth: 2,
                  borderRadius: 8
                }]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                  legend: {
                    display: false
                  },
                  tooltip: {
                    callbacks: {
                      label: function(context) {
                        return context.parsed.x + '%';
                      }
                    }
                  }
                },
                scales: {
                  x: {
                    beginAtZero: true,
                    max: 100
                  }
                }
              }
            });
            
            // Participation Trend Chart
            const participationCtx = document.getElementById('participationChart').getContext('2d');
            new Chart(participationCtx, {
              type: 'line',
              data: {
                labels: ${JSON.stringify(trendDates.reverse())},
                datasets: [{
                  label: 'Voters',
                  data: ${JSON.stringify(trendVoters.reverse())},
                  borderColor: 'rgba(168, 85, 247, 1)',
                  backgroundColor: 'rgba(168, 85, 247, 0.1)',
                  borderWidth: 3,
                  fill: true,
                  tension: 0.4
                }]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    display: false
                  }
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    ticks: {
                      stepSize: 1
                    }
                  }
                }
              }
            });
            
            // Genre Popularity Chart
            const genreCtx = document.getElementById('genreChart').getContext('2d');
            new Chart(genreCtx, {
              type: 'doughnut',
              data: {
                labels: ${JSON.stringify(genreNames.slice(0, 5))},
                datasets: [{
                  data: ${JSON.stringify(genreUsage.slice(0, 5))},
                  backgroundColor: [
                    'rgba(37, 99, 235, 0.8)',
                    'rgba(34, 197, 94, 0.8)',
                    'rgba(251, 191, 36, 0.8)',
                    'rgba(239, 68, 68, 0.8)',
                    'rgba(168, 85, 247, 0.8)'
                  ],
                  borderWidth: 2,
                  borderColor: '#fff'
                }]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'right'
                  },
                  tooltip: {
                    callbacks: {
                      label: function(context) {
                        return context.label + ': ' + context.parsed + ' weeks';
                      }
                    }
                  }
                }
              }
            });
            
            function refreshStats() {
              const btn = event.target;
              btn.disabled = true;
              btn.innerHTML = '⏳ Calculating...';
              
              fetch('/statistics/refresh', { method: 'POST' })
                .then(response => response.json())
                .then(data => {
                  if (data.success) {
                    window.location.reload();
                  } else {
                    alert('Error refreshing statistics');
                    btn.disabled = false;
                    btn.innerHTML = '🔄 Refresh';
                  }
                })
                .catch(error => {
                  alert('Network error');
                  btn.disabled = false;
                  btn.innerHTML = '🔄 Refresh';
                });
            }
          </script>
        </body>
        </html>
      `);
    });
  });
});

// Route to force refresh statistics
router.post('/statistics/refresh', (req, res) => {
  // Ensure cache table exists
  req.db.run(`
    CREATE TABLE IF NOT EXISTS statistics_cache (
      id INTEGER PRIMARY KEY,
      stats_json TEXT,
      calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Error creating cache table:', err);
      return res.json({ success: false, error: 'Database error' });
    }

    // Force recalculate
    calculateStatistics(req.db, (err, stats) => {
      if (err) {
        console.error('Error calculating statistics:', err);
        return res.json({ success: false, error: 'Calculation error' });
      }
      
      res.json({ success: true, message: 'Statistics refreshed' });
    });
  });
});

module.exports = router;
