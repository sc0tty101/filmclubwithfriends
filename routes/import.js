// routes/import.js
const express = require('express');
const router = express.Router();

// Helper function to parse date string like "6 May" or "13 May" with year
function parseDate(dateStr, year) {
  const months = {
    'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
    'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
  };
  
  const parts = dateStr.trim().split(' ');
  if (parts.length !== 2) return null;
  
  const day = parseInt(parts[0]);
  const month = months[parts[1]];
  
  if (isNaN(day) || month === undefined) return null;
  
  const date = new Date(year, month, day);
  
  // Get the Monday of that week
  const dayOfWeek = date.getDay();
  const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  date.setDate(diff);
  
  return date.toISOString().split('T')[0];
}

// Parse the raw data from spreadsheet
function parseRawData(rawData) {
  const lines = rawData.trim().split('\n');
  const parsed = [];
  const errors = [];
  const members = new Set();
  const weekData = {};
  
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    
    // Split by tab character
    const parts = line.split('\t');
    
    if (parts.length < 8) {
      errors.push(`Line ${index + 1}: Not enough columns (${parts.length} found, 8 expected)`);
      return;
    }
    
    const [weekNum, weekLabel, year, startDate, endDate, genre, film, nominator, voteScore] = parts;
    
    // Skip weeks with unusual labels (5a, 5b, 6a, 6b)
    if (weekLabel && (weekLabel.includes('a') || weekLabel.includes('b'))) {
      console.log(`Skipping unusual week: ${weekLabel}`);
      return;
    }
    
    // Parse the date
    const weekDate = parseDate(startDate, parseInt(year));
    if (!weekDate) {
      errors.push(`Line ${index + 1}: Invalid date format: ${startDate} ${year}`);
      return;
    }
    
    // Clean up data
    const cleanFilm = film ? film.trim() : '';
    const cleanNominator = nominator ? nominator.trim() : '';
    const cleanGenre = genre ? genre.trim() : '';
    const score = parseInt(voteScore) || 0;
    
    // Skip empty films or nominators
    if (!cleanFilm || !cleanNominator) {
      return;
    }
    
    // Track unique members
    if (cleanNominator) {
      members.add(cleanNominator);
    }
    
    // Track week data for finding winners
    if (!weekData[weekDate]) {
      weekData[weekDate] = {
        genre: cleanGenre,
        nominations: []
      };
    }
    
    weekData[weekDate].nominations.push({
      weekDate,
      genre: cleanGenre,
      film: cleanFilm,
      nominator: cleanNominator,
      voteScore: score
    });
  });
  
  // Determine winners for each week
  Object.keys(weekData).forEach(weekDate => {
    const week = weekData[weekDate];
    let maxScore = -1;
    let winner = null;
    
    week.nominations.forEach(nom => {
      if (nom.voteScore > maxScore) {
        maxScore = nom.voteScore;
        winner = nom;
      }
    });
    
    // Add all nominations with winner flag
    week.nominations.forEach(nom => {
      parsed.push({
        weekDate: nom.weekDate,
        genre: nom.genre,
        film: nom.film,
        nominator: nom.nominator,
        voteScore: nom.voteScore,
        isWinner: winner && nom.film === winner.film && nom.nominator === winner.nominator
      });
    });
  });
  
  // Sort by date
  parsed.sort((a, b) => new Date(a.weekDate) - new Date(b.weekDate));
  
  return {
    nominations: parsed,
    members: Array.from(members),
    errors,
    weekCount: Object.keys(weekData).length
  };
}

