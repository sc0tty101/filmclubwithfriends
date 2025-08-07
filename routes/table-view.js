// routes/table-view.js - SIMPLE VERSION FOR BEGINNERS
const express = require('express');
const router = express.Router();

// Table view page - much simpler and easier to understand!
router.get('/admin/table-view', (req, res) => {
  console.log('📋 Table view requested'); // Debug log
  
  // Check if database is available
  if (!req.db) {
    console.error('❌ Database not available in req.db');
    return res.status(500).send(`
      <h1>Database Error</h1>
      <p>Database connection not available. Check your middleware setup!</p>
      <a href="/">Back to Home</a>
    `);
  }

  console.log('✅ Database available, fetching weeks...'); // Debug log

  // STEP 1: Get all weeks (simple query first)
  req.db.all("SELECT * FROM weeks ORDER BY week_date DESC", (err, weeks) => {
    if (err) {
      console.error('❌ Error fetching weeks:', err);
      return res.status(500).send(`
        <h1>Database Error</h1>
        <p>Error fetching weeks: ${err.message}</p>
        <a href="/">Back to Home</a>
      `);
    }

    console.log(`✅ Found ${weeks.length} weeks`); // Debug log

    // STEP 2: Get members (for the filter dropdown)
    req.db.all("SELECT name FROM members WHERE is_active = 1 ORDER BY name", (err, members) => {
      if (err) {
        console.error('❌ Error fetching members:', err);
        // Don't fail completely, just use empty array
        members = [];
      }

      console.log(`✅ Found ${members.length} members`); // Debug log

      // STEP 3: For each week, get some basic stats
      // We'll do this the simple way - one query at a time
      let processedWeeks = [];
      let weekCount = 0;

      // If no weeks, just show empty table
      if (weeks.length === 0) {
        console.log('📝 No weeks found, showing empty table');
        return sendTableHTML([], members, res);
      }

      // Process each week to get additional data
      weeks.forEach((week, index) => {
        console.log(`📊 Processing week ${index + 1}/${weeks.length}: ${week.week_date}`);
        
        // Get nominations count for this week
        req.db.all("SELECT COUNT(*) as count FROM nominations WHERE week_id = ?", [week.id], (err, nominationResult) => {
          let nominationCount = 0;
          if (!err && nominationResult.length > 0) {
            nominationCount = nominationResult[0].count;
          }

          // Get votes count for this week
          req.db.all("SELECT COUNT(*) as count FROM votes WHERE week_id = ?", [week.id], (err, voteResult) => {
            let voteCount = 0;
            if (!err && voteResult.length > 0) {
              voteCount = voteResult[0].count;
            }

            // Get winner info for this week (if it has one)
            req.db.get(`
              SELECT n.film_title, n.film_year, n.user_name as nominator 
              FROM nominations n 
              WHERE n.id = ?
            `, [week.winner_film_id], (err, winner) => {
              
              // Add all the data to our week object
              const processedWeek = {
                ...week,
                nominationCount: nominationCount,
                voteCount: voteCount,
                winner: winner || null,
                // Format the date nicely
                displayDate: formatDateNicely(week.week_date),
                // Determine if this week is current/past/future
                timeStatus: getTimeStatus(week.week_date)
              };

              processedWeeks.push(processedWeek);
              weekCount++;

              // When we've processed all weeks, send the response
              if (weekCount === weeks.length) {
                console.log('✅ All weeks processed, sending HTML');
                // Sort by date (newest first)
                processedWeeks.sort((a, b) => new Date(b.week_date) - new Date(a.week_date));
                sendTableHTML(processedWeeks, members, res);
              }
            });
          });
        });
      });
    });
  });
});

// Helper function to format dates nicely
function formatDateNicely(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    weekday: 'short',
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  });
}

// Helper function to determine if week is current/past/future
function getTimeStatus(weekDate) {
  const week = new Date(weekDate);
  const today = new Date();
  const daysDiff = Math.floor((week - today) / (1000 * 60 * 60 * 24));
  
  if (daysDiff < -7) return 'past';
  if (daysDiff >= -7 && daysDiff < 0) return 'recent';
  if (daysDiff >= 0 && daysDiff < 7) return 'current';
  if (daysDiff >= 7) return 'future';
  return 'unknown';
}

