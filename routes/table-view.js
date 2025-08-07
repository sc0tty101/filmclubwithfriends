// routes/table-view.js
const express = require('express');
const router = express.Router();

// Table view page
router.get('/admin/table-view', (req, res) => {
  // Get all weeks first
  req.db.all(`
    SELECT 
      w.*,
      n.film_title as winner_title,
      n.film_year as winner_year,
      n.user_name as winner_nominator
    FROM weeks w
    LEFT JOIN nominations n ON w.winner_film_id = n.id
    ORDER BY w.week_date DESC
  `, (err, weeks) => {
    if (err) {
      console.error('Error fetching weeks:', err);
      return res.status(500).send('Database error: ' + err.message);
    }
    
    // Get counts for each week separately
    req.db.all(`
      SELECT 
        w.id as week_id,
        COUNT(DISTINCT n.id) as nomination_count,
        COUNT(DISTINCT v.id) as vote_count
      FROM weeks w
      LEFT JOIN nominations n ON w.id = n.week_id
      LEFT JOIN votes v ON w.id = v.week_id
      GROUP BY w.id
    `, (err, counts) => {
      if (err) {
        console.error('Error fetching counts:', err);
        counts = [];
      }
      
      // Get nominators for each week
      req.db.all(`
        SELECT 
          week_id,
          GROUP_CONCAT(DISTINCT user_name) as nominators
        FROM nominations
        GROUP BY week_id
      `, (err, nominatorData) => {
        if (err) {
          console.error('Error fetching nominators:', err);
          nominatorData = [];
        }
        
        // Create lookup objects
        const countsLookup = {};
        counts.forEach(c => {
          countsLookup[c.week_id] = {
            nomination_count: c.nomination_count,
            vote_count: c.vote_count
          };
        });
        
        const nominatorsLookup = {};
        nominatorData.forEach(n => {
          nominatorsLookup[n.week_id] = n.nominators;
        });
    
        // Get all members for the filter dropdown
        req.db.all("SELECT DISTINCT name FROM members WHERE is_active = 1 ORDER BY name", (err, members) => {
          if (err) {
            console.error('Error fetching members:', err);
            members = [];
          }
          
          // Process and merge weeks data
          weeks = weeks.map(week => {
            const weekDate = new Date(week.week_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            weekDate.setHours(0, 0, 0, 0);
            
            // Determine if past, current, or future
            const daysDiff = Math.floor((weekDate - today) / (1000 * 60 * 60 * 24));
            let weekStatus = 'future';
            if (daysDiff < -7) weekStatus = 'past';
            else if (daysDiff >= -7 && daysDiff < 0) weekStatus = 'recent';
            else if (daysDiff >= 0 && daysDiff < 7) weekStatus = 'current';
            else if (daysDiff >= 7 && daysDiff < 28) weekStatus = 'upcoming';
            
            const weekCounts = countsLookup[week.id] || { nomination_count: 0, vote_count: 0 };
            const nominators = nominatorsLookup[week.id] || '';
            
            return {
              ...week,
              ...weekCounts,
              nominators,
              weekStatus,
              displayDate: weekDate.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
              }),
              nominatorsList: nominators ? nominators.split(',') : []
            };
          });
          
          // Now send the HTML response
          res.send(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Table View - Film Club</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <link rel="stylesheet" href="/styles/main.css">
              <style>
                .table-container {
                  overflow-x: auto;
                  margin: var(--space-4) 0;
                  border: 1px solid var(--gray-200);
                  border-radius: var(--radius-lg);
                  background: var(--white);
                }
                
                .data-table {
                  width: 100%;
                  border-collapse: collapse;
                  font-size: 0.875rem;
                }
                
                .data-table th {
                  background: var(--gray-100);
                  padding: var(--space-3);
                  text-align: left;
                  font-weight: 600;
                  color: var(--gray-700);
                  border-bottom: 2px solid var(--gray-200);
                  position: sticky;
                  top: 0;
                  z-index: 10;
                  white-space: nowrap;
                }
                
                .data-table td {
                  padding: var(--space-3);
                  border-bottom: 1px solid var(--gray-100);
                  vertical-align: top;
                }
                
                .data-table tbody tr {
                  transition: background-color 0.2s ease;
                }
                
                .data-table tbody tr:hover {
                  background: var(--gray-50);
                }
                
                /* Row status colors */
                .row-current {
                  background: #fef3c7 !important;
                }
                
                .row-recent {
                  background: #dcfce7 !important;
                }
                
                .row-upcoming {
                  background: #dbeafe !important;
                }
                
                .row-complete {
                  opacity: 0.8;
                }
                
                /* Phase badges */
                .phase-badge {
                  padding: 2px 8px;
                  border-radius: var(--radius-full);
                  font-size: 0.75rem;
                  font-weight: 600;
                  text-transform: uppercase;
                  display: inline-block;
                }
                
                .phase-planning { background: #e0e7ff; color: #3730a3; }
                .phase-genre { background: #fed7aa; color: #c2410c; }
                .phase-nomination { background: #bbf7d0; color: #166534; }
                .phase-voting { background: #fce7f3; color: #be185d; }
                .phase-complete { background: #e9d5ff; color: #7c3aed; }
                
                /* Winner cell */
                .winner-cell {
                  font-weight: 600;
                  color: var(--gray-900);
                }
                
                .winner-badge {
                  color: #f59e0b;
                  margin-right: var(--space-1);
                }
                
                /* Stats badges */
                .stat-badge {
                  display: inline-block;
                  padding: 2px 6px;
                  background: var(--gray-100);
                  border-radius: var(--radius-sm);
                  font-size: 0.75rem;
                  margin: 0 2px;
                }
                
                .stat-badge.nominations {
                  background: #dcfce7;
                  color: #166534;
                }
                
                .stat-badge.votes {
                  background: #dbeafe;
                  color: #1e40af;
                }
                
                /* Controls */
                .controls {
                  display: flex;
                  gap: var(--space-3);
                  margin-bottom: var(--space-4);
                  flex-wrap: wrap;
                  align-items: center;
                }
                
                .filter-group {
                  display: flex;
                  align-items: center;
                  gap: var(--space-2);
                }
                
                .filter-group label {
                  font-size: 0.875rem;
                  font-weight: 500;
                  color: var(--gray-600);
                }
                
                .filter-group select,
                .filter-group input {
                  padding: var(--space-2);
                  border: 1px solid var(--gray-300);
                  border-radius: var(--radius-md);
                  font-size: 0.875rem;
                }
                
                /* Summary stats */
                .summary-stats {
                  display: grid;
                  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                  gap: var(--space-3);
                  margin-bottom: var(--space-4);
                }
                
                .summary-stat {
                  background: var(--white);
                  padding: var(--space-3);
                  border-radius: var(--radius-md);
                  border: 1px solid var(--gray-200);
                  text-align: center;
                }
                
                .summary-stat .number {
                  font-size: 1.5rem;
                  font-weight: 700;
                  color: var(--primary-color);
                  display: block;
                }
                
                .summary-stat .label {
                  font-size: 0.75rem;
                  color: var(--gray-600);
                  text-transform: uppercase;
                }
                
                /* Nominators list */
                .nominators-list {
                  display: flex;
                  flex-wrap: wrap;
                  gap: 4px;
                  font-size: 0.75rem;
                }
                
                .nominator-badge {
                  padding: 2px 6px;
                  background: var(--gray-100);
                  border-radius: var(--radius-sm);
                  white-space: nowrap;
                }
                
                /* Legend */
                .legend {
                  display: flex;
                  gap: var(--space-4);
                  margin-bottom: var(--space-3);
                  font-size: 0.75rem;
                  color: var(--gray-600);
                  flex-wrap: wrap;
                }
                
                .legend-item {
                  display: flex;
                  align-items: center;
                  gap: var(--space-1);
                }
                
                .legend-color {
                  width: 16px;
                  height: 16px;
                  border-radius: var(--radius-sm);
                  border: 1px solid var(--gray-300);
                }
                
                /* Export button */
                .export-btn {
                  margin-left: auto;
                }
                
                /* No data message */
                .no-data {
                  text-align: center;
                  padding: var(--space-8);
                  color: var(--gray-500);
                }
                
                /* Make date column sticky */
                .data-table td:first-child,
                .data-table th:first-child {
                  position: sticky;
                  left: 0;
                  background: var(--white);
                  z-index: 5;
                }
                
                .data-table th:first-child {
                  background: var(--gray-100);
                  z-index: 11;
                }
                
                .data-table tbody tr:hover td:first-child {
                  background: var(--gray-50);
                }
                
                /* Responsive */
                @media (max-width: 768px) {
                  .data-table {
                    font-size: 0.75rem;
                  }
                  
                  .data-table th,
                  .data-table td {
                    padding: var(--space-2);
                  }
                  
                  .controls {
                    flex-direction: column;
                    align-items: stretch;
                  }
                  
                  .filter-group {
                    width: 100%;
                  }
                  
                  .filter-group select,
                  .filter-group input {
                    flex: 1;
                  }
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>📊 Table View</h1>
                  <p>All weeks in a condensed table format</p>
                </div>
                
                <!-- Legend -->
                <div class="legend">
                  <div class="legend-item">
                    <div class="legend-color" style="background: #fef3c7;"></div>
                    <span>Current Week</span>
                  </div>
                  <div class="legend-item">
                    <div class="legend-color" style="background: #dcfce7;"></div>
                    <span>Recent (Last 7 days)</span>
                  </div>
                  <div class="legend-item">
                    <div class="legend-color" style="background: #dbeafe;"></div>
                    <span>Upcoming (Next 4 weeks)</span>
                  </div>
                </div>
                
                <!-- Summary Stats -->
                <div class="summary-stats">
                  <div class="summary-stat">
                    <span class="number">${weeks.length}</span>
                    <span class="label">Total Weeks</span>
                  </div>
                  <div class="summary-stat">
                    <span class="number">${weeks.filter(w => w.phase === 'complete').length}</span>
                    <span class="label">Completed</span>
                  </div>
                  <div class="summary-stat">
                    <span class="number">${weeks.filter(w => w.phase === 'voting').length}</span>
                    <span class="label">Voting</span>
                  </div>
                  <div class="summary-stat">
                    <span class="number">${weeks.filter(w => w.phase === 'nomination').length}</span>
                    <span class="label">Nominating</span>
                  </div>
                  <div class="summary-stat">
                    <span class="number">${weeks.filter(w => w.genre).length}</span>
                    <span class="label">Genres Set</span>
                  </div>
                </div>

                <!-- Controls -->
                <div class="controls">
                  <div class="filter-group">
                    <label>Phase:</label>
                    <select id="phaseFilter" onchange="filterTable()">
                      <option value="">All Phases</option>
                      <option value="planning">Planning</option>
                      <option value="genre">Genre Selection</option>
                      <option value="nomination">Nomination</option>
                      <option value="voting">Voting</option>
                      <option value="complete">Complete</option>
                    </select>
                  </div>
                  
                  <div class="filter-group">
                    <label>Genre:</label>
                    <input type="text" id="genreFilter" placeholder="Filter by genre..." onkeyup="filterTable()">
                  </div>
                  
                  <div class="filter-group">
                    <label>Winner:</label>
                    <select id="winnerFilter" onchange="filterTable()">
                      <option value="">All Members</option>
                      ${members.map(m => `<option value="${m.name}">${m.name}</option>`).join('')}
                    </select>
                  </div>
                  
                  <div class="filter-group">
                    <label>Year:</label>
                    <select id="yearFilter" onchange="filterTable()">
                      <option value="">All Years</option>
                      <option value="2024">2024</option>
                      <option value="2025">2025</option>
                      <option value="2026">2026</option>
                    </select>
                  </div>
                  
                  <button onclick="exportToCSV()" class="btn btn-secondary export-btn">
                    📥 Export CSV
                  </button>
                </div>

                <!-- Table -->
                <div class="table-container">
                  <table class="data-table" id="dataTable">
                    <thead>
                      <tr>
                        <th onclick="sortTable(0)">Date ↕</th>
                        <th onclick="sortTable(1)">Genre ↕</th>
                        <th onclick="sortTable(2)">Phase ↕</th>
                        <th>Winner</th>
                        <th>Score</th>
                        <th>Nominations</th>
                        <th>Votes</th>
                        <th>Nominators</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody id="tableBody">
                      ${weeks.map(week => `
                        <tr class="row-${week.weekStatus} ${week.phase === 'complete' ? 'row-complete' : ''}" 
                            data-phase="${week.phase}"
                            data-genre="${week.genre || ''}"
                            data-winner="${week.winner_nominator || ''}"
                            data-year="${new Date(week.week_date).getFullYear()}">
                          <td>
                            <strong>${week.displayDate}</strong>
                          </td>
                          <td>${week.genre || '<em style="color: #999;">Not set</em>'}</td>
                          <td>
                            <span class="phase-badge phase-${week.phase}">${week.phase}</span>
                          </td>
                          <td class="winner-cell">
                            ${week.winner_title ? `
                              <span class="winner-badge">🏆</span>
                              ${week.winner_title}
                              ${week.winner_year ? `(${week.winner_year})` : ''}
                              <br>
                              <small style="color: #666;">by ${week.winner_nominator}</small>
                            ` : '-'}
                          </td>
                          <td>${week.winner_score || '-'}</td>
                          <td>
                            ${week.nomination_count > 0 ? 
                              `<span class="stat-badge nominations">🎬 ${week.nomination_count}</span>` : 
                              '-'}
                          </td>
                          <td>
                            ${week.vote_count > 0 ? 
                              `<span class="stat-badge votes">🗳️ ${week.vote_count}</span>` : 
                              '-'}
                          </td>
                          <td>
                            <div class="nominators-list">
                              ${week.nominatorsList.map(n => 
                                `<span class="nominator-badge">${n}</span>`
                              ).join('') || '-'}
                            </div>
                          </td>
                          <td>
                            ${week.phase === 'complete' ? 
                              `<a href="/results/${week.week_date}" class="btn btn-success btn-small">Results</a>` :
                              week.phase === 'voting' ? 
                              `<a href="/vote/${week.week_date}" class="btn btn-warning btn-small">Vote</a>` :
                              week.phase === 'nomination' ? 
                              `<a href="/nominate/${week.week_date}" class="btn btn-primary btn-small">Nominate</a>` :
                              `<a href="/set-genre/${week.week_date}" class="btn btn-secondary btn-small">Set Genre</a>`
                            }
                          </td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                  
                  ${weeks.length === 0 ? `
                    <div class="no-data">
                      <p>No weeks found. Start by setting up your first week!</p>
                    </div>
                  ` : ''}
                </div>

                <div class="actions" style="margin-top: var(--space-6);">
                  <a href="/admin/import-genres" class="btn btn-secondary">Back to Admin</a>
                  <a href="/" class="btn btn-primary">Calendar View</a>
                </div>
              </div>

              <script>
                let sortColumn = -1;
                let sortDirection = 1;
                
                function filterTable() {
                  const phaseFilter = document.getElementById('phaseFilter').value.toLowerCase();
                  const genreFilter = document.getElementById('genreFilter').value.toLowerCase();
                  const winnerFilter = document.getElementById('winnerFilter').value.toLowerCase();
                  const yearFilter = document.getElementById('yearFilter').value;
                  
                  const rows = document.querySelectorAll('#tableBody tr');
                  
                  rows.forEach(row => {
                    const phase = row.dataset.phase;
                    const genre = row.dataset.genre.toLowerCase();
                    const winner = row.dataset.winner.toLowerCase();
                    const year = row.dataset.year;
                    
                    let show = true;
                    
                    if (phaseFilter && phase !== phaseFilter) show = false;
                    if (genreFilter && !genre.includes(genreFilter)) show = false;
                    if (winnerFilter && winner !== winnerFilter) show = false;
                    if (yearFilter && year !== yearFilter) show = false;
                    
                    row.style.display = show ? '' : 'none';
                  });
                }
                
                function sortTable(column) {
                  const tbody = document.getElementById('tableBody');
                  const rows = Array.from(tbody.querySelectorAll('tr'));
                  
                  // Toggle sort direction if same column
                  if (sortColumn === column) {
                    sortDirection *= -1;
                  } else {
                    sortDirection = 1;
                    sortColumn = column;
                  }
                  
                  rows.sort((a, b) => {
                    let aVal = a.cells[column].textContent.trim();
                    let bVal = b.cells[column].textContent.trim();
                    
                    // Handle dates
                    if (column === 0) {
                      aVal = new Date(a.dataset.year + '-' + aVal);
                      bVal = new Date(b.dataset.year + '-' + bVal);
                      return sortDirection * (aVal - bVal);
                    }
                    
                    // Handle numbers
                    if (column === 4 || column === 5 || column === 6) {
                      aVal = parseInt(aVal) || 0;
                      bVal = parseInt(bVal) || 0;
                      return sortDirection * (aVal - bVal);
                    }
                    
                    // Handle text
                    return sortDirection * aVal.localeCompare(bVal);
                  });
                  
                  // Re-append sorted rows
                  rows.forEach(row => tbody.appendChild(row));
                }
                
                function exportToCSV() {
                  const table = document.getElementById('dataTable');
                  const rows = table.querySelectorAll('tr');
                  const csv = [];
                  
                  rows.forEach(row => {
                    const cols = row.querySelectorAll('td, th');
                    const rowData = [];
                    
                    cols.forEach((col, index) => {
                      // Skip the actions column
                      if (index < cols.length - 1) {
                        let text = col.textContent.trim();
                        // Clean up text
                        text = text.replace(/🏆/g, '').replace(/🎬/g, '').replace(/🗳️/g, '');
                        text = text.replace(/\\s+/g, ' ');
                        // Quote if contains comma
                        if (text.includes(',')) {
                          text = '"' + text + '"';
                        }
                        rowData.push(text);
                      }
                    });
                    
                    csv.push(rowData.join(','));
                  });
                  
                  // Download CSV
                  const csvContent = csv.join('\\n');
                  const blob = new Blob([csvContent], { type: 'text/csv' });
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'film-club-data-' + new Date().toISOString().split('T')[0] + '.csv';
                  a.click();
                  window.URL.revokeObjectURL(url);
                }
              </script>
            </body>
            </html>
          `);
        });
      });
    });
  });
});

module.exports = router;
