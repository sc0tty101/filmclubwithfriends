const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Railway Test</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 50px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          h1 { font-size: 3em; margin-bottom: 20px; }
          p { font-size: 1.2em; }
        </style>
      </head>
      <body>
        <h1>🚂 Railway Connection Success!</h1>
        <p>Your GitHub → Railway deployment is working perfectly!</p>
        <p>Environment: ${process.env.NODE_ENV || 'development'}</p>
        <p>Port: ${port}</p>
        <p>Time: ${new Date().toISOString()}</p>
      </body>
    </html>
  `);
});

app.get('/api/test', (req, res) => {
  res.json({
    message: 'API endpoint working!',
    timestamp: new Date().toISOString(),
    success: true
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Railway deployment successful! 🎉`);
});
