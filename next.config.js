// Bezpečnostní hlavičky. CSP zatím záměrně chybí – aplikace stojí na inline stylech,
// takže její zavedení je samostatný úkol (viz Známá omezení v README).
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Samostatný lokální náhled nesmí přepisovat .next běžícího vývojového serveru.
  distDir: process.env.FOOD_NOTES_PREVIEW === '1' ? '.next-preview' : '.next',
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  async redirects() {
    // Stránka /blood se přejmenovala na /labs – ať fungují uložené odkazy na ploše telefonu.
    return [{ source: '/blood', destination: '/labs', permanent: false }];
  },
};

module.exports = nextConfig;
