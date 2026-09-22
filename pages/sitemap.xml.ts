import type { GetServerSideProps } from 'next';
import { BRAND } from '../lib/brand';
import { LANDING_PAGES } from '../lib/landing-pages';
import { getLandingPath } from '../lib/landing-routes';

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  // Sitemap čerpá jen z veřejného obsahu; žádné čtení databáze ani slugů deníků.
  const paths = [
    '/',
    ...LANDING_PAGES.map(({ slug }) => getLandingPath(slug)),
    '/podminky',
    '/jak-chranime-data',
  ];
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...paths.map((path) => `  <url><loc>${BRAND.origin}${path}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n');
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.end(body);
  return { props: {} };
};

export default function Sitemap() {
  return null;
}
