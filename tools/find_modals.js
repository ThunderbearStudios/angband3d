const fs = require('fs');
const html = fs.readFileSync('server/public/index.html', 'utf8');

const regex = /id="([^"]+)"/g;
let m;
const ids = [];
while ((m = regex.exec(html)) !== null) {
    ids.push(m[1]);
}
console.log('Chronicle/Tome/Modal IDs:');
ids.filter(id => id.includes('chronicle') || id.includes('tome') || id.includes('modal') || id.includes('book')).forEach(id => {
    console.log(' - ' + id);
});
