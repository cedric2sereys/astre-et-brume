import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GeocodingService, Place } from '../core/geocoding.service';
import { I18n, TKey } from '../core/i18n';
import { HOUSE_SYSTEMS, HouseSystem, SessionService } from '../core/session.service';

interface TimezoneOption {
  id: string; // IANA name, sent to the astrology API
  name: TKey; // translated country / area name
  offset: string;
}

// Shown as "Europe/London (United Kingdom, UTC+0/+1)".
const TIMEZONE_GROUPS: { region: TKey; zones: TimezoneOption[] }[] = [
  {
    region: 'tz.europe',
    zones: [
      { id: 'Europe/London', name: 'tz.uk', offset: 'UTC+0/+1' },
      { id: 'Europe/Paris', name: 'tz.france', offset: 'UTC+1/+2' },
      { id: 'Europe/Berlin', name: 'tz.germany', offset: 'UTC+1/+2' },
      { id: 'Europe/Moscow', name: 'tz.russia', offset: 'UTC+3' },
    ],
  },
  {
    region: 'tz.americas',
    zones: [
      { id: 'America/New_York', name: 'tz.eastern', offset: 'UTC-5/-4' },
      { id: 'America/Chicago', name: 'tz.central', offset: 'UTC-6/-5' },
      { id: 'America/Denver', name: 'tz.mountain', offset: 'UTC-7/-6' },
      { id: 'America/Los_Angeles', name: 'tz.pacific', offset: 'UTC-8/-7' },
      { id: 'America/Sao_Paulo', name: 'tz.brazil', offset: 'UTC-3' },
      { id: 'America/Mexico_City', name: 'tz.mexico', offset: 'UTC-6/-5' },
      { id: 'America/Argentina/Buenos_Aires', name: 'tz.argentina', offset: 'UTC-3' },
    ],
  },
  {
    region: 'tz.africa',
    zones: [
      { id: 'Africa/Cairo', name: 'tz.egypt', offset: 'UTC+2/+3' },
      { id: 'Africa/Johannesburg', name: 'tz.southAfrica', offset: 'UTC+2' },
      { id: 'Africa/Lagos', name: 'tz.nigeria', offset: 'UTC+1' },
    ],
  },
  {
    region: 'tz.asia',
    zones: [
      { id: 'Asia/Tokyo', name: 'tz.japan', offset: 'UTC+9' },
      { id: 'Asia/Shanghai', name: 'tz.china', offset: 'UTC+8' },
      { id: 'Asia/Dubai', name: 'tz.uae', offset: 'UTC+4' },
      { id: 'Asia/Kolkata', name: 'tz.india', offset: 'UTC+5:30' },
      { id: 'Asia/Jakarta', name: 'tz.indonesia', offset: 'UTC+7' },
    ],
  },
  {
    region: 'tz.oceania',
    zones: [{ id: 'Australia/Sydney', name: 'tz.australia', offset: 'UTC+10/+11' }],
  },
];

const TIMEZONE_IDS = TIMEZONE_GROUPS.flatMap((g) => g.zones.map((z) => z.id));
const BROWSER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

@Component({
  selector: 'app-releve-page',
  imports: [FormsModule],
  template: `
    <section class="wrap">
      <p class="eyebrow">{{ i18n.t('releve.eyebrow') }}</p>
      <h1 class="title">{{ i18n.t('releve.title') }}</h1>
      <p class="lead">{{ i18n.t('releve.lead') }}</p>

      <form class="card" (ngSubmit)="save()" novalidate>
        <div class="row">
          <label class="field">
            <span class="field-label">{{ i18n.t('releve.date') }}</span>
            <input class="input" type="date" name="date" [(ngModel)]="date" required />
          </label>
          <label class="field">
            <span class="field-label">{{ i18n.t('releve.time') }}</span>
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
          <label class="field-label" for="place">{{ i18n.t('releve.place') }}</label>
          @if (place(); as p) {
            <div class="chosen">
              <span>{{ p.label }}</span>
              <button class="link link-mono" type="button" (click)="clearPlace()">
                {{ i18n.t('releve.change') }}
              </button>
            </div>
          } @else {
            <div class="search">
              <input
                class="input"
                id="place"
                name="placeQuery"
                [placeholder]="i18n.t('releve.placePlaceholder')"
                [(ngModel)]="placeQuery"
                (keydown.enter)="searchPlace($event)"
              />
              <button
                class="btn btn-outline"
                type="button"
                [disabled]="searching() || placeQuery.trim().length < 2"
                (click)="searchPlace()"
              >
                {{ searching() ? '…' : i18n.t('releve.search') }}
              </button>
            </div>
            @if (results().length) {
              <ul class="results">
                @for (r of results(); track r.label) {
                  <li><button type="button" (click)="choose(r)">{{ r.label }}</button></li>
                }
              </ul>
            }
            @if (searchMessage(); as message) {
              <p class="hint">{{ i18n.t(message) }}</p>
            }
          }
        </div>

        <div class="row">
          <label class="field">
            <span class="field-label">{{ i18n.t('releve.timezone') }}</span>
            <select class="input" name="timezone" [(ngModel)]="timezone">
              @for (group of timezoneGroups; track group.region) {
                <optgroup [label]="i18n.t(group.region)">
                  @for (tz of group.zones; track tz.id) {
                    <option [value]="tz.id">{{ tz.id }} ({{ i18n.t(tz.name) }}, {{ tz.offset }})</option>
                  }
                </optgroup>
              }
            </select>
          </label>
          <label class="field">
            <span class="field-label">{{ i18n.t('releve.houseSystem') }}</span>
            <select class="input" name="houseSystem" [(ngModel)]="houseSystem">
              @for (h of houseSystems; track h) {
                <option [value]="h">{{ h }}</option>
              }
            </select>
          </label>
        </div>

        @if (error(); as error) {
          <p class="error" role="alert">{{ i18n.t(error) }}</p>
        }
        <button class="btn btn-gold" type="submit" [disabled]="saving()">
          {{ i18n.t(saving() ? 'common.saving' : 'releve.submit') }}
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
  protected readonly i18n = inject(I18n);

  readonly houseSystems = HOUSE_SYSTEMS;
  readonly timezoneGroups = TIMEZONE_GROUPS;

  readonly place = signal<Place | null>(null);
  readonly results = signal<Place[]>([]);
  readonly searching = signal(false);
  readonly searchMessage = signal<TKey | null>(null);
  readonly error = signal<TKey | null>(null);
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
      if (!found.length) this.searchMessage.set('releve.noPlace');
    } catch {
      this.searchMessage.set('releve.searchFailed');
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
    if (!this.date) return this.error.set('releve.err.date');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(this.time)) {
      return this.error.set('releve.err.time');
    }
    if (!place) return this.error.set('releve.err.place');

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
