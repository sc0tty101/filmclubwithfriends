// config/constants.js - Application constants and configuration

module.exports = {
  // Week calendar configuration
  WEEKS_PAST: 4,
  WEEKS_FUTURE: 12,

  // Nomination and voting
  MIN_NOMINATIONS_FOR_VOTING: 3,
  MAX_SEARCH_RESULTS: 5,

  // TMDB API configuration
  TMDB_POSTER_SIZE: 'w92',
  TMDB_BASE_URL: 'https://api.themoviedb.org/3',
  TMDB_IMAGE_BASE: 'https://image.tmdb.org/t/p',

  // Input validation
  MAX_NAME_LENGTH: 50,
  MAX_GENRE_LENGTH: 50,
  DATE_REGEX: /^\d{4}-\d{2}-\d{2}$/,

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: 60 * 1000, // 1 minute
  RATE_LIMIT_MAX_REQUESTS: 30, // 30 requests per minute

  // Session configuration
  SESSION_SECRET: process.env.SESSION_SECRET || 'film-club-secret-change-in-production',
  SESSION_MAX_AGE: 7 * 24 * 60 * 60 * 1000, // 7 days
  SESSION_SECURE_COOKIES: process.env.SESSION_SECURE_COOKIES === 'true',

  // Phases
  PHASES: {
    PLANNING: 'planning',
    NOMINATION: 'nomination',
    VOTING: 'voting',
    COMPLETE: 'complete'
  }
};
