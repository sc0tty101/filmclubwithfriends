// routes/calendar.js - Updated with authentication
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { WEEKS_PAST, WEEKS_FUTURE } = require('../config/constants');

router.get('/', requireAuth, (req, res) => {
  const currentUser = req.user; // From session via middleware

  // Redirect to login if not authenticated (safety check)
  if (!currentUser) {
    return res.redirect('/login');
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

    // Generate from WEEKS_PAST to WEEKS_FUTURE (from constants)
    for (let i = -WEEKS_PAST; i < WEEKS_FUTURE; i++) {
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
          <!-- User info and logout -->
          <div class="user-select">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span><strong>${currentUser.name}</strong>${currentUser.isAdmin ? ' (Admin)' : ''}</span>
              <a href="/logout" class="btn btn-small btn-secondary">Logout</a>
            </div>
          </div>

          <div class="header">
            <h1>🎬 Film Club Calendar</h1>
            <p>Weekly film nominations and voting</p>
          </div>

          <!-- Navigation -->
          ${currentUser.isAdmin ? `
            <div class="nav-buttons">
              <a href="/manage-members" class="btn btn-secondary">Manage Members</a>
              <a href="/manage-genres" class="btn btn-secondary">Manage Genres</a>
              <a href="/admin" class="btn btn-secondary">Admin</a>
            </div>
          ` : ''}

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
                  <a href="/set-genre/${currentWeek.date}" class="btn btn-primary">${currentWeek.genre_name ? 'Update Genre' : 'Set Genre'}</a>
                  ${currentWeek.genre_name && currentUser.isAdmin ? `
                    <form action="/open-nominations/${currentWeek.date}" method="POST" style="display: inline;">
                      <button type="submit" class="btn btn-success">Open Nominations</button>
                    </form>
                  ` : ''}
                ` : currentWeek.phase === 'nomination' ? `
                  <a href="/nominate/${currentWeek.date}" class="btn btn-success">Nominate Film</a>
                  ${currentWeek.nomination_count >= 3 && currentUser.isAdmin ? `
                    <a href="/begin-voting/${currentWeek.date}" class="btn btn-warning">Begin Voting</a>
                  ` : ''}
                ` : currentWeek.phase === 'voting' ? `
                  <a href="/vote/${currentWeek.date}" class="btn btn-warning">Vote Now</a>
                  ${currentUser.isAdmin ? `
                    <a href="/calculate-results/${currentWeek.date}" class="btn btn-primary">Calculate Results</a>
                  ` : ''}
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
                    <a href="/set-genre/${week.date}" class="btn btn-primary btn-small">${week.genre_name ? 'Update Genre' : 'Set Genre'}</a>
                    ${week.genre_name && currentUser.isAdmin ? `
                      <form action="/open-nominations/${week.date}" method="POST" style="display: inline;">
                        <button type="submit" class="btn btn-success btn-small">Open Nominations</button>
                      </form>
                    ` : ''}
                  ` : week.phase === 'nomination' ? `
                    <a href="/nominate/${week.date}" class="btn btn-success btn-small">Nominate</a>
                    ${week.nomination_count >= 3 && currentUser.isAdmin ? `
                      <a href="/begin-voting/${week.date}" class="btn btn-warning btn-small">Begin Voting</a>
                    ` : ''}
                  ` : week.phase === 'voting' ? `
                    <a href="/vote/${week.date}" class="btn btn-warning btn-small">Vote</a>
                    ${currentUser.isAdmin ? `
                      <a href="/calculate-results/${week.date}" class="btn btn-primary btn-small">Calculate Results</a>
                    ` : ''}
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

        </body>
      </html>
    `);
  });
});

module.exports = router;
