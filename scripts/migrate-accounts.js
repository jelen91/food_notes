#!/usr/bin/env node
/* eslint-disable no-console */
// Migrace ručně založených zákazníků na nový model účtů.
//
//   node scripts/migrate-accounts.js status
//   node scripts/migrate-accounts.js legacy roman            # entitlement zdarma, beze změny přihlašování
//   node scripts/migrate-accounts.js legacy --all
//   node scripts/migrate-accounts.js link roman --email a@b.cz --password Heslo12345
//
// `legacy` nechává všechno tak, jak je: zákazník se dál přihlašuje heslem na /t/<slug>,
// konfigurace zůstává v souboru a nikdy není poslán na platbu ani na dotazník.
// `link` navíc založí účet s e-mailem, který ukazuje na stejný workspace — volitelné.

require('./load-env');
const lib = require('./lib');

const { getDb, ACCOUNTS, ENTITLEMENTS, TENANTS, ensureIndexes } = lib('db');
const { listTenants, getTenantById } = lib('tenant/registry');
const { grantLegacyEntitlement } = lib('billing');
const { hashPassword, generatePassword } = lib('password');
const { randomToken } = lib('crypto');

function arg(flag, fallback = undefined) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const has = (flag) => process.argv.includes(flag);

/** Legacy zákazník = tenant ze souboru, jehož účet je "systémový" (nikdy neplatí). */
function legacyAccountId(tenantId) {
  return `acc_legacy_${tenantId}`;
}

async function cmdStatus() {
  const db = await getDb();
  console.log('');
  for (const config of listTenants()) {
    const accountId = legacyAccountId(config.id);
    const ent = await db.collection(ENTITLEMENTS).findOne({ accountId });
    const linked = await db.collection(ACCOUNTS).findOne({ tenantId: config.id }, { projection: { email: 1 } });
    console.log(`${config.id.padEnd(10)} ${config.customer || config.title}`);
    console.log(`  entitlement: ${ent ? `${ent.kind}/${ent.status}` : '—'}`);
    console.log(`  účet:        ${linked?.email ?? '— (přihlašuje se heslem na /t/' + config.slug + ')'}`);
    console.log('');
  }
  const selfServe = await db.collection(ACCOUNTS).countDocuments({ accountId: { $not: /^acc_legacy_/ } });
  console.log(`Samoobslužných účtů: ${selfServe}`);
}

/** Entitlement pro existujícího zákazníka, aby ho nic nikdy neposlalo na platbu. */
async function grantLegacy(tenantId) {
  const config = getTenantById(tenantId);
  if (!config) throw new Error(`Zákazník ${tenantId} nemá konfiguraci v tenants/.`);
  const db = await getDb();
  const accountId = legacyAccountId(tenantId);

  await db.collection(ACCOUNTS).updateOne(
    { accountId },
    {
      $setOnInsert: {
        accountId,
        // Systémový záznam bez přihlašovacích údajů – slouží jen jako nositel entitlementu.
        email: `legacy+${tenantId}@local.invalid`,
        passwordHash: null,
        emailVerifiedAt: null,
        status: 'active',
        tenantId,
        slug: config.slug,
        createdAt: new Date(),
      },
      $set: { onboarding: 'tracker_ready', updatedAt: new Date() },
    },
    { upsert: true }
  );

  const result = await grantLegacyEntitlement(accountId);
  console.log(`  ${tenantId}: entitlement ${result === 'created' ? 'založen' : 'už existoval'}`);
}

async function cmdLegacy(tenantId) {
  await ensureIndexes();
  const targets = has('--all') ? listTenants().map((c) => c.id) : [tenantId];
  if (!targets[0]) throw new Error('Použití: legacy <id> nebo legacy --all');
  console.log('');
  for (const id of targets) await grantLegacy(id);
  console.log('\nPřihlašování ani konfigurace se nezměnily.\n');
}

/** Volitelné: k existujícímu workspace přidá účet s e-mailem a heslem. */
async function cmdLink(tenantId) {
  const config = getTenantById(tenantId);
  if (!config) throw new Error(`Zákazník ${tenantId} neexistuje.`);
  const email = String(arg('--email', '')).trim().toLowerCase();
  if (!email) throw new Error('Chybí --email.');
  const password = arg('--password') || generatePassword();

  await ensureIndexes();
  const db = await getDb();
  const secrets = await db.collection(TENANTS).findOne({ tenantId });
  if (!secrets) throw new Error(`Zákazník ${tenantId} nemá datový klíč (spusť tenant.js provision).`);

  const accountId = `acc_${randomToken(16)}`;
  await db.collection(ACCOUNTS).updateOne(
    { email },
    {
      $setOnInsert: { accountId, email, createdAt: new Date() },
      $set: {
        passwordHash: await hashPassword(password),
        emailVerifiedAt: new Date(),
        status: 'active',
        onboarding: 'tracker_ready',
        tenantId,
        slug: config.slug,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
  const created = await db.collection(ACCOUNTS).findOne({ email }, { projection: { accountId: 1 } });
  await grantLegacyEntitlement(created.accountId);

  console.log(`\n✅ Účet ${email} napojen na ${tenantId}.`);
  console.log(`   Heslo: ${password}`);
  console.log(`   Deník: /t/${config.slug}\n`);
}

async function main() {
  const [cmd, id] = process.argv.slice(2);
  switch (cmd) {
    case 'status':
      return cmdStatus();
    case 'legacy':
      return cmdLegacy(id);
    case 'link':
      return cmdLink(id);
    default:
      console.log('Příkazy: status | legacy <id>|--all | link <id> --email <e-mail> [--password <heslo>]');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\n❌ ${err.message}\n`);
    process.exit(1);
  });
