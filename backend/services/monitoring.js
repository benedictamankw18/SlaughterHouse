const counters = {
  requests: 0,
  paymentFailures: 0,
  databaseErrors: 0,
  uploadFailures: 0,
  unauthorizedResponses: 0,
  forbiddenResponses: 0,
  serverErrors: 0
};

function increment(name, amount = 1) {
  if (!Object.hasOwn(counters, name)) throw new Error(`Unknown monitoring counter: ${name}`);
  counters[name] += amount;
}

function snapshot() {
  return {
    ...counters,
    uptimeSeconds: Math.floor(process.uptime()),
    observedAt: new Date().toISOString()
  };
}

function reset() {
  for (const name of Object.keys(counters)) counters[name] = 0;
}

module.exports = { increment, snapshot, reset };
