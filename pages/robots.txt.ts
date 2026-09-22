import type { GetServerSideProps } from 'next';
import { BRAND } from '../lib/brand';

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  // Veřejný statický seznam cest, nikdy obsah účtu ani zákaznické identifikátory.
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /app',
    'Disallow: /api/',
    'Disallow: /dotaznik',
    'Disallow: /t/',
    '',
    `Sitemap: ${BRAND.origin}/sitemap.xml`,
    '',
  ].join('\n');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.end(body);
  return { props: {} };
};

export default function Robots() {
  return null;
}
