const LOCAL_HOST_ALIASES = new Set(['localhost', '127.0.0.1']);

function isAllowedOrigin(origin, configuredOrigin, allowLocalAliases = false) {
  if (!origin) return true;

  let requestUrl;
  try {
    requestUrl = new URL(origin);
  } catch {
    return false;
  }

  const configuredOrigins = Array.isArray(configuredOrigin) ? configuredOrigin : [configuredOrigin];
  for (const configuredValue of configuredOrigins) {
    let configuredUrl;
    try {
      configuredUrl = new URL(configuredValue);
    } catch {
      continue;
    }
    if (requestUrl.origin === configuredUrl.origin) return true;
    if (!allowLocalAliases || requestUrl.protocol !== configuredUrl.protocol || requestUrl.port !== configuredUrl.port) continue;

    if (LOCAL_HOST_ALIASES.has(requestUrl.hostname) && LOCAL_HOST_ALIASES.has(configuredUrl.hostname)) return true;
  }
  return false;
}

module.exports = { isAllowedOrigin };
