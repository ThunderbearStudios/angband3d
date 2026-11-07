'use strict';
const fs = require('fs');
const path = require('path');
const localPath = path.resolve(__dirname, '../../public/js/realm-content-pool.js');
const containerPath = path.resolve(__dirname, '../../../public/js/realm-content-pool.js');
module.exports = require(fs.existsSync(localPath) ? localPath : containerPath);
