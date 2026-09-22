import type { AppProps } from 'next/app';
import Head from 'next/head';
import '../styles/globals.css';
import '../styles/marketing.css';
import '../styles/marketing-guide.css';
import '../styles/analysis.css';
import '../styles/brand.css';
import { BRAND } from '../lib/brand';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>{BRAND.name}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content={BRAND.themeColor} />
        <meta name="application-name" content={BRAND.name} />
        <meta name="apple-mobile-web-app-title" content={BRAND.name} />
        <link rel="icon" href="/brand/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/brand/icon-192.png" type="image/png" sizes="192x192" />
        <link rel="apple-touch-icon" href="/brand/apple-touch-icon.png" />
        <link rel="manifest" href="/brand/site.webmanifest" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
