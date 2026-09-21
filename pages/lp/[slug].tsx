import type { GetServerSideProps } from 'next';
import LandingPage, { type LandingProps } from '../../components/marketing/LandingPage';
import { getLandingPage } from '../../lib/landing-pages';
import { landingProps } from '../../lib/landing-server';

export default LandingPage;
export const getServerSideProps: GetServerSideProps<LandingProps> = async (ctx) => {
  const content = getLandingPage(ctx.params?.slug);
  if (!content) return { notFound: true };
  return { props: await landingProps(ctx, content) };
};
