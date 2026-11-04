const LOCAL_HOST_ALIASES = new Set(['localhost', '127.0.0.1']);

function isAllowedOrigin(origin, configuredOrigin, allowLocalAliases = false) {
  if (!origin) return true;

  let requestUrl;
  let configuredUrl;
  try {
    requestUrl = new URL(origin);
    configuredUrl = new URL(configuredOrigin);
  } catch {
    return false;
  }

  if (requestUrl.origin === configuredUrl.origin) return true;
  if (!allowLocalAliases || requestUrl.protocol !== configuredUrl.protocol || requestUrl.port !== configuredUrl.port) return false;

  return LOCAL_HOST_ALIASES.has(requestUrl.hostname)
    && LOCAL_HOST_ALIASES.has(configuredUrl.hostname);
}

module.exports = { isAllowedOrigin };
