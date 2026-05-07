import { LINKS, ADDRESS } from '../../constants/links';
import { useLang } from '../../i18n/LangContext';
import styles from './Contacts.module.scss';

const MAP_URL =
  'https://www.openstreetmap.org/export/embed.html?bbox=7.2620%2C43.6970%2C7.2700%2C43.7020&layer=mapnik&marker=43.6995%2C7.2660';

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
        <div className="reveal">
          <div className={styles.block}>
            <div className={styles.label}>{t.contacts.labelAddress}</div>
            <div className={styles.value}>
              {ADDRESS.street}<br />{ADDRESS.city}
            </div>
            <div className={styles.secondary}>{t.contacts.addressHint}</div>
          </div>

          <div className={styles.block}>
            <div className={styles.label}>{t.contacts.labelEmail}</div>
            <div className={styles.value}>
              <a href={`mailto:${LINKS.email}`}>{LINKS.email}</a>
            </div>
          </div>

          <div className={styles.block}>
            <div className={styles.label}>{t.contacts.labelPhone}</div>
            <div className={styles.value}>
              <a href={`tel:${LINKS.phoneRaw}`}>{LINKS.phone}</a>
            </div>
          </div>

          <div className={styles.block}>
            <div className={styles.label}>{t.contacts.labelHours}</div>
            <div className={styles.value} style={{ fontSize: 20 }}>
              {t.contacts.hoursWeekdays}<br />{t.contacts.hoursSunday}
            </div>
          </div>

          <a
            className="btn btn-primary"
            href={LINKS.googleMaps}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t.contacts.btnMaps} <span className="arrow">→</span>
          </a>

          <div className={styles.socials}>
            <SocialIcon href={LINKS.instagram} label="Instagram">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="2" width="20" height="20" rx="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
              </svg>
            </SocialIcon>
            <SocialIcon href={LINKS.facebook} label="Facebook">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M22 12a10 10 0 1 0-11.56 9.88v-7H8v-2.88h2.44V9.84c0-2.41 1.43-3.74 3.62-3.74 1.05 0 2.15.19 2.15.19v2.36h-1.21c-1.19 0-1.56.74-1.56 1.5V12h2.66l-.43 2.88h-2.23v7A10 10 0 0 0 22 12z" />
              </svg>
            </SocialIcon>
            <SocialIcon href={LINKS.threads} label="Threads">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 16c-2.2 0-4-1.3-4-3 0-1.5 1.5-2.5 3-2.5.5 0 1 .1 1.5.2-.1-1.5-.7-2.2-1.5-2.2-.7 0-1.3.5-1.5 1l-1.7-.7c.5-1.3 1.7-2.3 3.2-2.3 2.2 0 3.5 1.7 3.5 4 0 .3 0 .5-.1.7 1.3.5 2.1 1.6 2.1 3 0 1.7-1.5 3-3.5 3z" />
              </svg>
            </SocialIcon>
            <SocialIcon href={LINKS.telegram} label="Telegram">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.7 4.3L2.9 11.2c-1.2.5-1.2 1.2-.2 1.5l4.6 1.4 10.6-6.7c.5-.3 1-.1.6.2L9 14.7l-.3 4.7c.5 0 .7-.2.9-.4l2.2-2.1 4.6 3.4c.8.5 1.4.2 1.7-.8l3-14.1c.4-1.3-.4-1.8-1.4-1.1z" />
              </svg>
            </SocialIcon>
          </div>
        </div>

        <div className={`${styles.mapFrame} reveal`}>
          <iframe
            src={MAP_URL}
            title="Карта театра ТЕТ-А-ТЕТ"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <div className={styles.mapOverlay}>
            <div className={styles.mapAddr}>{t.contacts.mapAddr}</div>
            <a
              href={LINKS.googleMaps}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.mapLink}
            >
              {t.contacts.mapLink} <span className="arrow">→</span>
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
