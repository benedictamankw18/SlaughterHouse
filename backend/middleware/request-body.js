const express = require('express');

const BODY_LIMITS = Object.freeze({
  webhook: '1mb',
  adminUpload: '35mb',
  customRequest: '20mb',
  default: '256kb'
});

function configureRequestBodyParsing(app) {
  app.use('/api/payments/webhook', express.raw({ type: 'application/json', limit: BODY_LIMITS.webhook }));
  app.use('/api/admin/beats', express.json({ limit: BODY_LIMITS.adminUpload }));
  app.use('/api/admin/merchandise', express.json({ limit: BODY_LIMITS.adminUpload }));
  app.use('/api/admin/stream-releases', express.json({ limit: BODY_LIMITS.adminUpload }));
  app.use('/api/requests', express.json({ limit: BODY_LIMITS.customRequest }));
  app.use(express.json({ limit: BODY_LIMITS.default }));
}

module.exports = { BODY_LIMITS, configureRequestBodyParsing };
