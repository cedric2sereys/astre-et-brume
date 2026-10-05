import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GeocodingService, Place } from '../core/geocoding.service';
import { HOUSE_SYSTEMS, HouseSystem, SessionService } from '../core/session.service';

interface TimezoneOption {
  id: string; // IANA name, sent to the astrology API
  label: string;
}

const TIMEZONE_GROUPS: { region: string; zones: TimezoneOption[] }[] = [
  {
    region: 'Europe',
    zones: [
      { id: 'Europe/London', label: 'Europe/London (Royaume-Uni, UTC+0/+1)' },
      { id: 'Europe/Paris', label: 'Europe/Paris (France, UTC+1/+2)' },
      { id: 'Europe/Berlin', label: 'Europe/Berlin (Allemagne, UTC+1/+2)' },
      { id: 'Europe/Moscow', label: 'Europe/Moscow (Russie, UTC+3)' },
    ],
  },
  {
    region: 'Amériques',
    zones: [
      { id: 'America/New_York', label: 'America/New_York (Heure de l’Est, UTC-5/-4)' },
      { id: 'America/Chicago', label: 'America/Chicago (Heure du Centre, UTC-6/-5)' },
      { id: 'America/Denver', label: 'America/Denver (Heure des Rocheuses, UTC-7/-6)' },
      { id: 'America/Los_Angeles', label: 'America/Los_Angeles (Heure du Pacifique, UTC-8/-7)' },
      { id: 'America/Sao_Paulo', label: 'America/Sao_Paulo (Brésil, UTC-3)' },
      { id: 'America/Mexico_City', label: 'America/Mexico_City (Mexique, UTC-6/-5)' },
      {
        id: 'America/Argentina/Buenos_Aires',
        label: 'America/Argentina/Buenos_Aires (Argentine, UTC-3)',
      },
    ],
  },
  {
    region: 'Afrique',
    zones: [
      { id: 'Africa/Cairo', label: 'Africa/Cairo (Égypte, UTC+2/+3)' },
      { id: 'Africa/Johannesburg', label: 'Africa/Johannesburg (Afrique du Sud, UTC+2)' },
      { id: 'Africa/Lagos', label: 'Africa/Lagos (Nigeria, UTC+1)' },
    ],
  },
  {
    region: 'Asie',
    zones: [
      { id: 'Asia/Tokyo', label: 'Asia/Tokyo (Japon, UTC+9)' },
      { id: 'Asia/Shanghai', label: 'Asia/Shanghai (Chine, UTC+8)' },
      { id: 'Asia/Dubai', label: 'Asia/Dubai (Émirats Arabes Unis, UTC+4)' },
      { id: 'Asia/Kolkata', label: 'Asia/Kolkata (Inde, UTC+5:30)' },
      { id: 'Asia/Jakarta', label: 'Asia/Jakarta (Indonésie, UTC+7)' },
    ],
  },
  {
    region: 'Océanie',
    zones: [{ id: 'Australia/Sydney', label: 'Australia/Sydney (Australie, UTC+10/+11)' }],
  },
];

const TIMEZONE_IDS = TIMEZONE_GROUPS.flatMap((g) => g.zones.map((z) => z.id));
const BROWSER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

