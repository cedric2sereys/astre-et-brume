import { Injectable, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

export type Lang = 'fr' | 'en';
export const LANGS: Lang[] = ['fr', 'en'];

/** Minimum password length, mirrored from Supabase (see session.service.ts). */
export const MIN_PASSWORD_LENGTH = 8;

// ---------------------------------------------------------------------------------------
// Dictionaries. FR defines the keys; EN must provide every one of them (checked at build).
// {placeholders} are filled by t(); {n} and {rule} are always available (password rule).
// ---------------------------------------------------------------------------------------

const FR = {
  // Common
  'common.wait': 'Un instant…',
  'common.saving': 'Enregistrement…',
  'common.continue': 'Continuer',

  // Browser tab titles
  'title.default': 'Atelier céleste',
  'title.signin': 'Connexion',
  'title.pseudo': 'Première visite',
  'title.releve': 'Relevé de naissance',
  'title.chat': 'Conversation',
  'title.account': 'Mon compte',
  'title.newPassword': 'Nouveau mot de passe',

  // Header
  'header.tagline': 'Atelier céleste',
  'header.credit': 'Ciel du jour',
  'header.account': 'Mon compte',
  'header.logout': 'Déconnexion',
  'header.language': 'Langue',

  // Sign in / sign up / forgot password
  'auth.intro':
    'Votre compagnon astrologique conversationnel pour une expérience consultative personnalisée, active et durable dans le temps.',
  'auth.eyebrow': "Entrée de l'atelier",
  'auth.signin.title': 'Connexion',
  'auth.signin.lead': "Entrez votre email et votre mot de passe pour accéder à l'atelier.",
  'auth.signin.submit': "Entrer dans l'atelier",
  'auth.signup.title': 'Créer un compte',
  'auth.signup.lead': 'Choisissez un email et un mot de passe ({rule}) pour ouvrir votre atelier.',
  'auth.signup.submit': 'Créer mon compte',
  'auth.forgot.title': 'Mot de passe oublié',
  'auth.forgot.lead':
    'Entrez votre email : nous vous enverrons un lien pour choisir un nouveau mot de passe.',
  'auth.forgot.submit': 'Envoyer le lien',
  'auth.resetSent.before': 'Si un compte existe pour',
  'auth.resetSent.after':
    ', un email vient de partir avec un lien pour choisir un nouveau mot de passe. Pensez à regarder dans les indésirables.',
  'auth.backToSignin': 'Retour à la connexion',
  'auth.email': 'Email',
  'auth.emailPlaceholder': 'vous@exemple.fr',
  'auth.password': 'Mot de passe',
  'auth.forgotLink': 'Mot de passe oublié ?',
  'auth.toSignup': 'Pas encore de compte ? En créer un',
  'auth.toSignin': 'Déjà un compte ? Se connecter',
  'auth.err.email': 'Veuillez saisir une adresse email valide.',
  'auth.err.password': 'Veuillez saisir votre mot de passe.',
  'auth.err.open':
    "Vous êtes connecté, mais l'atelier n'a pas pu s'ouvrir. Rechargez la page ; si cela se reproduit, essayez un autre navigateur.",

  // Password rule
  'pw.rule': '{n} caractères au minimum, avec des lettres et des chiffres',
  'pw.tooShort': 'Le mot de passe doit contenir au moins {n} caractères.',
  'pw.lettersDigits': 'Le mot de passe doit contenir au moins une lettre et un chiffre.',
  'pw.mismatch': 'Les deux mots de passe ne sont pas identiques.',

  // Errors returned by Supabase Auth / saving
  'authErr.invalidCredentials': 'Email ou mot de passe incorrect.',
  'authErr.exists': 'Un compte existe déjà avec cet email. Connectez-vous plutôt.',
  'authErr.weak': 'Mot de passe trop faible : {rule}.',
  'authErr.same': "Le nouveau mot de passe doit être différent de l'ancien.",
  'authErr.rateLimit': 'Trop de tentatives. Patientez une minute puis réessayez.',
  'authErr.generic': 'La connexion a échoué. Vérifiez votre connexion internet et réessayez.',
  'authErr.confirmEmail': 'Compte créé : confirmez votre email puis connectez-vous.',
  'save.failed': "L'enregistrement a échoué. Vérifiez votre connexion internet et réessayez.",

  // Nickname
  'pseudo.eyebrow': 'Première visite',
  'pseudo.title': 'Comment vous appeler ?',
  'pseudo.lead': "Choisissez un pseudo : l'agent s'adressera à vous ainsi.",
  'pseudo.placeholder': 'Votre pseudo',

  // Birth data
  'releve.eyebrow': 'Relevé de naissance',
  'releve.title': 'Établissons votre thème astral',
  'releve.lead':
    "Renseignez votre date, votre heure et votre lieu de naissance : l'agent s'en servira pour calculer votre thème et votre horoscope du jour.",
  'releve.date': 'Date de naissance',
  'releve.time': 'Heure (HH:MM)',
  'releve.place': 'Lieu de naissance',
  'releve.change': 'Modifier',
  'releve.placePlaceholder': 'Ville, pays — ex. Paris, France',
  'releve.search': 'Rechercher',
  'releve.timezone': 'Fuseau horaire',
  'releve.houseSystem': 'Système de maisons',
  'releve.houseSystemHint':
    'Vous ne savez pas lequel choisir ? Gardez « placidus » : c’est le système de maisons le plus utilisé.',
  'releve.submit': "Valider et rejoindre l'agent",
  'releve.noPlace': 'Aucun lieu trouvé. Essayez « Ville, Pays ».',
  'releve.searchFailed': 'La recherche a échoué. Vérifiez votre connexion et réessayez.',
  'releve.err.date': 'Merci de renseigner votre date de naissance.',
  'releve.err.time': "L'heure doit être au format HH:MM, par exemple 00:00 pour minuit.",
  'releve.err.place': 'Recherchez puis sélectionnez votre lieu de naissance.',

  // Time zone regions and places
  'tz.europe': 'Europe',
  'tz.americas': 'Amériques',
  'tz.africa': 'Afrique',
  'tz.asia': 'Asie',
  'tz.oceania': 'Océanie',
  'tz.uk': 'Royaume-Uni',
  'tz.france': 'France',
  'tz.germany': 'Allemagne',
  'tz.russia': 'Russie',
  'tz.eastern': 'Heure de l’Est',
  'tz.central': 'Heure du Centre',
  'tz.mountain': 'Heure des Rocheuses',
  'tz.pacific': 'Heure du Pacifique',
  'tz.brazil': 'Brésil',
  'tz.mexico': 'Mexique',
  'tz.argentina': 'Argentine',
  'tz.egypt': 'Égypte',
  'tz.southAfrica': 'Afrique du Sud',
  'tz.nigeria': 'Nigeria',
  'tz.japan': 'Japon',
  'tz.china': 'Chine',
  'tz.uae': 'Émirats Arabes Unis',
  'tz.india': 'Inde',
  'tz.indonesia': 'Indonésie',
  'tz.australia': 'Australie',

  // Chat
  'chat.greeting':
    'Bonjour, comment puis-je t’aider ? Souhaites-tu que je te donne ton horoscope du jour personnalisé ?',
  'chat.newChart': 'Nouveau relevé',
  'chat.myConversations': 'Mes conversations ({count})',
  'chat.conversationsLabel': 'Mes conversations',
  'chat.newConversation': '+ Nouvelle conversation',
  'chat.noConversations': "Aucune conversation enregistrée pour l'instant.",
  'chat.untitled': 'Conversation',
  'chat.today': "Aujourd'hui, {time}",
  'chat.agent': "L'agent",
  'chat.thinking': 'Je suis en train de consulter les astres, un tout petit peu de patience…',
  'chat.placeholder': 'Posez votre question aux astres…',
  'chat.send': 'Envoyer',
  'chat.listen': 'Écouter la réponse',
  'chat.stopListening': 'Arrêter la lecture',
  'chat.autoRead': 'Lecture auto',
  'chat.on': 'oui',
  'chat.off': 'non',
  'chat.err.list': "Vos conversations n'ont pas pu être chargées.",
  'chat.err.load': "Cette conversation n'a pas pu être chargée.",

  // Agent errors
  'agent.generic': 'Les astres sont momentanément injoignables. Vérifiez votre connexion et réessayez.',
  'agent.busy': 'Beaucoup de monde consulte les astres en ce moment. Réessayez dans une minute.',
  'agent.profileMissing':
    'Votre profil est incomplet : renseignez votre pseudo et votre relevé de naissance.',
  'agent.invalidMessage': 'Ce message est vide ou trop long (4 000 caractères au maximum).',
  'agent.unauthorized': 'Votre session a expiré. Déconnectez-vous puis reconnectez-vous.',
  'agent.conversationNotFound':
    "Cette conversation n'existe plus. Ouvrez-en une autre ou commencez-en une nouvelle.",
  'agent.saveFailed': "La conversation n'a pas pu être enregistrée. Réessayez dans un instant.",

  // Account
  'account.eyebrow': 'Mon compte',
  'account.titleFallback': 'Votre compte',
  'account.signedInAs': 'Connecté avec',
  'account.back': "← Retour à l'atelier",
  'dictation.start': 'Dicter votre message',
  'dictation.stop': 'Arrêter la dictée',
  'dictation.err.denied':
    "Le micro est bloqué. Autorisez-le pour ce site (icône à gauche de l'adresse), puis réessayez.",
  'dictation.close': 'Fermer',
  'dictation.err.iosSafari':
    "La dictée n'a pas pu démarrer. Sur iPhone :\n" +
    '1. Réglages → Général → Clavier → activez « Activer la dictée ».\n' +
    '2. Si vous avez refusé le micro : Réglages → Apps → Safari → Micro → « Demander » ou « Autoriser ».\n' +
    "Fermez ensuite l'onglet, rouvrez le site et touchez 🎤 à nouveau.",
  'dictation.err.iosChrome':
    "La dictée n'a pas pu démarrer. Sur iPhone :\n" +
    '1. Réglages → Général → Clavier → activez « Activer la dictée ».\n' +
    '2. Réglages → Apps → Chrome → activez « Micro » et « Reconnaissance vocale ».\n' +
    "Fermez ensuite l'onglet, rouvrez le site et touchez 🎤 à nouveau.",
  'dictation.err.iosOther':
    "La dictée n'a pas pu démarrer. Sur iPhone :\n" +
    '1. Réglages → Général → Clavier → activez « Activer la dictée ».\n' +
    '2. Réglages → Apps → votre navigateur → activez « Micro » et « Reconnaissance vocale ».\n' +
    "Fermez ensuite l'onglet, rouvrez le site et touchez 🎤 à nouveau.",
  'dictation.err.noMic': 'Aucun micro trouvé sur cet appareil.',
  'dictation.err.unavailable':
    "La dictée n'est pas disponible dans ce navigateur pour le moment. Essayez Microsoft Edge ou Google Chrome.",
  'account.voice.title': 'Voix de lecture',
  'account.voice.lead':
    "La voix qui lit les réponses de l'agent (bouton 🔊). Elle vient de votre navigateur : le choix est retenu sur cet appareil.",
  'account.voice.label': 'Voix',
  'account.voice.pick':
    'Cliquez sur la liste pour découvrir toutes les voix et choisir votre préférée : chacune fait entendre un exemple.',
  'account.voice.auto': 'Automatique ({name})',
  'account.voice.natural': 'Voix naturelles',
  'account.voice.others': 'Autres voix',
  'account.voice.preview': '▶ Écouter',
  'account.voice.stop': '■ Arrêter',
  'account.voice.sample':
    'Bonsoir, je suis votre astrologue. Les étoiles ont beaucoup à vous dire aujourd’hui.',
  'account.voice.hint':
    'Pour des voix plus naturelles, essayez Microsoft Edge (voix « Natural ») ou Google Chrome.',
  'account.delete.title': 'Supprimer mon compte',
  'account.delete.before': 'Cette action est',
  'account.delete.strong': 'définitive',
  'account.delete.after':
    '. Elle efface votre compte et toutes vos données : pseudo, date, heure et lieu de naissance, conversations, messages et calculs astrologiques enregistrés. Rien ne pourra être récupéré.',
  'account.delete.word': 'SUPPRIMER',
  'account.delete.confirmLabel': 'Pour confirmer, tapez {word}',
  'account.delete.submit': 'Supprimer définitivement mon compte',
  'account.delete.deleting': 'Suppression…',
  'account.delete.failed':
    'La suppression a échoué. Vérifiez votre connexion internet et réessayez.',

  // New password (from the reset email)
  'newPassword.title': 'Nouveau mot de passe',
  'newPassword.invalid':
    "Ce lien n'est plus valide : il a peut-être expiré ou déjà servi. Demandez-en un nouveau depuis la page de connexion.",
  'newPassword.lead': 'Choisissez votre nouveau mot de passe ({rule}).',
  'newPassword.password': 'Nouveau mot de passe',
  'newPassword.confirm': 'Confirmez-le',
  'newPassword.submit': 'Enregistrer et entrer',
};

export type TKey = keyof typeof FR;

const EN: Record<TKey, string> = {
  'common.wait': 'One moment…',
  'common.saving': 'Saving…',
  'common.continue': 'Continue',

  'title.default': 'Celestial workshop',
  'title.signin': 'Sign in',
  'title.pseudo': 'First visit',
  'title.releve': 'Birth details',
  'title.chat': 'Conversation',
  'title.account': 'My account',
  'title.newPassword': 'New password',

  'header.tagline': 'Celestial workshop',
  'header.credit': "Today's sky",
  'header.account': 'My account',
  'header.logout': 'Sign out',
  'header.language': 'Language',

  'auth.intro':
    'Your conversational astrology companion for a personalised, active and lasting consultation experience.',
  'auth.eyebrow': 'Workshop entrance',
  'auth.signin.title': 'Sign in',
  'auth.signin.lead': 'Enter your email and password to enter the workshop.',
  'auth.signin.submit': 'Enter the workshop',
  'auth.signup.title': 'Create an account',
  'auth.signup.lead': 'Choose an email and a password ({rule}) to open your workshop.',
  'auth.signup.submit': 'Create my account',
  'auth.forgot.title': 'Forgot password',
  'auth.forgot.lead': "Enter your email: we'll send you a link to choose a new password.",
  'auth.forgot.submit': 'Send the link',
  'auth.resetSent.before': 'If an account exists for',
  'auth.resetSent.after':
    ', an email is on its way with a link to choose a new password. Remember to check your spam folder.',
  'auth.backToSignin': 'Back to sign in',
  'auth.email': 'Email',
  'auth.emailPlaceholder': 'you@example.com',
  'auth.password': 'Password',
  'auth.forgotLink': 'Forgot password?',
  'auth.toSignup': 'No account yet? Create one',
  'auth.toSignin': 'Already have an account? Sign in',
  'auth.err.email': 'Please enter a valid email address.',
  'auth.err.password': 'Please enter your password.',
  'auth.err.open':
    "You are signed in, but the workshop could not open. Reload the page; if it happens again, try another browser.",

  'pw.rule': 'at least {n} characters, with letters and digits',
  'pw.tooShort': 'Your password must be at least {n} characters long.',
  'pw.lettersDigits': 'Your password must contain at least one letter and one digit.',
  'pw.mismatch': 'The two passwords do not match.',

  'authErr.invalidCredentials': 'Incorrect email or password.',
  'authErr.exists': 'An account already exists with this email. Please sign in instead.',
  'authErr.weak': 'Password too weak: {rule}.',
  'authErr.same': 'Your new password must be different from the old one.',
  'authErr.rateLimit': 'Too many attempts. Please wait a minute and try again.',
  'authErr.generic': 'Sign-in failed. Check your internet connection and try again.',
  'authErr.confirmEmail': 'Account created: confirm your email, then sign in.',
  'save.failed': 'Saving failed. Check your internet connection and try again.',

  'pseudo.eyebrow': 'First visit',
  'pseudo.title': 'What should we call you?',
  'pseudo.lead': 'Choose a nickname: the agent will call you by it.',
  'pseudo.placeholder': 'Your nickname',

  'releve.eyebrow': 'Birth details',
  'releve.title': "Let's draw up your birth chart",
  'releve.lead':
    'Enter your date, time and place of birth: the agent will use them to calculate your chart and your daily horoscope.',
  'releve.date': 'Date of birth',
  'releve.time': 'Time (HH:MM)',
  'releve.place': 'Place of birth',
  'releve.change': 'Change',
  'releve.placePlaceholder': 'City, country — e.g. London, UK',
  'releve.search': 'Search',
  'releve.timezone': 'Time zone',
  'releve.houseSystem': 'House system',
  'releve.houseSystemHint': 'Not sure which to pick? Keep “placidus”: it is the most widely used house system.',
  'releve.submit': 'Save and meet the agent',
  'releve.noPlace': 'No place found. Try "City, Country".',
  'releve.searchFailed': 'The search failed. Check your connection and try again.',
  'releve.err.date': 'Please enter your date of birth.',
  'releve.err.time': 'The time must be in HH:MM format, e.g. 00:00 for midnight.',
  'releve.err.place': 'Search for and select your place of birth.',

  'tz.europe': 'Europe',
  'tz.americas': 'Americas',
  'tz.africa': 'Africa',
  'tz.asia': 'Asia',
  'tz.oceania': 'Oceania',
  'tz.uk': 'United Kingdom',
  'tz.france': 'France',
  'tz.germany': 'Germany',
  'tz.russia': 'Russia',
  'tz.eastern': 'Eastern Time',
  'tz.central': 'Central Time',
  'tz.mountain': 'Mountain Time',
  'tz.pacific': 'Pacific Time',
  'tz.brazil': 'Brazil',
  'tz.mexico': 'Mexico',
  'tz.argentina': 'Argentina',
  'tz.egypt': 'Egypt',
  'tz.southAfrica': 'South Africa',
  'tz.nigeria': 'Nigeria',
  'tz.japan': 'Japan',
  'tz.china': 'China',
  'tz.uae': 'United Arab Emirates',
  'tz.india': 'India',
  'tz.indonesia': 'Indonesia',
  'tz.australia': 'Australia',

  'chat.greeting': 'Hello, how can I help you? Would you like your personalised horoscope for today?',
  'chat.newChart': 'New birth details',
  'chat.myConversations': 'My conversations ({count})',
  'chat.conversationsLabel': 'My conversations',
  'chat.newConversation': '+ New conversation',
  'chat.noConversations': 'No saved conversations yet.',
  'chat.untitled': 'Conversation',
  'chat.today': 'Today, {time}',
  'chat.agent': 'The agent',
  'chat.thinking': "I'm consulting the stars, just a little patience…",
  'chat.placeholder': 'Ask the stars your question…',
  'chat.send': 'Send',
  'chat.listen': 'Listen to the reply',
  'chat.stopListening': 'Stop reading',
  'chat.autoRead': 'Auto-read',
  'chat.on': 'on',
  'chat.off': 'off',
  'chat.err.list': 'Your conversations could not be loaded.',
  'chat.err.load': 'This conversation could not be loaded.',

  'agent.generic': 'The stars are out of reach for a moment. Check your connection and try again.',
  'agent.busy': 'Many people are consulting the stars right now. Please try again in a minute.',
  'agent.profileMissing': 'Your profile is incomplete: enter your nickname and your birth details.',
  'agent.invalidMessage': 'This message is empty or too long (4,000 characters maximum).',
  'agent.unauthorized': 'Your session has expired. Sign out, then sign in again.',
  'agent.conversationNotFound':
    'This conversation no longer exists. Open another one or start a new one.',
  'agent.saveFailed': 'The conversation could not be saved. Please try again in a moment.',

  'account.eyebrow': 'My account',
  'account.titleFallback': 'Your account',
  'account.signedInAs': 'Signed in as',
  'account.back': '← Back to the workshop',
  'dictation.start': 'Dictate your message',
  'dictation.stop': 'Stop dictation',
  'dictation.err.denied':
    'The microphone is blocked. Allow it for this site (icon left of the address), then try again.',
  'dictation.close': 'Close',
  'dictation.err.iosSafari':
    'Dictation could not start. On iPhone:\n' +
    '1. Settings → General → Keyboard → turn on "Enable Dictation".\n' +
    '2. If you refused the microphone: Settings → Apps → Safari → Microphone → "Ask" or "Allow".\n' +
    'Then close the tab, reopen the site and tap 🎤 again.',
  'dictation.err.iosChrome':
    'Dictation could not start. On iPhone:\n' +
    '1. Settings → General → Keyboard → turn on "Enable Dictation".\n' +
    '2. Settings → Apps → Chrome → turn on "Microphone" and "Speech Recognition".\n' +
    'Then close the tab, reopen the site and tap 🎤 again.',
  'dictation.err.iosOther':
    'Dictation could not start. On iPhone:\n' +
    '1. Settings → General → Keyboard → turn on "Enable Dictation".\n' +
    '2. Settings → Apps → your browser → turn on "Microphone" and "Speech Recognition".\n' +
    'Then close the tab, reopen the site and tap 🎤 again.',
  'dictation.err.noMic': 'No microphone was found on this device.',
  'dictation.err.unavailable':
    'Dictation is not available in this browser right now. Try Microsoft Edge or Google Chrome.',
  'account.voice.title': 'Reading voice',
  'account.voice.lead':
    "The voice that reads the agent's replies (🔊 button). It comes from your browser: the choice is remembered on this device.",
  'account.voice.label': 'Voice',
  'account.voice.pick':
    'Click the list to discover all the voices and pick your favourite: each one plays a short sample.',
  'account.voice.auto': 'Automatic ({name})',
  'account.voice.natural': 'Natural voices',
  'account.voice.others': 'Other voices',
  'account.voice.preview': '▶ Listen',
  'account.voice.stop': '■ Stop',
  'account.voice.sample': 'Good evening, I am your astrologer. The stars have a lot to tell you today.',
  'account.voice.hint': 'For more natural voices, try Microsoft Edge ("Natural" voices) or Google Chrome.',
  'account.delete.title': 'Delete my account',
  'account.delete.before': 'This action is',
  'account.delete.strong': 'permanent',
  'account.delete.after':
    '. It erases your account and all your data: nickname, date, time and place of birth, conversations, messages and saved astrology readings. Nothing can be recovered.',
  'account.delete.word': 'DELETE',
  'account.delete.confirmLabel': 'To confirm, type {word}',
  'account.delete.submit': 'Permanently delete my account',
  'account.delete.deleting': 'Deleting…',
  'account.delete.failed': 'Deletion failed. Check your internet connection and try again.',

  'newPassword.title': 'New password',
  'newPassword.invalid':
    'This link is no longer valid: it may have expired or already been used. Request a new one from the sign-in page.',
  'newPassword.lead': 'Choose your new password ({rule}).',
  'newPassword.password': 'New password',
  'newPassword.confirm': 'Confirm it',
  'newPassword.submit': 'Save and continue',
};

const DICTIONARIES: Record<Lang, Record<TKey, string>> = { fr: FR, en: EN };
const STORAGE_KEY = 'astre-et-brume.lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'fr' || saved === 'en') return saved;
  } catch {
    // storage unavailable (private mode…): fall back to the browser language
  }
  return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

