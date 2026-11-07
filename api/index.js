const handler = require('../backend/serverless');

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
