const express = require('express');
const cors = require('cors');
const config = require('./config');
const database = require('./database');

const app = express();

app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || origin === config.frontendOrigin) return callback(null, true);
    return callback(new Error('Origin is not allowed.'));
  }
}));
app.use(express.json({ limit: '100mb' }));
app.disable('x-powered-by');
app.use((request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/public'));
app.use('/api', require('./routes/admin'));
app.use('/api', require('./routes/requests'));
app.use('/api', require('./routes/bookings'));
app.use('/api', require('./routes/payments'));
app.use('/api', require('./routes/downloads'));

app.use((error, request, response, next) => {
  if (response.headersSent) return next(error);
  if (error?.message === 'Origin is not allowed.') return response.status(403).json({ error: 'Origin is not allowed.' });
  if (error?.type === 'entity.parse.failed') {
    console.error(`Invalid JSON received for ${request.method} ${request.originalUrl}:`, error.message);
    return response.status(400).json({
      error: `Invalid JSON in the ${request.method} request body for ${request.originalUrl}. Property names and string values must use double quotes, and the body must not contain a trailing comma.`
    });
  }
  if (error?.type === 'entity.too.large') return response.status(413).json({ error: 'Request payload is too large.' });
  console.error('Unhandled API error:', error?.message || error);
  response.status(500).json({ error: 'An unexpected server error occurred.' });
});

app.listen(config.port, () => {
  console.log(`UltBigBoy backend running at http://localhost:${config.port}`);
});
