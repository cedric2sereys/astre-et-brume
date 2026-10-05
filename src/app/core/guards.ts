import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from './session.service';

type Step = 'connexion' | 'pseudo' | 'releve' | 'conversation';
const ORDER: Step[] = ['connexion', 'pseudo', 'releve', 'conversation'];

/** The first onboarding step the user hasn't completed yet. */
function nextStep(session: SessionService): Step {
  if (!session.isLoggedIn()) return 'connexion';
  if (!session.pseudo()) return 'pseudo';
  if (!session.chart()) return 'releve';
  return 'conversation';
}

/**
 * Allows a step the user has already reached. The login page is only for signed-out users;
 * everything else needs a Supabase session (restored first from the browser).
 */
export const stepGuard =
  (step: Step): CanActivateFn =>
  async () => {
    const session = inject(SessionService);
    const router = inject(Router);
    await session.ready;
    const current = nextStep(session);
    const allowed =
      step === 'connexion' ? current === 'connexion' : ORDER.indexOf(step) <= ORDER.indexOf(current);
    return allowed ? true : router.parseUrl(`/${current}`);
  };

export const redirectToNextStep: CanActivateFn = async () => {
  const session = inject(SessionService);
  const router = inject(Router);
  await session.ready;
  return router.parseUrl(`/${nextStep(session)}`);
};
