(() => {
  if (typeof window.ULTBIGBOY_API_URL === 'string') return;

  const isLocalApiHost = location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  window.ULTBIGBOY_API_URL = isLocalApiHost ? 'http://localhost:3000' : '';
})();
