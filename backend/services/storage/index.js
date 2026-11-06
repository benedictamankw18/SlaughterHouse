const config = require('../../config');
const { createLocalStorage } = require('./local');

module.exports = createLocalStorage({
  uploadDirectory: config.uploadDirectory,
  certificateDirectory: config.certificateDirectory,
  apiPublicUrl: config.apiPublicUrl
});
