import axios from 'axios';
import fs from 'node:fs';

const resp = await axios.get('https://hongguoduanju.com/character/7410643294910174489', {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
});
const html = resp.data;
const start = html.indexOf('_ROUTER_DATA = ') + '_ROUTER_DATA = '.length;
// walk the JSON: track brace depth, respecting strings
let i = start;
let depth = 0;
let inStr = false;
let esc = false;
while (i < html.length) {
  const c = html[i];
  if (inStr) {
    if (esc) esc = false;
    else if (c === '\\') esc = true;
    else if (c === '"') inStr = false;
  } else {
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  i++;
}
const json = html.substring(start, i);
fs.writeFileSync(process.env.TEMP + '\\char_raw.json', json);
const data = JSON.parse(json);
const page = data.loaderData['character_(id)/page'] || {};
const vl = page.videoList || [];
console.log('videoList length:', vl.length);
console.log('page keys:', Object.keys(page).join(','));
if (vl.length > 0) {
  const item = vl[0];
  const keys = Object.keys(item).sort();
  console.log('item keys count:', keys.length);
  console.log('item keys:', keys.join(','));
  for (const k of ['create_time','update_time','first_visible_time']) {
    if (k in item) console.log(`  ${k}:`, item[k]);
  }
  if (item.hot_score_data) console.log('hot_score_data:', JSON.stringify(item.hot_score_data));
}
