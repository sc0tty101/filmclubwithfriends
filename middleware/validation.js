// middleware/validation.js - Input validation middleware

const { DATE_REGEX, MAX_NAME_LENGTH, MAX_GENRE_LENGTH } = require('../config/constants');

// Validate date parameter
function validateDate(req, res, next) {
  const date = req.params.date;

  if (!date || !DATE_REGEX.test(date)) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invalid Date</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="/styles/main.css">
      </head>
      <body>
        <div class="container">
          <div class="card">
            <h1>⚠️ Invalid Date Format</h1>
            <p>The date parameter must be in YYYY-MM-DD format.</p>
            <div class="actions center">
              <a href="/" class="btn btn-primary">Back to Calendar</a>
            </div>
          </div>
        </div>
      </body>
      </html>
    `);
  }

  // Validate it's a real date
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) {
    return res.status(400).send('Invalid date');
  }

  next();
}

// Sanitize and validate text input
function sanitizeText(text, maxLength = 100) {
  if (!text) return '';
  return text.trim().substring(0, maxLength);
}

// Validate member name
function validateMemberName(req, res, next) {
  const name = req.body.memberName?.trim();

  if (!name) {
    return res.redirect('/manage-members?error=Member name is required');
  }

  if (name.length > MAX_NAME_LENGTH) {
    return res.redirect('/manage-members?error=Member name is too long (max 50 characters)');
  }

  // Check for potentially malicious input
  if (/<|>|&lt;|&gt;/.test(name)) {
    return res.redirect('/manage-members?error=Invalid characters in name');
  }

  req.body.memberName = name;
  next();
}

// Validate genre name
function validateGenreName(req, res, next) {
  const name = req.body.genreName?.trim();

  if (!name) {
    return res.redirect('/manage-genres?error=Genre name is required');
  }

  if (name.length > MAX_GENRE_LENGTH) {
    return res.redirect('/manage-genres?error=Genre name is too long (max 50 characters)');
  }

  // Check for potentially malicious input
  if (/<|>|&lt;|&gt;/.test(name)) {
    return res.redirect('/manage-genres?error=Invalid characters in genre name');
  }

  req.body.genreName = name;
  next();
}

module.exports = {
  validateDate,
  sanitizeText,
  validateMemberName,
  validateGenreName
};
