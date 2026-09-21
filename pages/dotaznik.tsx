// První krok pro nového zákazníka: dotazník bez účtu a bez placení.
//
// Vyplňuje se po částech – jedna sekce na obrazovku. Odpovědi se tiše ukládají při
// každém posunu dál, takže nedokončený dotazník jde dopsat i za týden.

import { useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import type { GetServerSideProps } from 'next';
import { TopBar } from '../components/AppShell';
import { ChipGroup, Field, Msg } from '../components/ui';
import { missingRequired } from '../lib/questionnaire';
import { getLandingPage } from '../lib/landing-pages';
import { QUESTIONNAIRE_CONSENT_TEXT, QUESTIONNAIRE_CONSENT_VERSION } from '../lib/consent';
import type { Answers, QuestionDef, QuestionnaireSection } from '../lib/questionnaire';

interface Definition {
  version: number;
  sections: QuestionnaireSection[];
}

function Question({
  q,
  value,
  onChange,
  chyba,
}: {
  q: QuestionDef;
  value: string | string[] | undefined;
  onChange: (v: string | string[] | undefined) => void;
  chyba?: string;
}) {
  if (q.type === 'multi' || q.type === 'single') {
    const selected = Array.isArray(value) ? value : value ? [String(value)] : [];
    return (
      <div
        data-chyba={chyba ? '1' : undefined}
        role="group"
        aria-label={q.label}
        aria-describedby={chyba ? `error-${q.id}` : undefined}
      >
        <label className="label">
          {q.label}
          {q.required && ' *'}
        </label>
        {q.help && (
          <p className="hint" style={{ marginTop: 0, marginBottom: 6 }}>
            {q.help}
          </p>
        )}
        <ChipGroup
          options={(q.options ?? []).map((o) => ({ key: o, label: o }))}
          selected={selected}
          onToggle={(key) => {
            if (q.type === 'single') {
              onChange(selected.includes(key) ? undefined : key);
              return;
            }
            const next = selected.includes(key) ? selected.filter((x) => x !== key) : [...selected, key];
            onChange(next.length ? next : undefined);
          }}
        />
        {chyba && (
          <p className="chyba" id={`error-${q.id}`} role="alert">
            {chyba}
          </p>
        )}
      </div>
    );
  }

  return (
    <div data-chyba={chyba ? '1' : undefined}>
      <Field label={`${q.label}${q.required ? ' *' : ''}`}>
        {q.help && (
          <p className="hint" style={{ marginTop: -2, marginBottom: 6 }}>
            {q.help}
          </p>
        )}
        {q.type === 'longtext' ? (
          <textarea
            id={`question-${q.id}`}
            aria-label={q.label}
            aria-invalid={Boolean(chyba)}
            className={`textarea${chyba ? ' vadne' : ''}`}
            rows={3}
            maxLength={q.maxLength}
            placeholder={q.placeholder}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value || undefined)}
          />
        ) : (
          <input
            id={`question-${q.id}`}
            aria-label={q.label}
            aria-invalid={Boolean(chyba)}
            className={`input${chyba ? ' vadne' : ''}`}
            maxLength={q.maxLength}
            placeholder={q.placeholder}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value || undefined)}
          />
        )}
        {chyba && (
          <p className="chyba" id={`error-${q.id}`} role="alert">
            {chyba}
          </p>
        )}
      </Field>
    </div>
  );
}

interface Props {
  /** Otázky i rozepsané odpovědi chodí ze serveru, ať první obrazovka trychtýře nebliká. */
  definition: Definition;
  ulozene: Answers;
  temaTitle: string | null;
}

