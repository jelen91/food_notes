/** Veřejné adresy lze měnit bez změny témat v dotaznících a uložených objednávkách. */
export const LANDING_ROUTES = {
  traveni: '/potize-s-travenim',
  migreny: '/migreny-a-bolesti-hlavy',
  unava: '/unava-a-nedostatek-energie',
} as const;

export type LandingSlug = keyof typeof LANDING_ROUTES;

export function getLandingPath(slug: string): string {
  if (slug === '') return '/';
  if (Object.prototype.hasOwnProperty.call(LANDING_ROUTES, slug)) {
    return LANDING_ROUTES[slug as LandingSlug];
  }
  throw new Error(`Unknown landing page: ${slug}`);
}

export function getLandingSlug(pathname: unknown): LandingSlug | undefined {
  if (typeof pathname !== 'string') return undefined;
  return (Object.keys(LANDING_ROUTES) as LandingSlug[]).find(
    (slug) => LANDING_ROUTES[slug] === pathname
  );
}
