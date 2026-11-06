const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function sendError(response, status, message, { code, requestId } = {}) {
  const errorCode = code || `HTTP_${status}`;
  const id = requestId || response.locals?.requestId;
  return response.status(status).json({
    error: message,
    code: errorCode,
    ...(id ? { requestId: id } : {})
  });
}

function requestValidation(request, response, next) {
  const originalJson = response.json;
  response.locals.requestId = request.requestId;
  response.json = function jsonWithErrorMetadata(body) {
    if (body && typeof body === 'object' && !Array.isArray(body) && typeof body.error === 'string') {
      return originalJson.call(this, {
        ...body,
        code: body.code || `HTTP_${response.statusCode || 500}`,
        requestId: body.requestId || request.requestId
      });
    }
    return originalJson.call(this, body);
  };

  if (!SAFE_METHODS.has(request.method) && request.path !== '/api/payments/webhook' &&
      request.is('application/x-www-form-urlencoded')) {
    return sendError(response, 415, 'URL-encoded request bodies are not supported.', { code: 'UNSUPPORTED_MEDIA_TYPE' });
  }
  if (!SAFE_METHODS.has(request.method) && request.path !== '/api/payments/webhook' &&
      request.is('application/json') && request.body !== undefined &&
      (!request.body || typeof request.body !== 'object' || Array.isArray(request.body) || Buffer.isBuffer(request.body))) {
    return sendError(response, 400, 'The JSON request body must be an object.', { code: 'INVALID_JSON_BODY' });
  }
  next();
}

module.exports = { SAFE_METHODS, requestValidation, sendError };
