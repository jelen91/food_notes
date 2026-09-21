import type { GetServerSideProps } from 'next';
import LandingPage, { type LandingProps } from '../components/marketing/LandingPage';
import { HOME_CONTENT } from '../lib/landing-pages';
import { landingProps } from '../lib/landing-server';

export default LandingPage;

export const getServerSideProps: GetServerSideProps<LandingProps> = async (ctx) => {
  const slug = process.env.DEFAULT_TENANT_SLUG;
  if (slug) return { redirect: { destination: `/t/${slug}`, permanent: false } };
  return { props: await landingProps(ctx, HOME_CONTENT) };
};
