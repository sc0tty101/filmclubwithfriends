// routes/calendar.js - FIXED VERSION
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

        // FIXED: Updated query to match your actual schema
        this.db.all(`
          SELECT 
            w.*,
            g.name as genre,
            COUNT(DISTINCT n.id) as nomination_count,
            COUNT(DISTINCT v.id) as vote_count,
            wf.title as winner_title,
            wf.year as winner_year,
            wm.name as winner_nominator,
            wf.poster_url as winner_poster
          FROM weeks w
          LEFT JOIN genres g ON w.genre_id = g.id
          LEFT JOIN nominations n ON w.id = n.week_id
          LEFT JOIN votes v ON w.id = v.week_id
          LEFT JOIN results r ON w.id = r.week_id
          LEFT JOIN nominations wn ON r.winning_nomination_id = wn.id
          LEFT JOIN films wf ON wn.film_id = wf.id
          LEFT JOIN members wm ON wn.member_id = wm.id
          GROUP BY w.id
          ORDER BY w.week_date DESC
        `, (err, weeks) => {
          if (err) return reject(err);
          data.weeks = weeks;

          // Get current week films if exists
          const currentWeek = this.getCurrentWeek(weeks);
          if (currentWeek && currentWeek.id) {
            // FIXED: Updated to join with films and members tables
            this.db.all(`
              SELECT 
                n.*,
                f.title as film_title,
                f.year as film_year,
                f.poster_url,
                f.backdrop_url,
                m.name as user_name
              FROM nominations n
              LEFT JOIN films f ON n.film_id = f.id
              LEFT JOIN members m ON n.member_id = m.id
              WHERE n.week_id = ? 
              ORDER BY n.nominated_at
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
    res.status(500).send('Error loading calendar: ' + error.message);
  }
});

module.exports = router;
