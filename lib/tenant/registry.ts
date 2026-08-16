// Načítání zákaznických konfigurací z adresáře `tenants/`.
//
// Konfigurace je zdroj pravdy pro *podobu* aplikace a je v gitu. V databázi leží jen
// tajemství (šifrovací klíč, hash hesla) a samotná data. Přidání nebo změna zákazníka
// je tedy commit + deploy, což zároveň dává historii změn.

import fs from 'fs';
import path from 'path';
import { TenantConfig } from './types';

const TENANTS_DIR = path.join(process.cwd(), 'tenants');

let cache: { at: number; byId: Map<string, TenantConfig>; bySlug: Map<string, TenantConfig> } | null = null;
const CACHE_MS = process.env.NODE_ENV === 'production' ? 5 * 60 * 1000 : 0;

function readAll(): TenantConfig[] {
  if (!fs.existsSync(TENANTS_DIR)) return [];
  const out: TenantConfig[] = [];
  for (const file of fs.readdirSync(TENANTS_DIR)) {
    if (!file.endsWith('.json')) continue;
    const full = path.join(TENANTS_DIR, file);
    try {
      const config = JSON.parse(fs.readFileSync(full, 'utf8')) as TenantConfig;
      const problem = validateConfig(config);
      if (problem) {
        console.error(`Konfigurace ${file} je neplatná: ${problem}`);
        continue;
      }
      out.push(config);
    } catch (err) {
      console.error(`Nepodařilo se načíst ${file}:`, (err as Error).message);
    }
  }
  return out;
}

function load() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  const byId = new Map<string, TenantConfig>();
  const bySlug = new Map<string, TenantConfig>();
  for (const config of readAll()) {
    if (byId.has(config.id)) {
      console.error(`Duplicitní ID zákazníka: ${config.id}`);
      continue;
    }
    if (bySlug.has(config.slug)) {
      console.error(`Duplicitní slug: ${config.slug}`);
      continue;
    }
    byId.set(config.id, config);
    bySlug.set(config.slug, config);
  }
  cache = { at: Date.now(), byId, bySlug };
  return cache;
}

/** Vrátí popis první chyby, nebo null když je konfigurace v pořádku. */
export function validateConfig(c: TenantConfig): string | null {
  if (!c?.id || !/^[a-z0-9_-]{1,40}$/i.test(c.id)) return 'chybí nebo neplatné "id"';
  if (!c.slug || !/^[a-z0-9]{6,40}$/.test(c.slug)) return 'slug musí být 6–40 znaků a–z/0–9';
  if (!c.title) return 'chybí "title"';

  const seen = new Set<string>();
  const uniq = (kind: string, key: string): string | null => {
    if (!/^[a-zA-Z0-9_]{1,40}$/.test(key)) return `${kind} "${key}": klíč smí být jen a–z, 0–9 a _`;
    const id = `${kind}:${key}`;
    if (seen.has(id)) return `${kind} "${key}" je definovaný dvakrát`;
    seen.add(id);
    return null;
  };

  for (const s of c.scales ?? []) {
    const e = uniq('scale', s.key);
    if (e) return e;
    if (s.direction !== 'higherBetter' && s.direction !== 'higherWorse') {
      return `škála "${s.key}": direction musí být higherBetter nebo higherWorse`;
    }
  }
  for (const m of c.dailyMetrics ?? []) {
    const e = uniq('metric', m.key);
    if (e) return e;
  }
  for (const cat of c.categories ?? []) {
    const e = uniq('category', cat.key);
    if (e) return e;
    for (const f of cat.fields ?? []) {
      if (!/^[a-zA-Z0-9_]{1,40}$/.test(f.key)) return `kategorie "${cat.key}": neplatný klíč pole "${f.key}"`;
      if ((f.type === 'select' || f.type === 'multiselect') && !f.options?.length) {
        return `kategorie "${cat.key}", pole "${f.key}": select potřebuje "options"`;
      }
    }
  }
  if (c.defaultCategory && !(c.categories ?? []).some((cat) => cat.key === c.defaultCategory)) {
    return `defaultCategory "${c.defaultCategory}" není mezi kategoriemi`;
  }
  for (const ep of c.episodes ?? []) {
    const e = uniq('episode', ep.key);
    if (e) return e;
    for (const f of ep.fields ?? []) {
      if (!/^[a-zA-Z0-9_]{1,40}$/.test(f.key)) return `epizoda "${ep.key}": neplatný klíč pole "${f.key}"`;
      if ((f.type === 'select' || f.type === 'multiselect') && !f.options?.length) {
        return `epizoda "${ep.key}", pole "${f.key}": select potřebuje "options"`;
      }
    }
  }
  for (const s of c.entrySymptoms ?? []) {
    const e = uniq('symptom', s.key);
    if (e) return e;
  }
  return null;
}

export function getTenantById(id: string): TenantConfig | null {
  return load().byId.get(id) ?? null;
}

export function getTenantBySlug(slug: string): TenantConfig | null {
  const t = load().bySlug.get(slug) ?? null;
  return t && t.active !== false ? t : null;
}

export function listTenants(): TenantConfig[] {
  return Array.from(load().byId.values()).sort((a, b) => a.id.localeCompare(b.id));
}

export function tenantsDir(): string {
  return TENANTS_DIR;
}