// Import page
router.get('/admin/import-historical', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Import Historical Data - Film Club</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="/styles/main.css">
      <style>
        .import-container {
          max-width: 1400px;
          margin: 0 auto;
        }
        
        .data-input {
          width: 100%;
          min-height: 300px;
          font-family: monospace;
          font-size: 12px;
          padding: 10px;
          border: 2px solid var(--gray-300);
          border-radius: var(--radius-md);
          background: var(--gray-50);
        }
        
        .preview-section {
          margin-top: var(--space-6);
          padding: var(--space-4);
          background: var(--gray-50);
          border-radius: var(--radius-lg);
          max-height: 500px;
          overflow-y: auto;
        }
        
        .preview-table {
          width: 100%;
          font-size: 0.875rem;
          border-collapse: collapse;
        }
        
        .preview-table th {
          background: var(--gray-200);
          padding: var(--space-2);
          text-align: left;
          position: sticky;
          top: 0;
          z-index: 10;
        }
        
        .preview-table td {
          padding: var(--space-2);
          border-bottom: 1px solid var(--gray-200);
        }
        
        .preview-table tr:hover {
          background: var(--white);
        }
        
        .winner-row {
          background: #fef3c7;
        }
        
        .winner-row:hover {
          background: #fde68a;
        }
        
        .stats-box {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: var(--space-3);
          margin: var(--space-4) 0;
        }
        
        .stat-item {
          background: var(--white);
          padding: var(--space-3);
          border-radius: var(--radius-md);
          text-align: center;
          border: 1px solid var(--gray-200);
        }
        
        .stat-number {
          font-size: 1.5rem;
          font-weight: bold;
          color: var(--primary-color);
        }
        
        .stat-label {
          font-size: 0.75rem;
          color: var(--gray-600);
          text-transform: uppercase;
        }
        
        .error-list {
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: var(--radius-md);
          padding: var(--space-3);
          margin: var(--space-3) 0;
        }
        
        .error-item {
          color: #dc2626;
          font-size: 0.875rem;
          margin: var(--space-1) 0;
        }
        
        .member-list {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
          margin: var(--space-3) 0;
        }
        
        .member-badge {
          background: var(--gray-100);
          padding: var(--space-1) var(--space-3);
          border-radius: var(--radius-full);
          font-size: 0.875rem;
          border: 1px solid var(--gray-300);
        }
        
        .member-badge.new {
          background: #dcfce7;
          border-color: #86efac;
          color: #166534;
        }
        
        .instructions {
          background: #dbeafe;
          border: 1px solid #93c5fd;
          border-radius: var(--radius-md);
          padding: var(--space-4);
          margin-bottom: var(--space-4);
        }
        
        .instructions h3 {
          margin: 0 0 var(--space-2) 0;
          color: #1e40af;
        }
        
        .instructions ol {
          margin: 0;
          padding-left: var(--space-5);
          color: #1e40af;
        }
        
        .instructions li {
          margin: var(--space-1) 0;
        }
        
        .loading {
          display: none;
          text-align: center;
          padding: var(--space-6);
        }
        
        .loading.active {
          display: block;
        }
        
        .spinner {
          display: inline-block;
          width: 2rem;
          height: 2rem;
          border: 3px solid var(--gray-200);
          border-top-color: var(--primary-color);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      </style>
    </head>
    <body>
      <div class="import-container">
        <div class="container">
          <div class="header">
            <h1>📥 Import Historical Data</h1>
            <p>Import your film club history from spreadsheet data</p>
          </div>

          <div class="instructions">
            <h3>📋 Instructions:</h3>
            <ol>
              <li>Copy your data from the spreadsheet (including all columns)</li>
              <li>Paste it into the text area below</li>
              <li>Click "Preview Import" to see what will be imported</li>
              <li>Review the preview and fix any errors</li>
              <li>Click "Import Data" to save to database</li>
            </ol>
            <p style="margin-top: var(--space-3); color: #1e40af;">
              <strong>Expected format:</strong> Week# [TAB] Week Label [TAB] Year [TAB] Start Date [TAB] End Date [TAB] Genre [TAB] Film [TAB] Nominator [TAB] Vote Score
            </p>
          </div>

          <div class="card">
            <h2>Paste Your Data</h2>
            <textarea id="rawData" class="data-input" placeholder="Paste your spreadsheet data here..."></textarea>
            
            <div class="actions" style="margin-top: var(--space-4);">
              <button onclick="previewData()" class="btn btn-primary">Preview Import</button>
              <button onclick="clearData()" class="btn btn-secondary">Clear</button>
            </div>
          </div>

          <div id="previewSection" style="display: none;">
            <div class="card">
              <h2>Import Preview</h2>
              
              <div id="errorSection" style="display: none;">
                <h3 style="color: #dc2626;">⚠️ Errors Found:</h3>
                <div id="errorList" class="error-list"></div>
              </div>
              
              <div id="statsSection" class="stats-box"></div>
              
              <div id="membersSection">
                <h3>Members to Import:</h3>
                <div id="membersList" class="member-list"></div>
              </div>
              
              <div class="preview-section">
                <h3>Data Preview (First 20 rows):</h3>
                <table class="preview-table">
                  <thead>
                    <tr>
                      <th>Week Date</th>
                      <th>Genre</th>
                      <th>Film</th>
                      <th>Nominator</th>
                      <th>Score</th>
                      <th>Winner</th>
                    </tr>
                  </thead>
                  <tbody id="previewTableBody">
                  </tbody>
                </table>
              </div>
              
              <div class="actions" style="margin-top: var(--space-4);">
                <button onclick="importData()" class="btn btn-success btn-large">
                  🚀 Import Data
                </button>
                <button onclick="importWithTMDB()" class="btn btn-warning">
                  🎬 Import + Fetch TMDB Data (Slower)
                </button>
                <button onclick="cancelImport()" class="btn btn-secondary">
                  Cancel
                </button>
              </div>
            </div>
          </div>

          <div id="loadingSection" class="loading">
            <div class="spinner"></div>
            <p>Importing data... This may take a few moments.</p>
            <p id="importProgress"></p>
          </div>

          <div id="resultsSection" style="display: none;">
            <div class="card">
              <h2 id="resultsTitle">Import Complete!</h2>
              <div id="resultsContent"></div>
              <div class="actions" style="margin-top: var(--space-4);">
                <a href="/" class="btn btn-primary">View Calendar</a>
                <a href="/statistics" class="btn btn-secondary">View Statistics</a>
                <button onclick="location.reload()" class="btn btn-secondary">Import More Data</button>
              </div>
            </div>
          </div>

          <div class="actions" style="margin-top: var(--space-6);">
            <a href="/admin/import-genres" class="btn btn-secondary">Back to Admin</a>
          </div>
        </div>
      </div>

      <script>
        let parsedData = null;
        
        function previewData() {
          const rawData = document.getElementById('rawData').value;
          
          if (!rawData.trim()) {
            alert('Please paste your data first');
            return;
          }
          
          // Send to server for parsing
          fetch('/admin/parse-import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rawData })
          })
          .then(response => response.json())
          .then(data => {
            parsedData = data;
            displayPreview(data);
          })
          .catch(error => {
            alert('Error parsing data: ' + error.message);
          });
        }
        
        function displayPreview(data) {
          // Show preview section
          document.getElementById('previewSection').style.display = 'block';
          
          // Display errors if any
          if (data.errors && data.errors.length > 0) {
            document.getElementById('errorSection').style.display = 'block';
            document.getElementById('errorList').innerHTML = data.errors
              .map(err => '<div class="error-item">• ' + err + '</div>')
              .join('');
          } else {
            document.getElementById('errorSection').style.display = 'none';
          }
          
          // Display stats
          document.getElementById('statsSection').innerHTML = \`
            <div class="stat-item">
              <div class="stat-number">\${data.weekCount}</div>
              <div class="stat-label">Weeks</div>
            </div>
            <div class="stat-item">
              <div class="stat-number">\${data.nominations.length}</div>
              <div class="stat-label">Nominations</div>
            </div>
            <div class="stat-item">
              <div class="stat-number">\${data.members.length}</div>
              <div class="stat-label">Members</div>
            </div>
            <div class="stat-item">
              <div class="stat-number">\${data.newMembers || 0}</div>
              <div class="stat-label">New Members</div>
            </div>
          \`;
          
          // Display members
          document.getElementById('membersList').innerHTML = data.members
            .map(member => \`<span class="member-badge \${data.existingMembers && !data.existingMembers.includes(member) ? 'new' : ''}">\${member}</span>\`)
            .join('');
          
          // Display preview table (first 20 rows)
          const tbody = document.getElementById('previewTableBody');
          tbody.innerHTML = data.nominations.slice(0, 20).map(nom => \`
            <tr class="\${nom.isWinner ? 'winner-row' : ''}">
              <td>\${nom.weekDate}</td>
              <td>\${nom.genre}</td>
              <td>\${nom.film}</td>
              <td>\${nom.nominator}</td>
              <td>\${nom.voteScore}</td>
              <td>\${nom.isWinner ? '🏆' : ''}</td>
            </tr>
          \`).join('');
          
          // Scroll to preview
          document.getElementById('previewSection').scrollIntoView({ behavior: 'smooth' });
        }
        
        function importData() {
          if (!parsedData) {
            alert('Please preview the data first');
            return;
          }
          
          if (!confirm('This will import ' + parsedData.nominations.length + ' nominations across ' + parsedData.weekCount + ' weeks. Continue?')) {
            return;
          }
          
          doImport(false);
        }
        
        function importWithTMDB() {
          if (!parsedData) {
            alert('Please preview the data first');
            return;
          }
          
          if (!confirm('This will import data AND fetch movie details from TMDB. This may take several minutes. Continue?')) {
            return;
          }
          
          doImport(true);
        }
        
        function doImport(fetchTMDB) {
          // Show loading
          document.getElementById('previewSection').style.display = 'none';
          document.getElementById('loadingSection').classList.add('active');
          
          // Send import request
          fetch('/admin/import-historical', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nominations: parsedData.nominations,
              members: parsedData.members,
              fetchTMDB: fetchTMDB
            })
          })
          .then(response => response.json())
          .then(result => {
            document.getElementById('loadingSection').classList.remove('active');
            document.getElementById('resultsSection').style.display = 'block';
            
            if (result.success) {
              document.getElementById('resultsTitle').innerHTML = '✅ Import Successful!';
              document.getElementById('resultsContent').innerHTML = \`
                <p><strong>Imported:</strong></p>
                <ul>
                  <li>\${result.weeksImported} weeks</li>
                  <li>\${result.nominationsImported} nominations</li>
                  <li>\${result.membersCreated} new members</li>
                  \${result.tmdbEnhanced ? '<li>' + result.tmdbEnhanced + ' films enhanced with TMDB data</li>' : ''}
                </ul>
                \${result.errors && result.errors.length > 0 ? 
                  '<p><strong>Errors:</strong></p><div class="error-list">' + 
                  result.errors.map(e => '<div class="error-item">• ' + e + '</div>').join('') + 
                  '</div>' : ''}
              \`;
            } else {
              document.getElementById('resultsTitle').innerHTML = '❌ Import Failed';
              document.getElementById('resultsContent').innerHTML = \`
                <p style="color: #dc2626;">\${result.error}</p>
              \`;
            }
            
            document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
          })
          .catch(error => {
            document.getElementById('loadingSection').classList.remove('active');
            alert('Import failed: ' + error.message);
          });
        }
        
        function clearData() {
          document.getElementById('rawData').value = '';
          document.getElementById('previewSection').style.display = 'none';
          parsedData = null;
        }
        
        function cancelImport() {
          document.getElementById('previewSection').style.display = 'none';
        }
      </script>
    </body>
    </html>
  `);
});

