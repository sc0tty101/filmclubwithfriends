const express = require('express');
const router = express.Router();

// Table view route
router.get('/admin/table-view', (req, res) => {
  // Get all weeks with their data
  req.db.all(`
    SELECT 
      w.*,
      COUNT(DISTINCT n.id) as nomination_count,
      COUNT(DISTINCT v.id) as vote_count,
      winner.film_title as winner_title,
      winner.film_year as winner_year,
      winner.user_name as winner_nominator
    FROM weeks w
    LEFT JOIN nominations n ON w.id = n.week_id
    LEFT JOIN votes v ON w.id = v.week_id
    LEFT JOIN nominations winner ON w.winner_film_id = winner.id
    GROUP BY w.id
    ORDER BY w.week_date DESC
  `, (err, weeks) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Table View - Film Club</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="/styles/main.css">
        <style>
          .table-container { overflow-x: auto; margin: var(--space-6) 0; }
          .data-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
          .data-table th, .data-table td { padding: var(--space-3); text-align: left; border-bottom: 1px solid var(--gray-200); }
          .data-table th { background: var(--gray-50); font-weight: 600; position: sticky; top: 0; }
          .data-table tr:hover { background: var(--gray-50); }
          .phase-planning { color: #2563eb; }
          .phase-nomination { color: #16a34a; }
          .phase-voting { color: #ea580c; }
          .phase-complete { color: #7c3aed; }
          .winner-cell { background: var(--winner-gradient); font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📋 Film Club Table View</h1>
            <p>All weeks in a condensed table format</p>
          </div>

          <div class="card">
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Week Date</th>
                    <th>Genre</th>
                    <th>Phase</th>
                    <th>Nominations</th>
                    <th>Votes</th>
                    <th>Winner</th>
                    <th>Score</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${weeks.map(week => `
                    <tr>
                      <td>${new Date(week.week_date).toLocaleDateString()}</td>
                      <td>${week.genre || '-'}</td>
                      <td><span class="phase-${week.phase}">${week.phase}</span></td>
                      <td>${week.nomination_count}</td>
                      <td>${week.vote_count}</td>
                      <td class="${week.winner_title ? 'winner-cell' : ''}">
                        ${week.winner_title ? `${week.winner_title} (${week.winner_nominator})` : '-'}
                      </td>
                      <td>${week.winner_score || '-'}</td>
                      <td>
                        ${week.phase === 'complete' ? `<a href="/results/${week.week_date}" class="btn btn-small btn-success">Results</a>` : 
                          week.phase === 'planning' ? `<a href="/set-genre/${week.week_date}" class="btn btn-small btn-primary">Set Genre</a>` :
                          week.phase === 'nomination' ? `<a href="/nominate/${week.week_date}" class="btn btn-small btn-success">Nominate</a>` :
                          week.phase === 'voting' ? `<a href="/vote/${week.week_date}" class="btn btn-small btn-warning">Vote</a>` : '-'}
                      </td>
