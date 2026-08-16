#!/usr/bin/env node
/* eslint-disable no-console */
// Správa zákazníků z příkazové řádky.
//
//   node scripts/tenant.js list
//   node scripts/tenant.js create 1151 --name "Jan Novák" --from roman
//   node scripts/tenant.js provision 1151                (konfigurace už je v gitu, jen dogenerovat klíč a heslo)
//   node scripts/tenant.js passwd 1151
//   node scripts/tenant.js healthkey 1151
//   node scripts/tenant.js info 1151
//   node scripts/tenant.js migrate-legacy roman        (jednorázově: staré nešifrované záznamy → zákazník)
//   node scripts/tenant.js delete 1151 --yes           (smaže data i klíč = nevratné)
//
// Konfigurace aplikace žije v tenants/<id>.json a patří do gitu.
// Tajemství (datový klíč, hash hesla) jdou jen do databáze, nikdy do souborů.

const fs = require('fs');
const path = require('path');

require('./load-env');
const lib = require('./lib');

const { getDb, DAYS, LABS, TENANTS, ensureIndexes } = lib('db');
const store = lib('store');
const { createTenantSecrets, setHealthKey, upsertUser, deleteTenantData, listUsers } = store;
const { randomToken } = lib('crypto');
const { hashPassword, generatePassword } = lib('password');
const { listTenants, getTenantById, validateConfig } = lib('tenant/registry');

const TENANTS_DIR = path.join(process.cwd(), 'tenants');

function arg(flag, fallback = undefined) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : fallback;
}

function has(flag) {
  return process.argv.includes(flag);
}

