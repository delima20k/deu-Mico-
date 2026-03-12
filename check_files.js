const http = require('http');
const files = [
  'js/components/CardDeckPile.js',
  'js/screens/GameTableScreen.js',
  'css/card-deck-pile.css',
  'js/services/deck.js',
];
let done = 0;
files.forEach(f => {
  http.get('http://localhost:8080/' + f, r => {
    let d = '';
    r.on('data', c => d += c);
    r.on('end', () => {
      console.log(r.statusCode === 200 ? 'OK' : 'FAIL', f, d.length + ' bytes');
      if (++done === files.length) process.exit(0);
    });
  }).on('error', e => { console.error('ERR', f, e.message); if (++done === files.length) process.exit(1); });
});