export default function Dotaznik({ definition, ulozene, temaTitle }: Props) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>(ulozene);
  const [step, setStep] = useState(0);
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  /** Chybějící povinné odpovědi, klíčem je id otázky – hlásí se hned u pole. */
  const [chyby, setChyby] = useState<Record<string, string>>({});

  const setAnswer = (id: string, value: string | string[] | undefined) => {
    setAnswers((prev) => {
      const next = { ...prev };
      if (value === undefined) delete next[id];
      else next[id] = value;
      return next;
    });
    // Jakmile člověk odpoví, hláška u pole zmizí – nemá na co koukat déle, než je potřeba.
    if (value !== undefined) setChyby((prev) => (prev[id] ? { ...prev, [id]: undefined as any } : prev));
  };

  const save = async (submit: boolean): Promise<boolean> => {
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/questionnaire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, submit, consent, consentVersion: QUESTIONNAIRE_CONSENT_VERSION }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIsError(true);
        setMessage(data.problems?.length ? data.problems.join(' · ') : data.error || 'Uložení selhalo.');
        return false;
      }
      if (submit) {
        await router.push(data.next || '/app/platba');
      }
      return true;
    } catch {
      setIsError(true);
      setMessage('Síťová chyba. Zkus to prosím znovu.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const sections = definition.sections;
  const total = sections.length + 1; // sekce + kontrola
  const allQuestions = sections.flatMap((s) => s.questions);
  const answered = (q: QuestionDef) => {
    const v = answers[q.id];
    return Array.isArray(v) ? v.length > 0 : Boolean(v && String(v).trim());
  };

  /** Povinné otázky se kontrolují po sekcích, ne až při odeslání. */
  const chybejici = (qs: QuestionDef[]) => missingRequired(answers, qs);

  const goForward = async () => {
    const problemy = chybejici(sections[step]?.questions ?? []);
    if (Object.keys(problemy).length) {
      setChyby(problemy);
      setIsError(true);
      setMessage('Ještě chybí odpověď níž.');
      const prvni = document.querySelector('[data-chyba="1"]');
      prvni?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setChyby({});
    // Uložení je tiché; když selže, zůstáváme na místě a chyba se ukáže.
    const ok = await save(false);
    if (!ok) return;
    setStep((s) => Math.min(s + 1, total - 1));
    window.scrollTo({ top: 0 });
  };

  /**
   * Poslední pojistka před odesláním. Kdyby se povinná odpověď ztratila (třeba návratem
   * a smazáním), vrátíme se rovnou do sekce, kde chybí – ne aby to člověk hledal.
   */
  const submitAll = async () => {
    const problemy = chybejici(allQuestions);
    if (Object.keys(problemy).length) {
      const kde = sections.findIndex((sec) => sec.questions.some((q) => problemy[q.id]));
      setChyby(problemy);
      setIsError(true);
      setMessage('Ještě chybí povinná odpověď.');
      if (kde >= 0) setStep(kde);
      window.scrollTo({ top: 0 });
      return;
    }
    await save(true);
  };

  const goBack = () => {
    setStep((s) => Math.max(0, s - 1));
    window.scrollTo({ top: 0 });
  };

  const shell = (children: React.ReactNode, subtitle?: string) => (
    <div className="page">
      <Head>
        <title>Sestavíme deník na míru</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="theme-color" content="#f6f2ea" />
      </Head>
      <TopBar />
      <div className="wrap">
        <div className="hdr">
          <h1>Sestavíme deník na míru</h1>
          {subtitle && <p>{subtitle}</p>}
          {consentConfirmed && (
            <div
              role="progressbar"
              aria-label="Průběh dotazníku"
              aria-valuemin={1}
              aria-valuemax={total}
              aria-valuenow={Math.min(step + 1, total)}
              style={{ height: 6, marginTop: 16, borderRadius: 6, background: 'var(--rule-soft)' }}
            >
              <span
                style={{
                  display: 'block',
                  height: '100%',
                  borderRadius: 6,
                  background: 'var(--accent, #426851)',
                  width: `${(Math.min(step + 1, total) / total) * 100}%`,
                }}
              />
            </div>
          )}
        </div>
        {children}
      </div>
    </div>
  );

  if (!consentConfirmed) {
    return shell(
      <section className="card">
        <h2>Začni tím, čemu chceš lépe porozumět</h2>
        {temaTitle && (
          <p className="hint">Zaměření: {temaTitle}. Úvodní otázku můžeš upravit vlastními slovy.</p>
        )}
        <p className="muted">
          Dotazník je zdarma a bez registrace. Na konci uvidíš shrnutí odpovědí a cenu. Osobní deník sestavíme
          až po zaplacení.
        </p>
        <div className="questionnaire-value">
          <h3>Tvůj cíl. Tvůj den. Tvůj deník.</h3>
          <p>
            AI z odpovědí vybere, co má smysl pravidelně sledovat, proč a v jaké podobě. Zohlední i čas, který
            na zápisy máš. Konkrétní odpovědi jí pomohou navrhnout užitečnější deník.
          </p>
          <p>
            V ceně pak získáš jedno AI vyhodnocení vlastních záznamů: souvislosti, možná vysvětlení a další
            směr. Odemkne se po 21 dnech od platby a alespoň 21 různých dnech se záznamem od platby. Spustíš
            ho až na svůj pokyn a se samostatným souhlasem.
          </p>
        </div>
        <h3 style={{ marginTop: 20 }}>Než začneš: jak použijeme odpovědi</h3>
        <ul className="muted" style={{ paddingLeft: 18, lineHeight: 1.7, marginTop: 12 }}>
          <li>Odpovědi mohou obsahovat údaje o zdraví. Při pokračování je uložíme zašifrovaně.</li>
          <li>
            Po platbě je pro sestavení polí deníku zpracuje Claude (Anthropic). Přidáme jen otázky a odpovědi,
            žádné údaje z účtu nebo platby.
          </li>
          <li>
            Nepiš jméno, adresu ani jiné údaje, které pro deník nejsou potřeba. Nepovinné otázky můžeš
            přeskočit.
          </li>
          <li>Deník slouží k vlastním pozorováním a nenahrazuje lékařskou péči.</li>
        </ul>
        <p className="hint">
          <Link href="/jak-chranime-data" target="_blank" rel="noreferrer">
            Jak chráníme data a kdo je zpracovává
          </Link>
        </p>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 16 }}>
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            style={{ marginTop: 4 }}
          />
          <span>{QUESTIONNAIRE_CONSENT_TEXT}</span>
        </label>
        <button
          className="btn btn-primary btn-block"
          style={{ marginTop: 16 }}
          disabled={!consent}
          onClick={() => setConsentConfirmed(true)}
        >
          Přejít k otázkám
        </button>
        <p className="hint">
          <Link href="/">Zpět na úvod</Link>
        </p>
      </section>,
      'Čtyři krátké části. Povinné jsou jen tři odpovědi.'
    );
  }

  const stepLabel = `Krok ${Math.min(step + 1, total)} z ${total}`;

  if (step >= sections.length) {
    const filled = allQuestions.filter(answered);
    return shell(
      <>
        <section className="card">
          <h2>Kontrola odpovědí</h2>
          {filled.map((q) => (
            <div key={q.id} style={{ borderTop: '1px solid var(--rule-soft)', padding: '10px 0' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{q.label}</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>
                {Array.isArray(answers[q.id])
                  ? (answers[q.id] as string[]).join(', ')
                  : String(answers[q.id])}
              </div>
            </div>
          ))}
          {filled.length === 0 && <p className="muted">Zatím nic nevyplněno.</p>}
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={goBack}>
            Zpět k úpravám
          </button>
        </section>

        <section className="card">
          <h2>Připraveno ke shrnutí a ceně</h2>
          <ul className="muted" style={{ paddingLeft: 18, lineHeight: 1.6 }}>
            <li>
              Po zaplacení se odpovědi použijí k sestavení deníku na míru. Zpracuje je jazykový model Claude
              (Anthropic); posíláme jen otázky a odpovědi, nepřidáváme údaje z účtu ani platby.
            </li>
            <li>Nástroj nestanovuje diagnózu a nenahrazuje lékařskou péči.</li>
            <li>
              Nevyplňuj nic, co nechceš mít zpracované — všechna pole kromě označených hvězdičkou jsou
              nepovinná.
            </li>
            <li>
              Máš-li akutní zdravotní potíže, obrať se prosím na lékařskou pomoc, ne na tento záznamník.
            </li>
          </ul>
          <p className="hint">
            <Link href="/jak-chranime-data" target="_blank" rel="noreferrer">
              Jak chráníme data a kdo je zpracovává
            </Link>
          </p>

          <label
            style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12, cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span style={{ fontSize: '0.9rem' }}>{QUESTIONNAIRE_CONSENT_TEXT}</span>
          </label>

          <div className="btns" style={{ marginTop: 14 }}>
            <button className="btn btn-primary" disabled={!consent || busy} onClick={submitAll}>
              {busy ? 'Ukládám…' : 'Zobrazit shrnutí a cenu'}
            </button>
          </div>
          <Msg text={message} error={isError} />
        </section>
      </>,
      stepLabel
    );
  }

  const section = sections[step];
  const last = step === sections.length - 1;

  return shell(
    <>
      <section className="card">
        <h2>{section.title}</h2>
        {section.description && (
          <p className="hint" style={{ marginTop: -4 }}>
            {section.description}
          </p>
        )}
        <div className="stack" style={{ marginTop: 12 }}>
          {section.questions.map((q) => (
            <Question
              key={q.id}
              q={q}
              value={answers[q.id]}
              chyba={chyby[q.id]}
              onChange={(v) => setAnswer(q.id, v)}
            />
          ))}
        </div>

        <div className="btns" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" disabled={busy} onClick={goForward}>
            {busy ? 'Ukládám…' : last ? 'Zkontrolovat' : 'Pokračovat'}
          </button>
          {step > 0 && (
            <button className="btn btn-ghost" disabled={busy} onClick={goBack}>
              Zpět
            </button>
          )}
        </div>
        <Msg text={message} error={isError} />
        <p className="hint">
          Hvězdička označuje povinné otázky. Ostatní vyplň jen pokud chceš. Odpovědi se uloží při klepnutí na
          Pokračovat.
        </p>
      </section>
    </>,
    stepLabel
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  ctx.res.setHeader('Cache-Control', 'private, no-store');
  const { QUESTIONNAIRE } = await import('../lib/questionnaire');
  const definition = QUESTIONNAIRE as Definition;
  const tema = getLandingPage(typeof ctx.query.tema === 'string' ? ctx.query.tema : '');
  const temaTitle = tema?.title ?? null;
  const initial: Answers = tema ? { hlavni_otazka: tema.questionnairePrompt } : {};
  const propsFor = (saved: Answers = {}) => ({
    definition,
    ulozene: Object.keys(saved).length ? saved : initial,
    temaTitle,
  });

  try {
    const { DRAFT_COOKIE, draftIdFromCookie, getDraft } = await import('../lib/drafts');
    const { ACCOUNT_COOKIE, verifyAccountSession } = await import('../lib/session');
    const { findAccountById } = await import('../lib/accounts');
    const { getTenantSecrets } = await import('../lib/store');
    const { getQuestionnaire } = await import('../lib/tracker/store');

    // Rozepsané odpovědi patří buď draftu z cookie, nebo přihlášenému účtu.
    let tenantId: string | null = null;
    const session = await verifyAccountSession(
      process.env.AUTH_SECRET || '',
      ctx.req.cookies[ACCOUNT_COOKIE]
    );
    const account = session ? await findAccountById(session.a) : null;
    if (account && account.status !== 'deleted' && account.tenantId) tenantId = account.tenantId;
    else {
      const draft = await getDraft(draftIdFromCookie(ctx.req.cookies[DRAFT_COOKIE]));
      if (draft && !draft.accountId) tenantId = draft.tenantId;
    }
    if (!tenantId) return { props: propsFor() };

    const secrets = await getTenantSecrets(tenantId);
    if (!secrets) return { props: propsFor() };
    const record = await getQuestionnaire(tenantId, secrets.dek);
    return { props: propsFor(record.answers ?? {}) };
  } catch (error) {
    // Prázdný dotazník je pořád lepší než rozbitá stránka.
    console.error('rozepsané odpovědi se nepodařilo načíst:', (error as Error).message);
    return { props: propsFor() };
  }
};
