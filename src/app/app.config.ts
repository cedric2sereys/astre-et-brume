import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { TitleStrategy, provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { I18nTitleStrategy } from './core/i18n';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Route titles are translation keys (see core/i18n.ts).
    { provide: TitleStrategy, useExisting: I18nTitleStrategy },
  ],
};
