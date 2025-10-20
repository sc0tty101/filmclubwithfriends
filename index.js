// index.js - Film Club Application
const express = require('express');
const session = require('express-session');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Import database
const dbModule = require('./database/setup');

// Import configuration
const { SESSION_SECRET, SESSION_MAX_AGE } = require('./config/constants');

// Import middleware
const { attachUser } = require('./middleware/auth');

// Validate environment (graceful warnings)
if (!process.env.TMDB_API_KEY) {
  console.warn('⚠️  WARNING: TMDB_API_KEY not set. Film search will not work.');
  console.warn('   Set TMDB_API_KEY environment variable to enable film search.');
}

if (SESSION_SECRET === 'film-club-secret-change-in-production' && process.env.NODE_ENV === 'production') {
  console.warn('⚠️  WARNING: Using default SESSION_SECRET in production!');
  console.warn('   Set SESSION_SECRET environment variable for better security.');
}

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// Session middleware
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: SESSION_MAX_AGE,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: 'lax'
  }
}));

// Attach user info from session to request
app.use(attachUser);

// Make database available to all routes
app.use((req, res, next) => {
  req.db = dbModule.db;
  next();
});

// Import routes
const authRoutes = require('./routes/auth');
const calendarRoutes = require('./routes/calendar');
const membersRoutes = require('./routes/members');
const genresRoutes = require('./routes/genres');
const weeksRoutes = require('./routes/weeks');
const adminRoutes = require('./routes/admin');
const filmsRoutes = require('./routes/films');
const votesRoutes = require('./routes/votes');
const resultsRoutes = require('./routes/results');

// Use routes (auth routes first, no auth required)
app.use('/', authRoutes);
app.use('/', calendarRoutes);
app.use('/', membersRoutes);
app.use('/', genresRoutes);
app.use('/', weeksRoutes);
app.use('/', adminRoutes);
app.use('/', filmsRoutes);
app.use('/', votesRoutes);
app.use('/', resultsRoutes);

// Start server
app.listen(port, () => {
  console.log(`🎬 Film Club app running on port ${port}`);
  console.log(`Visit http://localhost:${port} to get started!`);
});
