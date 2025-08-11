// routes/calendar.js - Simplified main homepage
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  // Get members for dropdown
  req.db.all("SELECT id, name FROM members WHERE is_active = 1 ORDER BY name", (err, members) => {
    if (err) {
      console.error('Members error:', err);
      members = [];
    }

    // Get all weeks with their data
    req.db.all(`
      SELECT 
        w.id,
        w.week_date,
        w.phase,
        g.name as genre_name,
        COUNT(DISTINCT n.id) as nomination_count,
        COUNT(DISTINCT v.id) as vote_count,
        wf.title as winner_title,
        wf.year as winner_year
      FROM weeks w
      LEFT JOIN genres g ON w.genre_id = g.id
      LEFT JOIN nominations n ON w.id = n.week_id
      LEFT JOIN votes v ON w.id = v.week_id
      LEFT JOIN results r ON w.id = r.week_id
      LEFT JOIN nominations wn ON r.winning_nomination_id = wn.id
      LEFT JOIN films wf ON wn.film_id = wf.id
      GROUP BY w.id
      ORDER BY w.week_date DESC
    `, (err, weeks) => {
      if (err) {
        console.error('Weeks error:', err);
        weeks = [];
      }

      // Helper functions
      function getMondayOfWeek(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
      }

      function formatDate(date) {
        return date.toISOString().split('T')[0];
      }

      function formatDisplayDate(date) {
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric',
          year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
        });
      }

      // Generate week slots
      const currentMonday = getMondayOfWeek(new Date());
      const weekSlots = [];
      
      // Generate from 4 weeks ago to 12 weeks ahead
      for (let i = -4; i < 12; i++) {
        const weekDate = new Date(currentMonday);
        weekDate.setDate(currentMonday.getDate() + (i * 7));
        const weekDateStr = formatDate(weekDate);
        
        // Find existing week data
        const existingWeek = weeks.find(w => w.week_date === weekDateStr);
        
        weekSlots.push({
          date: weekDateStr,
          displayDate: formatDisplayDate(weekDate),
          isCurrent: i === 0,
          isPast: i < 0,
          isFuture: i > 0,
          ...existingWeek
        });
      }

      // Separate into groups
      const currentWeek = weekSlots.find(w => w.isCurrent);
      const upcomingWeeks = weekSlots.filter(w => w.isFuture);
      const pastWeeks = weekSlots.filter(w => w.isPast);

      // Generate HTML
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Film Club Calendar</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <link rel="stylesheet" href="/styles/main.css">
        </head>
        <body>
          <div class="container">
            <!-- User selector -->
            <div class="user-select">
              <label>Current user:</label>
              <select id="currentUser" onchange="updateUser()">
                <option value="">Select...</option>
                ${members.map(m => `<option value="${m.name}">${m.name}</option>`).join('')}
              </select>
            </div>

            <div class="header">
              <h1>🎬 Film Club Calendar</h1>
              <p>Weekly film nominations and voting</p>
            </div>

            <!-- Navigation -->
            <div class="nav-buttons">
              <a href="/manage-members" class="btn btn-secondary">Manage Members</a>
              <a href="/manage-genres" class="btn btn-secondary">Manage Genres</a>
              <a href="/admin" class="btn btn-secondary">Admin</a>
            </div>

            <!-- Current Week -->
            ${currentWeek ? `
              <div class="card current-week">
                <h2>📍 Current Week - ${currentWeek.displayDate}</h2>
                ${currentWeek.genre_name ? `
                  <p><strong>Genre:</strong> ${currentWeek.genre_name}</p>
                ` : ''}
                <p>
                  <span class="phase-badge phase-${currentWeek.phase || 'planning'}">
                    ${currentWeek.phase || 'planning'}
                  </span>
                  ${currentWeek.nomination_count > 0 ? `
                    • ${currentWeek.nomination_count} nominations
                  ` : ''}
                  ${currentWeek.vote_count > 0 ? `
                    • ${currentWeek.vote_count} votes
                  ` : ''}
                </p>
                ${currentWeek.winner_title ? `
                  <p><strong>Winner:</strong> ${currentWeek.winner_title} (${currentWeek.winner_year})</p>
                ` : ''}
                <div class="actions">
                  ${!currentWeek.id || currentWeek.phase === 'planning' ? `
                    <a href="/set-genre/${currentWeek.date}" class="btn btn-primary">Set Genre</a>
                  ` : currentWeek.phase === 'nomination' ? `
                    <a href="/nominate/${currentWeek.date}" class="btn btn-success">Nominate Film</a>
                  ` : currentWeek.phase === 'voting' ? `
                    <a href="/vote/${currentWeek.date}" class="btn btn-warning">Vote Now</a>
                  ` : currentWeek.phase === 'complete' ? `
                    <a href="/results/${currentWeek.date}" class="btn btn-secondary">View Results</a>
                  ` : ''}
                </div>
              </div>
            ` : ''}

            <!-- Upcoming Weeks -->
            <div class="card">
              <h2>📅 Upcoming Weeks</h2>
              ${upcomingWeeks.map(week => `
                <div class="week-card">
                  <div class="week-info">
                    <h3>${week.displayDate}</h3>
                    ${week.genre_name ? `
                      <p>Genre: <strong>${week.genre_name}</strong></p>
                    ` : '<p style="color: #999;">No genre set</p>'}
                    ${week.phase && week.phase !== 'planning' ? `
                      <span class="phase-badge phase-${week.phase}">${week.phase}</span>
                    ` : ''}
                  </div>
                  <div class="actions">
                    ${!week.id || week.phase === 'planning' ? `
                      <a href="/set-genre/${week.date}" class="btn btn-primary btn-small">Set Genre</a>
                    ` : week.phase === 'nomination' ? `
                      <a href="/nominate/${week.date}" class="btn btn-success btn-small">Nominate</a>
                    ` : week.phase === 'voting' ? `
                      <a href="/vote/${week.date}" class="btn btn-warning btn-small">Vote</a>
                    ` : week.phase === 'complete' ? `
                      <a href="/results/${week.date}" class="btn btn-secondary btn-small">Results</a>
                    ` : ''}
                  </div>
                </div>
              `).join('')}
            </div>

            <!-- Past Weeks -->
            ${pastWeeks.length > 0 ? `
              <div class="card">
                <h2>📚 Past Weeks</h2>
                ${pastWeeks.map(week => `
                  <div class="week-card">
                    <div class="week-info">
                      <h3>${week.displayDate}</h3>
                      ${week.genre_name ? `<p>Genre: ${week.genre_name}</p>` : ''}
                      ${week.winner_title ? `
                        <p><strong>Winner:</strong> ${week.winner_title}</p>
                      ` : week.phase ? `
                        <span class="phase-badge phase-${week.phase}">${week.phase}</span>
                      ` : '<p style="color: #999;">Not started</p>'}
                    </div>
                    ${week.phase === 'complete' ? `
                      <div class="actions">
                        <a href="/results/${week.date}" class="btn btn-secondary btn-small">View Results</a>
                      </div>
                    ` : ''}
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>

          <script>
            // Load saved user
            const savedUser = localStorage.getItem('currentUser');
            if (savedUser) {
              document.getElementById('currentUser').value = savedUser;
            }

            function updateUser() {
              const select = document.getElementById('currentUser');
              const user = select.value;
              if (user) {
                localStorage.setItem('currentUser', user);
                // Add user to all links
                document.querySelectorAll('a[href*="/nominate/"], a[href*="/vote/"], a[href*="/set-genre/"]').forEach(link => {
                  const url = new URL(link.href, window.location.origin);
                  url.searchParams.set('user', user);
                  link.href = url.toString();
                });
              }
            }

            // Update links on page load
            updateUser();
          </script>
        </body>
        </html>
      `);
    });
  });
});

module.exports = router;
