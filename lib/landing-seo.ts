import { BRAND } from './brand';
import type { LandingPageContent } from './landing-pages';
import { getLandingPath } from './landing-routes';

/** Only public editorial content belongs in structured data, never resume/account data. */
export function landingStructuredData(content: LandingPageContent) {
  const url = `${BRAND.origin}${getLandingPath(content.slug)}`;
  const website = {
    '@type': 'WebSite',
    '@id': `${BRAND.origin}/#website`,
    url: `${BRAND.origin}/`,
    name: BRAND.name,
    inLanguage: 'cs',
  };
  const page = {
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: content.metaTitle,
    description: content.description,
    inLanguage: 'cs',
    isPartOf: { '@id': website['@id'] },
    ...(content.slug ? { breadcrumb: { '@id': `${url}#breadcrumb` } } : {}),
  };
  const breadcrumbs = content.slug ? [{
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: BRAND.name, item: `${BRAND.origin}/` },
      { '@type': 'ListItem', position: 2, name: content.title, item: url },
    ],
  }] : [];
  return { '@context': 'https://schema.org', '@graph': [website, page, ...breadcrumbs] };
}

export function serializeStructuredData(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
