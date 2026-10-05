import { Routes } from '@angular/router';
import { redirectToNextStep, stepGuard } from './core/guards';

export const routes: Routes = [
  {
    path: 'connexion',
    canActivate: [stepGuard('connexion')],
    loadComponent: () => import('./pages/auth').then((m) => m.AuthPage),
    title: 'Connexion · Astre & Brume',
  },
  {
    path: 'pseudo',
    canActivate: [stepGuard('pseudo')],
    loadComponent: () => import('./pages/pseudo').then((m) => m.PseudoPage),
    title: 'Première visite · Astre & Brume',
  },
  {
    path: 'releve',
    canActivate: [stepGuard('releve')],
    loadComponent: () => import('./pages/releve').then((m) => m.RelevePage),
    title: 'Relevé de naissance · Astre & Brume',
  },
  {
    path: 'conversation',
    canActivate: [stepGuard('conversation')],
    loadComponent: () => import('./pages/conversation').then((m) => m.ConversationPage),
    title: 'Conversation · Astre & Brume',
  },
  {
    // Target of the "forgot password" email; no step guard (the link itself signs the user in).
    path: 'nouveau-mot-de-passe',
    loadComponent: () => import('./pages/new-password').then((m) => m.NewPasswordPage),
    title: 'Nouveau mot de passe · Astre & Brume',
  },
  { path: '**', canActivate: [redirectToNextStep], children: [] },
];
