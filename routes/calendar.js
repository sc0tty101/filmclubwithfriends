// routes/calendar.js - SIMPLIFIED VERSION
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  // Get members first
  req.db.all("SELECT name FROM members WHERE is_active = 1 ORDER BY name", (err, members) => {
    if (err) {
      console.error('Members error:', err);
      return res.status(500).send('Error loading members: ' + err.message);
    }

    // Get weeks with basic data
    req.db.all(`
      SELECT 
        w.*,
        COUNT(DISTINCT n.id) as nomination_count,
        COUNT(DISTINCT v.id) as vote_count
      FROM weeks w
      LEFT JOIN nominations n ON w.id = n.week_id
      LEFT JOIN votes v ON w.id = v.week_id
      GROUP BY w.id
      ORDER BY w.week_date DESC
    `, (err, weeks) => {
      if (err) {
        console.error('Weeks error:', err);
        return res.status(500).send('Error loading weeks: ' + err.message);
      }

      function getMondayOfWeek(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
      }

      function formatDate(date) {
        return date.toISOString().split('T')[0];
      }

      function getCurrentWeek(weeks) {
        const monday = getMondayOfWeek(new Date());
        const mondayStr = formatDate(monday);
        return weeks.find(w => w.week_date === mondayStr);
      }

      function generateWeekSlots(existingWeeks) {
        const slots = [];
        const currentMonday = getMondayOfWeek(new Date());

        for (let i = -4; i < 48; i++) {
          const weekDate = new Date(currentMonday);
          weekDate.setDate(currentMonday.getDate() + (i * 7));
          const weekDateStr = formatDate(weekDate);

          const existingWeek = existingWeeks.find(w => w.week_date === weekDateStr);

          slots.push({
            date: weekDateStr,
            displayDate: weekDate.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: weekDate.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
            }),
            isCurrent: i === 0,
            isPast: i < 0,
            isNearFuture: i > 0 && i <= 3,
            weekNumber: Math.floor((weekDate - new Date(weekDate.getFullYear(), 0, 1)) / 604800000) + 1,
            ...existingWeek
          });
        }

        return slots;
      }

      const weekSlots = generateWeekSlots(weeks);

      const groupedWeeks = {
        past: weekSlots.filter(w => w.isPast),
        current: weekSlots.find(w => w.isCurrent),
        upcoming: weekSlots.filter(w => w.isNearFuture),
        future: weekSlots.filter(w => !w.isPast && !w.isCurrent && !w.isNearFuture)
      };

      // Get current week films (joined to films and members)
      const currentWeek = groupedWeeks.current;
      let currentWeekFilms = [];

      if (currentWeek && currentWeek.id) {
        req.db.all(
          `SELECT n.id, f.title as film_title, f.year as film_year, f.poster_url, f.backdrop_url, m.name as user_name
             FROM nominations n
             JOIN films f ON n.film_id = f.id
             JOIN members m ON n.member_id = m.id
            WHERE n.week_id = ?
            ORDER BY n.nominated_at`,
          [currentWeek.id],
          (err, films) => {
            if (!err) currentWeekFilms = films;
            renderCalendar();
          }
        );
      } else {
        renderCalendar();
      }

      function renderCalendar() {
        res.render('calendar', {
          members: members || [],
          weeks: groupedWeeks,
          currentWeekFilms: currentWeekFilms,
          stats: {}
        });
      }
    });
  });
});

module.exports = router;