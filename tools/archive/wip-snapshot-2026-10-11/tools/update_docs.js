const fs = require('fs');
let f = fs.readFileSync('docs/PROTOCOL.md', 'utf8');
const search = `| \`protocol\` | int | Protocol version. Currently \`1\`. |
| \`build\` | string | Angband build id, e.g. \`"Angband 4.2.6"\`. |
| \`savefile\` | string | Full path of the savefile in use. |
| \`save_dir\` | string | Directory savefiles are read from and written to. |`;
const replace = `| \`protocol\` | int | Protocol version from engine. Currently \`1\`. |
| \`version\` | string | Server API version (emitted by Node). Currently \`"1.0.0"\`. |
| \`sessionId\` | string | Unique connection session identifier. |
| \`realm\` | string | The active game realm for this session (e.g. \`"angband"\`). |
| \`engineName\` | string | Human-readable name of the game engine running. |
| \`build\` | string | Angband build id, e.g. \`"Angband 4.2.6"\`. |
| \`savefile\` | string | Full path of the savefile in use. |
| \`save_dir\` | string | Directory savefiles are read from and written to. |
| \`ownerToken\` | string | (Optional) Secure token proving ownership of the newly created or loaded savefile. |
| \`isFallback\` | boolean | (Optional) True if the requested realm failed and the server used a fallback. |`;
f = f.replace(search.replace(/\n/g, '\r\n'), replace.replace(/\n/g, '\r\n'));
fs.writeFileSync('docs/PROTOCOL.md', f);
console.log('updated');
