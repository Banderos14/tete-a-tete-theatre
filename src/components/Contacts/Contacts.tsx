import { lazy, Suspense } from 'react';
import {
  IconArrowUpRight,
  IconWalk,
} from '@tabler/icons-react';
import { LINKS, ADDRESS } from '../../constants/links';
import { useLang } from '../../i18n/LangContext';
import styles from './Contacts.module.scss';

// Leaflet is split into a separate bundle — loads asynchronously, not blocking main thread
const LeafletMap = lazy(() =>
  import('./LeafletMap').then(m => ({ default: m.LeafletMap }))
);

function MapFallback() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minHeight: 320,
        background: 'var(--bg-3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--fg-mute)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
      }}
    >
      Загрузка карты…
    </div>
  );
}

export function Contacts() {
  const { t } = useLang();

  return (
    <section className={styles.contacts} id="contacts">
      <div className="section-head reveal">
        <div className="num">{t.contacts.num}</div>
        <h2>{t.contacts.title} <span className="it">{t.contacts.titleIt}</span></h2>
        <div className="meta">{t.contacts.metaLine1}<br />{t.contacts.metaLine2}</div>
      </div>

      <div className={styles.grid}>
        {/* ── Info column ── */}
        <div className="reveal">
          <div className={styles.block}>
            <div className={styles.label}>{t.contacts.labelAddress}</div>
            <div className={styles.valueSerif}>
              {ADDRESS.street}<br />{ADDRESS.city}
            </div>
            <div className={styles.secondary}>
              <IconWalk size={12} stroke={1.5} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              {t.contacts.addressHint}
            </div>
          </div>

          <div className={styles.block}>
            <div className={styles.label}>{t.contacts.labelPhone}</div>
            <div className={styles.valueSerif} style={{ fontSize: 15 }}>
              <a href={`tel:${LINKS.phoneRaw}`}>{LINKS.phone}</a>
            </div>
            <div className={styles.secondary} style={{ marginTop: 6 }}>
              <a href={`mailto:${LINKS.email}`} className={styles.emailLink}>{LINKS.email}</a>
            </div>
          </div>

          <div className={styles.block}>
            <div className={styles.label}>{t.contacts.labelHours}</div>
            <div className={styles.hoursBlock}>
              <div>{t.contacts.hoursWeekdays}</div>
            </div>
          </div>

          <div className={styles.actionsRow}>
            <a
              className={styles.btnRoute}
              href={LINKS.googleMaps}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.contacts.btnMaps}
              <IconArrowUpRight size={14} stroke={1.5} />
            </a>

            <div className={styles.socials}>
              <SocialIcon href={LINKS.instagram} label="Instagram">
                <InstagramIcon />
              </SocialIcon>
              <SocialIcon href={LINKS.facebook} label="Facebook">
                <FacebookIcon />
              </SocialIcon>
              <SocialIcon href={LINKS.threads} label="Threads">
                <ThreadsIcon />
              </SocialIcon>
              <SocialIcon href={LINKS.telegram} label="Telegram">
                <TelegramIcon />
              </SocialIcon>
            </div>
          </div>
        </div>

        {/* ── Map column ── */}
        <div className={`${styles.mapWrapper} reveal`}>
          <div className={styles.mapFrame}>
            <Suspense fallback={<MapFallback />}>
              <LeafletMap />
            </Suspense>
          </div>
          <div className={styles.mapOverlay}>
            <div className={styles.mapAddr}>{t.contacts.mapAddr}</div>
            <a
              href={LINKS.googleMaps}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.mapLink}
            >
              {t.contacts.mapLink} <IconArrowUpRight size={12} stroke={1.5} style={{ verticalAlign: 'middle' }} />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function SocialIcon({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className={styles.socialIcon}>
      {children}
    </a>
  );
}

function InstagramIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7.8 0h8.4C20.5 0 24 3.5 24 7.8v8.4c0 4.3-3.5 7.8-7.8 7.8H7.8C3.5 24 0 20.5 0 16.2V7.8C0 3.5 3.5 0 7.8 0Zm-.27 2.16a5.37 5.37 0 0 0-5.37 5.37v8.94a5.37 5.37 0 0 0 5.37 5.37h8.94a5.37 5.37 0 0 0 5.37-5.37V7.53a5.37 5.37 0 0 0-5.37-5.37H7.53ZM12 5.84A6.16 6.16 0 1 1 12 18.16 6.16 6.16 0 0 1 12 5.84Zm0 2.16a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm6.4-2.4a1.44 1.44 0 1 1 0 2.88 1.44 1.44 0 0 1 0-2.88Z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.03 1.79-4.7 4.53-4.7 1.31 0 2.68.23 2.68.23v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.27h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07Z" />
    </svg>
  );
}

function ThreadsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.596.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.719C4.307 6.504 3.616 8.912 3.589 12c.027 3.088.718 5.496 2.056 7.163 1.43 1.783 3.63 2.697 6.54 2.719 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.184 3.49-1.194.976-.006 1.891.04 2.723.137-.11-.64-.33-1.146-.66-1.513-.451-.499-1.164-.752-2.118-.759h-.014c-.765 0-1.803.216-2.448 1.243L7.88 8.97c.896-1.409 2.423-2.186 4.298-2.186h.03c3.014.018 4.818 1.803 5.16 5.068.143.06.283.123.42.19 1.346.653 2.37 1.645 2.959 2.866.827 1.72.807 4.215-1.355 6.333C17.7 23.083 15.322 23.976 12.186 24Zm.008-11.57c-1.861.013-2.753.86-2.707 2.058.048.934.977 1.57 2.383 1.495 1.335-.071 2.163-.716 2.614-2.033.209-.61.348-1.335.41-2.166-.748-.11-1.61-.163-2.7-.154Z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0Zm5.56 8.22c-.18 1.9-.96 6.5-1.36 8.63-.17.9-.5 1.2-.82 1.23-.7.06-1.23-.46-1.9-.9-1.06-.7-1.66-1.13-2.69-1.81-1.19-.78-.42-1.21.26-1.92.18-.18 3.25-2.98 3.31-3.23.01-.03.01-.15-.06-.21-.07-.06-.18-.04-.26-.02-.11.02-1.9 1.2-5.36 3.54-.51.35-.97.52-1.38.51-.45-.01-1.32-.26-1.97-.47-.8-.26-1.43-.4-1.38-.85.03-.24.36-.48.99-.73 3.88-1.69 6.47-2.8 7.76-3.34 3.7-1.54 4.47-1.81 4.97-1.82.11 0 .36.03.52.16.13.11.17.26.19.36.02.1.04.32.02.49Z" />
    </svg>
  );
}
