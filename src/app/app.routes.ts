import { Routes } from '@angular/router';
import { redirectToNextStep, signedInGuard, stepGuard } from './core/guards';

export const routes: Routes = [
  {
    path: 'connexion',
    canActivate: [stepGuard('connexion')],
    loadComponent: () => import('./pages/auth').then((m) => m.AuthPage),
    title: 'title.signin',
  },
  {
    path: 'pseudo',
    canActivate: [stepGuard('pseudo')],
    loadComponent: () => import('./pages/pseudo').then((m) => m.PseudoPage),
    title: 'title.pseudo',
  },
  {
    path: 'releve',
    canActivate: [stepGuard('releve')],
    loadComponent: () => import('./pages/releve').then((m) => m.RelevePage),
    title: 'title.releve',
  },
  {
    path: 'conversation',
    canActivate: [stepGuard('conversation')],
    loadComponent: () => import('./pages/conversation').then((m) => m.ConversationPage),
    title: 'title.chat',
  },
  {
    path: 'compte',
    canActivate: [signedInGuard],
    loadComponent: () => import('./pages/account').then((m) => m.AccountPage),
    title: 'title.account',
  },
  {
    // Target of the "forgot password" email; no step guard (the link itself signs the user in).
    path: 'nouveau-mot-de-passe',
    loadComponent: () => import('./pages/new-password').then((m) => m.NewPasswordPage),
    title: 'title.newPassword',
  },
  { path: '**', canActivate: [redirectToNextStep], children: [] },
];