// Helper function to send the HTML response
function sendTableHTML(weeks, members, res) {
  console.log('🎨 Generating HTML for table view');
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>📋 Table View - Film Club</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="/styles/main.css">
      <style>
        /* Simple table styles */
        .table-container {
          overflow-x: auto;
          margin: 20px 0;
          border: 1px solid #ddd;
          border-radius: 8px;
          background: white;
        }
        
        .data-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }
        
        .data-table th {
          background: #f5f5f5;
          padding: 12px;
          text-align: left;
          font-weight: bold;
          border-bottom: 2px solid #ddd;
          position: sticky;
          top: 0;
        }
        
        .data-table td {
          padding: 12px;
          border-bottom: 1px solid #eee;
        }
        
        .data-table tbody tr:hover {
          background: #f9f9f9;
        }
        
        /* Row colors based on time status */
        .row-current {
          background: #fff3cd !important;
        }
        
        .row-recent {
          background: #d1edcc !important;
        }
        
        .row-future {
          background: #cce8ff !important;
        }
        
        /* Phase badges */
        .phase-badge {
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: bold;
          text-transform: uppercase;
        }
        
        .phase-planning { background: #e0e7ff; color: #3730a3; }
        .phase-genre { background: #fed7aa; color: #c2410c; }
        .phase-nomination { background: #bbf7d0; color: #166534; }
        .phase-voting { background: #fce7f3; color: #be185d; }
        .phase-complete { background: #e9d5ff; color: #7c3aed; }
        
        /* Stats */
        .stat-number {
          font-weight: bold;
          color: #059669;
        }
        
        .winner-info {
          font-weight: bold;
          color: #dc2626;
        }
        
        /* Controls */
        .controls {
          display: flex;
          gap: 15px;
          margin-bottom: 20px;
          flex-wrap: wrap;
          align-items: center;
        }
        
        .filter-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .filter-group label {
          font-weight: 500;
          color: #374151;
        }
        
        .filter-group select,
        .filter-group input {
          padding: 6px 10px;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          font-size: 14px;
        }
        
        /* Summary stats */
        .summary-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 15px;
          margin-bottom: 20px;
        }
        
        .summary-stat {
          background: white;
          padding: 15px;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
          text-align: center;
        }
        
        .summary-stat .number {
          font-size: 24px;
          font-weight: bold;
          color: #1f2937;
          display: block;
        }
        
        .summary-stat .label {
          font-size: 12px;
          color: #6b7280;
          text-transform: uppercase;
          margin-top: 4px;
        }
        
        .no-data {
          text-align: center;
          padding: 40px;
          color: #6b7280;
        }
        
        /* Mobile responsive */
        @media (max-width: 768px) {
          .data-table {
            font-size: 12px;
          }
          
          .data-table th,
          .data-table td {
            padding: 8px;
          }
          
          .controls {
            flex-direction: column;
            align-items: stretch;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📋 Table View</h1>
          <p>All weeks in a simple, easy-to-read table format</p>
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

        <!-- Simple Controls -->
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
            <input type="text" id="genreFilter" placeholder="Search genres..." onkeyup="filterTable()">
          </div>
          
          <button onclick="exportToCSV()" class="btn btn-secondary" style="margin-left: auto;">
            📥 Export CSV
          </button>
        </div>

        <!-- Simple Table -->
        <div class="table-container">
          <table class="data-table" id="dataTable">
            <thead>
              <tr>
                <th onclick="sortTable(0)">Date ↕</th>
                <th onclick="sortTable(1)">Genre ↕</th>
                <th onclick="sortTable(2)">Phase ↕</th>
                <th>Nominations</th>
                <th>Votes</th>
                <th>Winner</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="tableBody">
              ${weeks.length === 0 ? `
                <tr>
                  <td colspan="7" class="no-data">
                    <p>No weeks found yet!</p>
                    <p>Start by <a href="/">setting up your first week</a>.</p>
                  </td>
                </tr>
              ` : weeks.map(week => `
                <tr class="row-${week.timeStatus}" 
                    data-phase="${week.phase}"
                    data-genre="${week.genre || ''}"
                    data-year="${new Date(week.week_date).getFullYear()}">
                  <td>
                    <strong>${week.displayDate}</strong>
                  </td>
                  <td>
                    ${week.genre ? week.genre : '<em style="color: #999;">Not set</em>'}
                    ${week.created_by ? `<br><small style="color: #666;">by ${week.created_by}</small>` : ''}
                  </td>
                  <td>
                    <span class="phase-badge phase-${week.phase}">${week.phase}</span>
                  </td>
                  <td>
                    <span class="stat-number">${week.nominationCount}</span>
                  </td>
                  <td>
                    <span class="stat-number">${week.voteCount}</span>
                  </td>
                  <td>
                    ${week.winner ? `
                      <div class="winner-info">
                        🏆 ${week.winner.film_title}
                        ${week.winner.film_year ? `(${week.winner.film_year})` : ''}
                        <br>
                        <small style="color: #666;">by ${week.winner.nominator}</small>
                      </div>
                    ` : '-'}
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
        </div>

        <div class="actions" style="margin-top: 30px; text-align: center;">
          <a href="/admin/import-genres" class="btn btn-secondary">Back to Admin</a>
          <a href="/" class="btn btn-primary">Calendar View</a>
        </div>
      </div>

      <script>
        console.log('📋 Table view loaded with ${weeks.length} weeks');
        
        let sortColumn = -1;
        let sortDirection = 1;
        
        // Simple filter function
        function filterTable() {
          const phaseFilter = document.getElementById('phaseFilter').value.toLowerCase();
          const genreFilter = document.getElementById('genreFilter').value.toLowerCase();
          
          const rows = document.querySelectorAll('#tableBody tr');
          
          rows.forEach(row => {
            // Skip the "no data" row
            if (row.querySelector('.no-data')) {
              return;
            }
            
            const phase = row.dataset.phase || '';
            const genre = row.dataset.genre.toLowerCase();
            
            let show = true;
            
            if (phaseFilter && phase !== phaseFilter) show = false;
            if (genreFilter && !genre.includes(genreFilter)) show = false;
            
            row.style.display = show ? '' : 'none';
          });
          
          console.log('🔍 Table filtered - Phase:', phaseFilter, 'Genre:', genreFilter);
        }
        
        // Simple sort function
        function sortTable(column) {
          console.log('🔄 Sorting table by column', column);
          
          const tbody = document.getElementById('tableBody');
          const rows = Array.from(tbody.querySelectorAll('tr'));
          
          // Skip sorting if only "no data" row
          if (rows.length === 1 && rows[0].querySelector('.no-data')) {
            return;
          }
          
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
            
            // Handle dates (column 0)
            if (column === 0) {
              aVal = new Date(aVal);
              bVal = new Date(bVal);
              return sortDirection * (aVal - bVal);
            }
            
            // Handle numbers (columns 3, 4)
            if (column === 3 || column === 4) {
              aVal = parseInt(aVal) || 0;
              bVal = parseInt(bVal) || 0;
              return sortDirection * (aVal - bVal);
            }
            
            // Handle text
            return sortDirection * aVal.localeCompare(bVal);
          });
          
          // Re-append sorted rows
          rows.forEach(row => tbody.appendChild(row));
          
          console.log('✅ Table sorted');
        }
        
        // Simple CSV export function
        function exportToCSV() {
          console.log('📥 Exporting to CSV');
          
          const table = document.getElementById('dataTable');
          const rows = table.querySelectorAll('tr');
          const csv = [];
          
          rows.forEach(row => {
            const cols = row.querySelectorAll('td, th');
            const rowData = [];
            
            cols.forEach((col, index) => {
              // Skip the actions column (last column)
              if (index < cols.length - 1) {
                let text = col.textContent.trim();
                // Clean up text
                text = text.replace(/🏆/g, '').replace(/\\s+/g, ' ');
                // Quote if contains comma
                if (text.includes(',')) {
                  text = '"' + text + '"';
                }
                rowData.push(text);
              }
            });
            
            if (rowData.length > 0) {
              csv.push(rowData.join(','));
            }
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
          
          console.log('✅ CSV exported');
        }
      </script>
    </body>
    </html>
  `;
  
  res.send(html);
}

module.exports = router;
