async function checkReadiness(database, config, storage) {
  const checks = {
    configuration: Boolean(config.databaseConfigured),
    database: false,
    uploads: false,
    certificates: false
  };

  const tasks = [
    Promise.resolve().then(async () => {
      if (typeof database.checkConnection === 'function') await database.checkConnection();
      else await new Promise((resolve, reject) => database.get('SELECT 1 AS ok', [], (error, row) => error ? reject(error) : row?.ok === 1 ? resolve() : reject(new Error('Database probe returned no result.'))));
      checks.database = true;
    }),
    storage.checkWritable('uploads').then(() => { checks.uploads = true; }),
    storage.checkWritable('certificates').then(() => { checks.certificates = true; })
  ];

  const results = await Promise.allSettled(tasks);
  const ready = checks.configuration && Object.values(checks).every(Boolean);
  return {
    ready,
    checks,
    errors: results.flatMap((result, index) => result.status === 'rejected' ? [{
      dependency: ['database', 'uploads', 'certificates'][index],
      message: result.reason?.message || 'Dependency check failed.'
    }] : [])
  };
}

module.exports = { checkReadiness };
