import type { GetServerSideProps } from 'next';
import { getLandingPage } from '../../lib/landing-pages';
import { getLandingPath } from '../../lib/landing-routes';

export default function LegacyLandingPage() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const content = getLandingPage(ctx.params?.slug);
  if (!content) return { notFound: true };
  // Zachováme UTM i reklamní identifikátory starších odkazů. Cíl vždy pochází
  // z pevné mapy, nikoli z uživatelského parametru přesměrování.
  const search = new URL(ctx.resolvedUrl, 'https://local.invalid').search;
  return {
    redirect: {
      destination: `${getLandingPath(content.slug)}${search}`,
      permanent: true,
    },
  };
};
