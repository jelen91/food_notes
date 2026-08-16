import { ReactNode } from 'react';
import Head from 'next/head';
import Link from 'next/link';

/** Neutrální sdělení o povaze produktu. Zobrazuje se v onboardingu, v účtu a v exportu. */
export const DISCLAIMER =
  'Záznamník slouží ke sledování vlastních pozorování a souvislostí. Neprovádí diagnózu a nenahrazuje lékařské vyšetření.';

export function Disclaimer() {
  return <p className="hint">{DISCLAIMER}</p>;
}

/** Pruh se značkou. Stejný na úvodní stránce, v aplikaci i v denících zákazníků. */
export function TopBar({ href = '/', action }: { href?: string; action?: ReactNode }) {
  return (
    <div className="topbar">
      <div className="topbar-in">
        <Link className="mark" href={href}>
          Deník pozorování
        </Link>
        {action}
      </div>
    </div>
  );
}

/**
 * Rám pro všechny obrazovky aplikace: pruh se značkou, název obrazovky v proudu
 * textu a jeden sloupec obsahu — stejná kostra jako úvodní stránka.
 */
export default function AppShell({
  title,
  subtitle,
  children,
  back,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Odkaz vpravo v pruhu se značkou (např. zpět do deníku). */
  back?: { href: string; label: string };
}) {
  return (
    <div className="page">
      <Head>
        <title>{title}</title>
        <meta name="theme-color" content="#f6f2ea" />
      </Head>

      <TopBar
        action={
          back && (
            <Link className="hdr-btn" href={back.href}>
              {back.label}
            </Link>
          )
        }
      />

      <div className="wrap">
        <div className="hdr">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
