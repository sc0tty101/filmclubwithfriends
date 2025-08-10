// Simplified index.js
const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Set up EJS as view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Import database
const { db } = require('./database/setup');

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// Make database available to all routes
app.use((req, res, next) => {
  req.db = db;
  next();
});

// Import routes
const calendarRoutes = require('./routes/calendar'); // NEW
const membersRoutes = require('./routes/members');
const genresRoutes = require('./routes/genres');
const weeksRoutes = require('./routes/weeks');
const adminRoutes = require('./routes/admin');
const filmsRoutes = require('./routes/films');
const votesRoutes = require('./routes/votes');
const resultsRoutes = require('./routes/results');
const statisticsRoutes = require('./routes/statistics');
const importRoutes = require('./routes/import');
const tableViewRoutes = require('./routes/table-view');

// Use routes
app.use('/', calendarRoutes); // NEW - handles the main calendar view
app.use('/', membersRoutes);
app.use('/', genresRoutes);
app.use('/', weeksRoutes);
app.use('/', adminRoutes);
app.use('/', filmsRoutes);
app.use('/', votesRoutes);
app.use('/', resultsRoutes);
app.use('/', statisticsRoutes);
app.use('/', importRoutes);
app.use('/', tableViewRoutes);

// Start server
app.listen(port, () => {
  console.log(`🎬 Film Club app running on port ${port}`);
  console.log(`Visit http://localhost:${port} to get started!`);
});