// Parse import data endpoint
router.post('/admin/parse-import', (req, res) => {
  const { rawData } = req.body;
  
  if (!rawData) {
    return res.status(400).json({ error: 'No data provided' });
  }
  
  const parsed = parseRawData(rawData);
  
  // Check which members already exist
  req.db.all("SELECT name FROM members WHERE is_active = 1", (err, existingMembers) => {
    const existingNames = existingMembers ? existingMembers.map(m => m.name) : [];
    parsed.existingMembers = existingNames;
    parsed.newMembers = parsed.members.filter(m => !existingNames.includes(m)).length;
    
    res.json(parsed);
  });
});

// Import historical data endpoint
router.post('/admin/import-historical', (req, res) => {
  const { nominations, members, fetchTMDB } = req.body;
  
  if (!nominations || nominations.length === 0) {
    return res.status(400).json({ error: 'No data to import' });
  }
  
  let weeksImported = 0;
  let nominationsImported = 0;
  let membersCreated = 0;
  const errors = [];
  const weekIds = {};
  
  // Start transaction
  req.db.serialize(() => {
    req.db.run("BEGIN TRANSACTION");
    
    // Step 1: Create missing members
    const memberPromises = members.map(memberName => {
      return new Promise((resolve) => {
        req.db.run(
          "INSERT OR IGNORE INTO members (name, is_active) VALUES (?, 1)",
          [memberName],
          function(err) {
            if (err) {
              errors.push(`Failed to create member ${memberName}: ${err.message}`);
            } else if (this.changes > 0) {
              membersCreated++;
            }
            resolve();
          }
        );
      });
    });
    
    Promise.all(memberPromises).then(() => {
      // Step 2: Group nominations by week
      const weekGroups = {};
      nominations.forEach(nom => {
        if (!weekGroups[nom.weekDate]) {
          weekGroups[nom.weekDate] = {
            genre: nom.genre,
            nominations: []
          };
        }
        weekGroups[nom.weekDate].nominations.push(nom);
      });
      
      // Step 3: Process each week
      const weekDates = Object.keys(weekGroups).sort();
      let weekIndex = 0;
      
      function processWeek() {
        if (weekIndex >= weekDates.length) {
          // All weeks processed, commit transaction
          req.db.run("COMMIT", (err) => {
            if (err) {
              req.db.run("ROLLBACK");
              return res.json({ 
                success: false, 
                error: 'Failed to commit transaction: ' + err.message 
              });
            }
            
            res.json({
              success: true,
              weeksImported,
              nominationsImported,
              membersCreated,
              errors: errors.length > 0 ? errors : null
            });
          });
          return;
        }
        
        const weekDate = weekDates[weekIndex];
        const weekData = weekGroups[weekDate];
        
        // Insert or update week
        req.db.run(
          `INSERT OR REPLACE INTO weeks (week_date, genre, phase, created_by) 
           VALUES (?, ?, 'complete', 'Historical Import')`,
          [weekDate, weekData.genre],
          function(err) {
            if (err) {
              errors.push(`Failed to create week ${weekDate}: ${err.message}`);
              weekIndex++;
              processWeek();
              return;
            }
            
            const weekId = this.lastID;
            weekIds[weekDate] = weekId;
            weeksImported++;
            
            // Find the winner
            let winner = null;
            let maxScore = -1;
            weekData.nominations.forEach(nom => {
              if (nom.voteScore > maxScore) {
                maxScore = nom.voteScore;
                winner = nom;
              }
            });
            
            // Process nominations for this week
            let nomIndex = 0;
            
            function processNomination() {
              if (nomIndex >= weekData.nominations.length) {
                weekIndex++;
                processWeek();
                return;
              }
              
              const nom = weekData.nominations[nomIndex];
              
              // Extract year from film title if present (e.g., "Laura (1944)")
              let filmTitle = nom.film;
              let filmYear = null;
              const yearMatch = filmTitle.match(/\((\d{4})\)$/);
              if (yearMatch) {
                filmYear = parseInt(yearMatch[1]);
                filmTitle = filmTitle.replace(/\s*\(\d{4}\)$/, '').trim();
              }
              
              req.db.run(
                `INSERT INTO nominations 
                 (week_id, user_name, film_title, film_year, nominated_at) 
                 VALUES (?, ?, ?, ?, datetime('now'))`,
                [weekId, nom.nominator, filmTitle, filmYear],
                function(err) {
                  if (err) {
                    errors.push(`Failed to import ${nom.film}: ${err.message}`);
                  } else {
                    nominationsImported++;
                    
                    // If this is the winner, update the week
                    if (winner && nom.film === winner.film && nom.nominator === winner.nominator) {
                      req.db.run(
                        "UPDATE weeks SET winner_film_id = ?, winner_score = ? WHERE id = ?",
                        [this.lastID, nom.voteScore, weekId]
                      );
                    }
                  }
                  
                  nomIndex++;
                  processNomination();
                }
              );
            }
            
            processNomination();
          }
        );
      }
      
      processWeek();
    });
  });
});

module.exports = router;
