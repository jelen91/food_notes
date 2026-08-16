import { describe, expect, it } from 'vitest';
import { TRANSITIONS, isAllowedTransition, nextStepPath, statesLeadingTo } from '../lib/onboarding';

describe('stavový automat onboardingu', () => {
  it('povolené přechody odpovídají cestě zákazníka', () => {
    expect(isAllowedTransition('unpaid', 'checkout_started')).toBe(true);
    expect(isAllowedTransition('checkout_started', 'paid')).toBe(true);
    expect(isAllowedTransition('paid', 'questionnaire_completed')).toBe(true);
    expect(isAllowedTransition('tracker_generating', 'tracker_ready')).toBe(true);
  });

  it('nepovolené skoky neprojdou', () => {
    // Klíčové: přeskočit onboarding nejde.
    expect(isAllowedTransition('unpaid', 'tracker_ready')).toBe(false);
    expect(isAllowedTransition('unpaid', 'questionnaire_completed')).toBe(false);
    expect(isAllowedTransition('paid', 'tracker_ready')).toBe(false);
    expect(isAllowedTransition('tracker_ready', 'paid')).toBe(false);
  });

  it('platba potvrzená mimo náš checkout stav posune', () => {
    // Platební odkaz nebo výpadek při zápisu `checkout_started` nesmí zákazníka zaseknout.
    expect(isAllowedTransition('unpaid', 'paid')).toBe(true);
  });

  it('po chybě generování jde zkusit znovu', () => {
    expect(isAllowedTransition('tracker_failed', 'tracker_queued')).toBe(true);
  });

  it('do stavu paid vedou jen stavy před dokončenou platbou', () => {
    expect(statesLeadingTo('paid').sort()).toEqual(['checkout_started', 'payment_pending', 'unpaid']);
  });

  it('žádný přechod nevede do neexistujícího stavu', () => {
    const states = Object.keys(TRANSITIONS);
    for (const [from, targets] of Object.entries(TRANSITIONS)) {
      for (const to of targets) {
        expect(states, `${from} → ${to}`).toContain(to);
      }
    }
  });
});

describe('směrování podle stavu', () => {
  it('bez přístupu vede všechno na platbu', () => {
    expect(nextStepPath('paid', false, 'abc123xy')).toBe('/app/platba');
    expect(nextStepPath('tracker_ready', false, 'abc123xy')).toBe('/app/platba');
  });

  it('zaplacený zákazník jde na dotazník', () => {
    expect(nextStepPath('paid', true)).toBe('/dotaznik');
  });

  it('s platným přístupem nezacyklí ani zaostalý stav onboardingu', () => {
    // Entitlement je zdroj pravdy; stav onboardingu je jen vodítko pro UI.
    expect(nextStepPath('unpaid', true)).toBe('/dotaznik');
    expect(nextStepPath('checkout_started', true)).toBe('/dotaznik');
  });

  it('hotový tracker vede do samoobslužného deníku', () => {
    // /t/<slug> patří ručně stavěným zákazníkům; samoobslužní píší do /app/denik.
    expect(nextStepPath('tracker_ready', true, 'abc123xy')).toBe('/app/denik');
  });
});
