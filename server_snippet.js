
// FAQ API-Endpunkte
import fs from 'fs';
import path from 'path';

app.get('/api/faq', (req, res) => {
  const data = fs.readFileSync(path.resolve('faq.json'), 'utf-8');
  res.json(JSON.parse(data));
});

app.post('/api/faq', (req, res) => {
  fs.writeFileSync(path.resolve('faq.json'), JSON.stringify(req.body, null, 2));
  res.json({ success: true });
});
