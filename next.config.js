/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    // Stránka /blood se přejmenovala na /labs – ať fungují uložené odkazy na ploše telefonu.
    return [{ source: '/blood', destination: '/labs', permanent: false }];
  },
};

module.exports = nextConfig;
