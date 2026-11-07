'use strict';
const fs = require('fs');
const path = require('path');
const localPath = path.resolve(__dirname, '../../public/js/ryod-compiler.js');
const containerPath = path.resolve(__dirname, '../../../public/js/ryod-compiler.js');
module.exports = require(fs.existsSync(localPath) ? localPath : containerPath);
