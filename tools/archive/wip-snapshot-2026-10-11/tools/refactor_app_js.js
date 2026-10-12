const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, '../server/public/js/app.js');
let appJs = fs.readFileSync(appJsPath, 'utf8');

// Replace termCtxActions.innerHTML = `...` with setCtxActions(`...`)
appJs = appJs.replace(/termCtxActions\.innerHTML = `([\s\S]*?)`;/g, 'setCtxActions(`$1`);');
appJs = appJs.replace(/termCtxActions\.innerHTML = `([\s\S]*?)`/g, 'setCtxActions(`$1`)');

fs.writeFileSync(appJsPath, appJs);
console.log("Refactored remaining termCtxActions.innerHTML to setCtxActions");