/**
 * Interface language (French or English). Templates call t(): reading the `lang` signal
 * inside it makes every text update immediately when the language changes.
 */
@Injectable({ providedIn: 'root' })
export class I18n {
  readonly lang = signal<Lang>(initialLang());

  constructor() {
    effect(() => {
      const lang = this.lang();
      document.documentElement.lang = lang;
      try {
        localStorage.setItem(STORAGE_KEY, lang);
      } catch {
        // not remembered on this device; the choice still applies for this visit
      }
    });
  }

  /** Locale for dates and times. */
  get locale(): string {
    return this.lang() === 'fr' ? 'fr-FR' : 'en-GB';
  }

  t(key: TKey, params: Record<string, string | number> = {}): string {
    const dict = DICTIONARIES[this.lang()];
    const values: Record<string, string | number> = {
      n: MIN_PASSWORD_LENGTH,
      ...(key === 'pw.rule' ? {} : { rule: dict['pw.rule'].replace('{n}', String(MIN_PASSWORD_LENGTH)) }),
      ...params,
    };
    return dict[key].replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name]) : match));
  }
}

/**
 * Browser tab titles: each route's `title` is a TKey, shown as "<title> · Astre & Brume"
 * and re-translated when the language changes.
 */
@Injectable({ providedIn: 'root' })
export class I18nTitleStrategy extends TitleStrategy {
  private readonly i18n = inject(I18n);
  private readonly title = inject(Title);
  private key = signal<TKey>('title.default');

  constructor() {
    super();
    effect(() => this.title.setTitle(`${this.i18n.t(this.key())} · Astre & Brume`));
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.key.set((this.buildTitle(snapshot) as TKey | undefined) ?? 'title.default');
  }
}
