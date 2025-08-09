// routes/calendar.js
const express = require('express');
const router = express.Router();

class CalendarView {
  constructor(db) {
    this.db = db;
  }

  // Get all data needed for the calendar in one organized query
  async getCalendarData() {
    return new Promise((resolve, reject) => {
      const data = {
        weeks: [],
        members: [],
        currentWeekFilms: [],
        stats: {}
      };

      // Get members first
      this.db.all("SELECT name FROM members WHERE is_active = 1 ORDER BY name", (err, members) => {
        if (err) return reject(err);
        data.members = members;

        // Get weeks with all their data in one query
        this.db.all(`
          SELECT 
            w.*,
            COUNT(DISTINCT n.id) as nomination_count,
            COUNT(DISTINCT v.id) as vote_count,
            winner.film_title as winner_title,
            winner.film_year as winner_year,
            winner.user_name as winner_nominator,
            winner.poster_url as winner_poster
          FROM weeks w
          LEFT JOIN nominations n ON w.id = n.week_id
          LEFT JOIN votes v ON w.id = v.week_id
          LEFT JOIN nominations winner ON w.winner_film_id = winner.id
          GROUP BY w.id
          ORDER BY w.week_date DESC
        `, (err, weeks) => {
          if (err) return reject(err);
          data.weeks = weeks;

          // Get current week films if exists
          const currentWeek = this.getCurrentWeek(weeks);
          if (currentWeek && currentWeek.id) {
            this.db.all(`
              SELECT * FROM nominations 
              WHERE week_id = ? 
              ORDER BY nominated_at
            `, [currentWeek.id], (err, films) => {
              if (!err) data.currentWeekFilms = films;
              resolve(data);
            });
          } else {
            resolve(data);
          }
        });
      });
    });
  }

  getCurrentWeek(weeks) {
    const monday = this.getMondayOfWeek(new Date());
    const mondayStr = this.formatDate(monday);
    return weeks.find(w => w.week_date === mondayStr);
  }

  getMondayOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  }

  formatDate(date) {
    return date.toISOString().split('T')[0];
  }

  generateWeekSlots(existingWeeks) {
    const slots = [];
    const currentMonday = this.getMondayOfWeek(new Date());
    
    // Generate 52 weeks (full year ahead)
    for (let i = -4; i < 48; i++) {
      const weekDate = new Date(currentMonday);
      weekDate.setDate(currentMonday.getDate() + (i * 7));
      const weekDateStr = this.formatDate(weekDate);
      
      // Find existing week data
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
}

// Route handler
router.get('/', async (req, res) => {
  const calendar = new CalendarView(req.db);
  
  try {
    const data = await calendar.getCalendarData();
    const weekSlots = calendar.generateWeekSlots(data.weeks);
    
    // Group weeks for display
    const groupedWeeks = {
      past: weekSlots.filter(w => w.isPast),
      current: weekSlots.find(w => w.isCurrent),
      upcoming: weekSlots.filter(w => w.isNearFuture),
      future: weekSlots.filter(w => !w.isPast && !w.isCurrent && !w.isNearFuture)
    };

    // Render with the new template
    res.render('calendar', {
      members: data.members,
      weeks: groupedWeeks,
      currentWeekFilms: data.currentWeekFilms,
      stats: data.stats
    });
    
  } catch (error) {
    console.error('Calendar error:', error);
    res.status(500).send('Error loading calendar');
  }
});

module.exports = router;
