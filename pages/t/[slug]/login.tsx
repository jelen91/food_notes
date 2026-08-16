import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import type { GetServerSideProps } from 'next';
import { TopBar } from '../../../components/AppShell';
import { getTenantBySlug } from '../../../lib/tenant/registry';

interface Props {
  slug: string;
  title: string;
}

export default function TenantLogin({ slug, title }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Přihlášení selhalo.');
        return;
      }
      router.push(data.redirect || `/t/${slug}`);
    } catch (err: any) {
      setError(err.message || 'Síťová chyba.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <Head>
        <title>{title}</title>
        <meta name="theme-color" content="#f6f2ea" />
      </Head>

      <TopBar href={`/t/${slug}/login`} />

      <div className="wrap">
        <div className="hdr">
          <h1>{title}</h1>
          <p>Zadej heslo pro přístup.</p>
        </div>

        <form onSubmit={submit} className="card">
          <input
            type="password"
            className="input"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Heslo"
            style={{ marginBottom: 12 }}
          />
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || !password}>
            {busy ? 'Přihlašuji…' : 'Přihlásit'}
          </button>
          {error && <div className="msg err">{error}</div>}
        </form>
      </div>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const slug = String(ctx.params?.slug ?? '');
  const config = getTenantBySlug(slug);
  if (!config) return { notFound: true };
  return { props: { slug: config.slug, title: config.title } };
};
