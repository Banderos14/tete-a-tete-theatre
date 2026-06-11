import { lazy, Suspense } from 'react';
import {
  IconBrandInstagram,
  IconBrandFacebook,
  IconBrandTelegram,
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
                <IconBrandInstagram size={18} stroke={1.5} />
              </SocialIcon>
              <SocialIcon href={LINKS.facebook} label="Facebook">
                <IconBrandFacebook size={18} stroke={1.5} />
              </SocialIcon>
              <SocialIcon href={LINKS.threads} label="Threads">
                {/* Threads icon not in Tabler — use inline SVG */}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 16c-2.2 0-4-1.3-4-3 0-1.5 1.5-2.5 3-2.5.5 0 1 .1 1.5.2-.1-1.5-.7-2.2-1.5-2.2-.7 0-1.3.5-1.5 1l-1.7-.7c.5-1.3 1.7-2.3 3.2-2.3 2.2 0 3.5 1.7 3.5 4 0 .3 0 .5-.1.7 1.3.5 2.1 1.6 2.1 3 0 1.7-1.5 3-3.5 3z" />
                </svg>
              </SocialIcon>
              <SocialIcon href={LINKS.telegram} label="Telegram">
                <IconBrandTelegram size={18} stroke={1.5} />
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