@Component({
  selector: 'app-releve-page',
  imports: [FormsModule],
  template: `
    <section class="wrap">
      <p class="eyebrow">Relevé de naissance</p>
      <h1 class="title">Établissons votre thème astral</h1>
      <p class="lead">
        Renseignez votre date, votre heure et votre lieu de naissance : l'agent s'en servira pour
        calculer votre thème et votre horoscope du jour.
      </p>

      <form class="card" (ngSubmit)="save()" novalidate>
        <div class="row">
          <label class="field">
            <span class="field-label">Date de naissance</span>
            <input class="input" type="date" name="date" [(ngModel)]="date" required />
          </label>
          <label class="field">
            <span class="field-label">Heure (HH:MM)</span>
            <input
              class="input"
              name="time"
              inputmode="numeric"
              placeholder="00:00"
              maxlength="5"
              [(ngModel)]="time"
              (blur)="normalizeTime()"
            />
          </label>
        </div>

        <div class="field">
          <label class="field-label" for="place">Lieu de naissance</label>
          @if (place(); as p) {
            <div class="chosen">
              <span>{{ p.label }}</span>
              <button class="link link-mono" type="button" (click)="clearPlace()">Modifier</button>
            </div>
          } @else {
            <div class="search">
              <input
                class="input"
                id="place"
                name="placeQuery"
                placeholder="Ville, pays — ex. Paris, France"
                [(ngModel)]="placeQuery"
                (keydown.enter)="searchPlace($event)"
              />
              <button
                class="btn btn-outline"
                type="button"
                [disabled]="searching() || placeQuery.trim().length < 2"
                (click)="searchPlace()"
              >
                {{ searching() ? '…' : 'Rechercher' }}
              </button>
            </div>
            @if (results().length) {
              <ul class="results">
                @for (r of results(); track r.label) {
                  <li><button type="button" (click)="choose(r)">{{ r.label }}</button></li>
                }
              </ul>
            }
            @if (searchMessage()) {
              <p class="hint">{{ searchMessage() }}</p>
            }
          }
        </div>

        <div class="row">
          <label class="field">
            <span class="field-label">Fuseau horaire</span>
            <select class="input" name="timezone" [(ngModel)]="timezone">
              @for (group of timezoneGroups; track group.region) {
                <optgroup [label]="group.region">
                  @for (tz of group.zones; track tz.id) {
                    <option [value]="tz.id">{{ tz.label }}</option>
                  }
                </optgroup>
              }
            </select>
          </label>
          <label class="field">
            <span class="field-label">Système de maisons</span>
            <select class="input" name="houseSystem" [(ngModel)]="houseSystem">
              @for (h of houseSystems; track h) {
                <option [value]="h">{{ h }}</option>
              }
            </select>
          </label>
        </div>

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <button class="btn btn-gold" type="submit" [disabled]="saving()">
          {{ saving() ? 'Enregistrement…' : "Valider et rejoindre l'agent" }}
        </button>
      </form>
    </section>
  `,
  styles: `
    :host { display: block; }
    .wrap { width: min(100%, 720px); margin: 4vh auto 0; }
    .card { padding: 2.2rem 2.1rem; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .search { display: flex; gap: 0.7rem; }
    .search .btn { width: auto; flex: none; padding-inline: 1.3rem; }
    .results {
      list-style: none; margin: 0.6rem 0 0; padding: 0;
      border: 1px solid var(--border); border-radius: 10px; overflow: hidden;
    }
    .results button {
      width: 100%; text-align: left; padding: 0.75rem 1rem;
      background: var(--input); border: none; border-bottom: 1px solid var(--border);
      color: var(--text); cursor: pointer; font-size: 0.95rem;
      &:hover { background: var(--card-2); color: var(--gold-soft); }
    }
    .results li:last-child button { border-bottom: none; }
    .chosen {
      display: flex; align-items: center; justify-content: space-between; gap: 1rem;
      padding: 0.95rem 1.1rem;
      background: var(--input); border: 1px solid var(--gold-dim); border-radius: 10px;
    }
    .hint { color: var(--muted); font-size: 0.9rem; margin: 0.6rem 0 0; }
    .btn-gold { margin-top: 0.8rem; }
    @media (max-width: 560px) {
      .row { grid-template-columns: 1fr; gap: 0; }
      .card { padding: 1.6rem 1.2rem; }
    }
  `,
})
export class RelevePage {
  private readonly session = inject(SessionService);
  private readonly geocoding = inject(GeocodingService);
  private readonly router = inject(Router);

  readonly houseSystems = HOUSE_SYSTEMS;
  readonly timezoneGroups = TIMEZONE_GROUPS;

  readonly place = signal<Place | null>(null);
  readonly results = signal<Place[]>([]);
  readonly searching = signal(false);
  readonly searchMessage = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);

  // "Nouveau relevé" comes back here with the saved chart pre-filled.
  private readonly saved = this.session.chart();
  date = this.saved?.date ?? '';
  time = this.saved?.time ?? '';
  placeQuery = '';
  // Otherwise pre-select the visitor's own time zone when it is in the list.
  timezone =
    this.saved?.timezone ?? (TIMEZONE_IDS.includes(BROWSER_TIMEZONE) ? BROWSER_TIMEZONE : 'Europe/Paris');
  houseSystem: HouseSystem = this.saved?.houseSystem ?? 'placidus';

  constructor() {
    if (this.saved) {
      this.place.set({
        label: this.saved.place,
        latitude: this.saved.latitude,
        longitude: this.saved.longitude,
      });
    }
  }

  /** Accepts "9", "930", "9:30", "9h30" and turns them into "09:30". */
  normalizeTime(): void {
    const m = this.time.trim().match(/^(\d{1,2})(?:[:hH.]?(\d{2}))?$/);
    if (!m) return;
    const h = Number(m[1]);
    const min = Number(m[2] ?? 0);
    if (h < 24 && min < 60) {
      this.time = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }
  }

  async searchPlace(event?: Event): Promise<void> {
    event?.preventDefault();
    const q = this.placeQuery.trim();
    if (q.length < 2 || this.searching()) return;
    this.searching.set(true);
    this.searchMessage.set(null);
    this.results.set([]);
    try {
      const found = await this.geocoding.search(q);
      this.results.set(found);
      if (!found.length) this.searchMessage.set('Aucun lieu trouvé. Essayez « Ville, Pays ».');
    } catch {
      this.searchMessage.set('La recherche a échoué. Vérifiez votre connexion et réessayez.');
    } finally {
      this.searching.set(false);
    }
  }

  choose(p: Place): void {
    this.place.set(p);
    this.results.set([]);
    this.error.set(null);
  }

  clearPlace(): void {
    this.place.set(null);
  }

  async save(): Promise<void> {
    if (this.saving()) return;
    this.normalizeTime();
    const place = this.place();
    if (!this.date) return this.error.set('Merci de renseigner votre date de naissance.');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(this.time)) {
      return this.error.set("L'heure doit être au format HH:MM, par exemple 00:00 pour minuit.");
    }
    if (!place) return this.error.set('Recherchez puis sélectionnez votre lieu de naissance.');

    this.saving.set(true);
    this.error.set(null);
    const error = await this.session.saveChart({
      date: this.date,
      time: this.time,
      place: place.label,
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: this.timezone,
      houseSystem: this.houseSystem,
    });
    this.saving.set(false);
    if (error) this.error.set(error);
    else this.router.navigateByUrl('/conversation');
  }
}
