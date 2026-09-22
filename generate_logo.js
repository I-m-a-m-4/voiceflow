const fs = require('fs');

const logo = `<svg width='700' height='175' viewBox='0 0 350 175' xmlns='http://www.w3.org/2000/svg'>
<style>text { font-family: 'Inter', sans-serif; font-weight: 700; }</style>
<defs>
<linearGradient id='brandOrange' x1='0%' y1='0%' x2='100%' y2='100%'>
<stop offset='0%' style='stop-color:#FF8C00;stop-opacity:1' />
<stop offset='100%' style='stop-color:#FF4500;stop-opacity:1' />
</linearGradient>
</defs>
<g transform='translate(10, 45)'>
  <rect x='0' y='20' width='8' height='40' rx='4' fill='url(#brandOrange)' />
  <rect x='15' y='0' width='8' height='80' rx='4' fill='url(#brandOrange)' />
  <rect x='30' y='10' width='8' height='60' rx='4' fill='url(#brandOrange)' />
  <rect x='45' y='25' width='8' height='30' rx='4' fill='url(#brandOrange)' />
</g>
<text x='75' y='100' fill='#333' font-size='55' letter-spacing='-1'>Voice</text>
<text x='225' y='100' fill='url(#brandOrange)' font-size='55' letter-spacing='-1'>Flow</text>
</svg>`;

const icon = `<svg width='400' height='400' viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'>
<defs>
<linearGradient id='brandOrange' x1='0%' y1='0%' x2='100%' y2='100%'>
<stop offset='0%' style='stop-color:#FF8C00;stop-opacity:1' />
<stop offset='100%' style='stop-color:#FF4500;stop-opacity:1' />
</linearGradient>
</defs>
<g transform='translate(65, 60) scale(1.3)'>
  <rect x='0' y='20' width='8' height='40' rx='4' fill='url(#brandOrange)' />
  <rect x='15' y='0' width='8' height='80' rx='4' fill='url(#brandOrange)' />
  <rect x='30' y='10' width='8' height='60' rx='4' fill='url(#brandOrange)' />
  <rect x='45' y='25' width='8' height='30' rx='4' fill='url(#brandOrange)' />
</g>
</svg>`;

const b64Logo = 'data:image/svg+xml;base64,' + Buffer.from(logo).toString('base64');
const b64Icon = 'data:image/svg+xml;base64,' + Buffer.from(icon).toString('base64');

const content = `export const AppConfig = {
  version: process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0',
  logoUrl: '${b64Logo}',
  logoIconUrl: '${b64Icon}',
};
`;

fs.writeFileSync('src/lib/config.ts', content);
console.log('Done');