function baseUrl() {
  return (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

async function cmdList() {
  const configs = listTenants();
  if (!configs.length) return console.log('Zatím žádní zákazníci.');
  const db = await getDb();
  console.log('');
  for (const c of configs) {
    const secrets = await db.collection(TENANTS).findOne({ tenantId: c.id });
    const users = await listUsers(c.id);
    const days = await db.collection(DAYS).countDocuments({ tenantId: c.id });
    const labs = await db.collection(LABS).countDocuments({ tenantId: c.id });
    console.log(`${c.id.padEnd(10)} ${c.customer || c.title}`);
    console.log(`  URL:    ${baseUrl()}/t/${c.slug}`);
    console.log(`  Stav:   ${secrets ? 'klíč OK' : '⚠ chybí datový klíč'} · ${users.length} účtů · ${days} dní · ${labs} odběrů`);
    console.log(`  Moduly: ${Object.entries(c.modules || {}).filter(([, v]) => v !== false).map(([k]) => k).join(', ') || '—'}`);
    console.log('');
  }
}

async function cmdCreate(id) {
  if (!id) throw new Error('Použití: create <id> [--name "Jméno"] [--from <id vzoru>]');
  if (!/^[a-z0-9_-]{1,40}$/i.test(id)) throw new Error('ID smí obsahovat jen písmena, číslice, _ a -.');
  const file = path.join(TENANTS_DIR, `${id}.json`);
  if (fs.existsSync(file)) throw new Error(`tenants/${id}.json už existuje.`);

  const from = arg('--from');
  const template = from ? getTenantById(from) : null;
  if (from && !template) throw new Error(`Vzor ${from} neexistuje.`);

  const slug = randomToken(8);
  const config = template
    ? { ...JSON.parse(JSON.stringify(template)), id, slug, customer: arg('--name', ''), notes: `${new Date().toISOString().slice(0, 10)}: založeno podle ${from}.` }
    : {
        id,
        slug,
        customer: arg('--name', ''),
        title: arg('--title', 'Můj deník'),
        subtitle: 'Denní zápisky a přehled',
        theme: { brand: '#0f766e', brandDark: '#115e59', accent: '#7c3aed' },
        modules: { health: true, labs: false, export: true, history: true },
        scales: [
          { key: 'energy', label: 'Energie', direction: 'higherBetter', hint: '1 = vyčerpaný, 10 = plná energie' },
          { key: 'mood', label: 'Nálada', direction: 'higherBetter', hint: '1 = velmi špatná, 10 = výborná' },
        ],
        dailyMetrics: [],
        categories: [
          { key: 'jidlo', label: 'Jídlo', emoji: '🍽️', color: '#16a34a', placeholder: 'Co jsi jedl?' },
          { key: 'poznamka', label: 'Poznámka', emoji: '📝', color: '#6b7280', placeholder: 'Cokoli dalšího' },
        ],
        episodes: [],
        entrySymptoms: [],
        export: { maxLagDays: 14 },
        notes: `${new Date().toISOString().slice(0, 10)}: založeno.`,
      };

  const problem = validateConfig(config);
  if (problem) throw new Error(`Vygenerovaná konfigurace je neplatná: ${problem}`);

  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  await ensureIndexes();
  await createTenantSecrets(id);
  const password = generatePassword();
  await upsertUser({ tenantId: id, userId: 'owner', label: arg('--name', ''), role: 'owner', passwordHash: await hashPassword(password) });
  const healthKey = randomToken(24);
  await setHealthKey(id, healthKey);

  console.log(`\n✅ Zákazník ${id} založen.\n`);
  console.log(`  Konfigurace:  tenants/${id}.json  (uprav podle přání zákazníka, pak commit + deploy)`);
  console.log(`  URL:          ${baseUrl()}/t/${slug}`);
  console.log(`  Heslo:        ${password}`);
  console.log(`  Health klíč:  ${healthKey}   (do hlavičky x-health-key v Health Auto Export)`);
  console.log('\n  Heslo ani klíč se nikam neukládají v čitelné podobě – ulož si je teď.\n');
}

/** Konfigurace je v gitu, ale databáze zákazníka ještě nezná (nové prostředí, obnova). */
async function cmdProvision(id) {
  const config = getTenantById(id);
  if (!config) throw new Error(`Zákazník ${id} nemá konfiguraci v tenants/.`);
  await ensureIndexes();
  const db = await getDb();
  const existing = await db.collection(TENANTS).findOne({ tenantId: id });
  if (!existing) await createTenantSecrets(id);

  const password = arg('--password') || generatePassword();
  await upsertUser({ tenantId: id, userId: 'owner', label: config.customer || '', role: 'owner', passwordHash: await hashPassword(password) });
  const healthKey = randomToken(24);
  await setHealthKey(id, healthKey);

  console.log(`\n✅ Zákazník ${id} připraven${existing ? ' (datový klíč zůstal původní)' : ''}.\n`);
  console.log(`  URL:          ${baseUrl()}/t/${config.slug}`);
  console.log(`  Heslo:        ${password}`);
  console.log(`  Health klíč:  ${healthKey}\n`);
}

async function cmdPasswd(id) {
  if (!getTenantById(id)) throw new Error(`Zákazník ${id} nemá konfiguraci v tenants/.`);
  const password = arg('--password') || generatePassword();
  await upsertUser({ tenantId: id, userId: 'owner', role: 'owner', passwordHash: await hashPassword(password) });
  console.log(`\n✅ Nové heslo pro ${id}: ${password}\n`);
}

async function cmdHealthKey(id) {
  if (!getTenantById(id)) throw new Error(`Zákazník ${id} nemá konfiguraci v tenants/.`);
  // --key umožní zachovat klíč, který už je nastavený v telefonu.
  const key = arg('--key') || randomToken(24);
  await setHealthKey(id, key);
  console.log(`\n✅ Health klíč pro ${id}: ${key}\n`);
}

async function cmdInfo(id) {
  const config = getTenantById(id);
  if (!config) throw new Error(`Zákazník ${id} neexistuje.`);
  const db = await getDb();
  const secrets = await db.collection(TENANTS).findOne({ tenantId: id });
  const users = await listUsers(id);
  console.log(`\n${config.id} – ${config.customer || config.title}`);
  console.log(`  URL:     ${baseUrl()}/t/${config.slug}`);
  console.log(`  Klíč:    ${secrets ? 'ano' : '⚠ chybí (spusť create)'} · health klíč: ${secrets?.healthKeyHash ? 'nastaven' : 'není'}`);
  console.log(`  Účty:    ${users.map((u) => `${u.userId} (${u.role})`).join(', ') || '—'}`);
  console.log(`  Dní:     ${await db.collection(DAYS).countDocuments({ tenantId: id })}`);
  console.log(`  Odběrů:  ${await db.collection(LABS).countDocuments({ tenantId: id })}`);
  console.log(`  Škály:   ${(config.scales || []).map((s) => s.key).join(', ') || '—'}`);
  console.log(`  Metriky: ${(config.dailyMetrics || []).map((m) => m.key).join(', ') || '—'}`);
  console.log(`  Poznámka: ${config.notes || '—'}\n`);
}

/** Jednorázová migrace dat z jednouživatelské verze: doplní tenantId tam, kde chybí. */
async function cmdMigrateLegacy(id) {
  const config = getTenantById(id);
  if (!config) throw new Error(`Zákazník ${id} neexistuje.`);
  const db = await getDb();
  const days = await db.collection(DAYS).updateMany({ tenantId: { $exists: false } }, { $set: { tenantId: id } });
  const labs = await db.collection(LABS).updateMany({ tenantId: { $exists: false } }, { $set: { tenantId: id } });
  await ensureIndexes();
  console.log(`\n✅ Přiřazeno zákazníkovi ${id}: ${days.modifiedCount} dní, ${labs.modifiedCount} odběrů.`);
  console.log('   Data zůstávají nešifrovaná, dokud se poprvé neuloží (pak se přepíšou zašifrovaná).');
  console.log('   Pro okamžité zašifrování spusť: node scripts/tenant.js encrypt ' + id + '\n');
}

/** Přešifruje všechny dosud nešifrované dokumenty zákazníka. */
async function cmdEncrypt(id) {
  const config = getTenantById(id);
  if (!config) throw new Error(`Zákazník ${id} neexistuje.`);
  const { getTenantSecrets, getDay, saveDay, getLab, saveLab, getLabPdf } = store;
  const secrets = await getTenantSecrets(id);
  if (!secrets) throw new Error(`Zákazník ${id} nemá datový klíč.`);
  const db = await getDb();

  const days = await db.collection(DAYS).find({ tenantId: id, enc: { $exists: false } }).project({ date: 1 }).toArray();
  for (const d of days) {
    const data = await getDay(id, secrets.dek, d.date);
    await saveDay(id, secrets.dek, d.date, data);
  }

  const labs = await db.collection(LABS).find({ tenantId: id, enc: { $exists: false } }).project({ date: 1 }).toArray();
  for (const l of labs) {
    const lab = await getLab(id, secrets.dek, l.date);
    const pdf = await getLabPdf(id, secrets.dek, l.date);
    await saveLab(id, secrets.dek, l.date, {
      meta: lab?.meta ?? {},
      values: lab?.values ?? [],
      pdf: pdf ? { filename: pdf.filename, contentType: pdf.contentType, bytes: pdf.bytes } : undefined,
    });
  }
  console.log(`\n✅ Zašifrováno: ${days.length} dní, ${labs.length} odběrů zákazníka ${id}.\n`);
}

async function cmdDelete(id) {
  if (!has('--yes')) throw new Error('Nevratné. Přidej --yes, pokud to opravdu chceš.');
  const result = await deleteTenantData(id);
  const file = path.join(TENANTS_DIR, `${id}.json`);
  if (fs.existsSync(file)) fs.renameSync(file, `${file}.smazano`);
  console.log(`\n✅ Smazáno: ${result.days} dní, ${result.labs} odběrů, účty i datový klíč zákazníka ${id}.`);
  console.log(`   Konfigurace přejmenována na tenants/${id}.json.smazano\n`);
}

async function main() {
  const [cmd, id] = process.argv.slice(2);
  switch (cmd) {
    case 'list':
      return cmdList();
    case 'create':
      return cmdCreate(id);
    case 'provision':
      return cmdProvision(id);
    case 'passwd':
      return cmdPasswd(id);
    case 'healthkey':
      return cmdHealthKey(id);
    case 'info':
      return cmdInfo(id);
    case 'migrate-legacy':
      return cmdMigrateLegacy(id);
    case 'encrypt':
      return cmdEncrypt(id);
    case 'delete':
      return cmdDelete(id);
    default:
      console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 16).join('\n').replace(/^\/\/ ?/gm, ''));
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\n❌ ${err.message}\n`);
    process.exit(1);
  });
