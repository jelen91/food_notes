import type { GetServerSideProps } from 'next';
import LandingPage, { type LandingProps } from '../components/marketing/LandingPage';
import { getLandingPage } from '../lib/landing-pages';
import { getLandingSlug } from '../lib/landing-routes';
import { landingProps } from '../lib/landing-server';

export default LandingPage;

export const getServerSideProps: GetServerSideProps<LandingProps> = async (ctx) => {
  const segment = ctx.params?.landing;
  const slug = typeof segment === 'string' ? getLandingSlug(`/${segment}`) : undefined;
  const content = getLandingPage(slug);
  if (!content) return { notFound: true };
  return { props: await landingProps(ctx, content) };
};
