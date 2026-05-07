import { TEAM } from '../../data/team';
import { useLang } from '../../i18n/LangContext';
import styles from './Team.module.scss';

export function Team() {
  const { t } = useLang();

  return (
    <section className={styles.people} id="people">
      <div className="section-head reveal">
        <div className="num">{t.team.num}</div>
        <h2>{t.team.title} <span className="it">{t.team.titleIt}</span></h2>
        <div className="meta">{t.team.metaLine1}<br />{t.team.metaLine2}</div>
      </div>

      <div className={styles.grid}>
        {TEAM.map((person, i) => {
          const initials = person.name.split(' ')
            .map(w => w[0])
            .slice(0, 2)
            .join('');

          return (
            <div key={i} className={`${styles.person} reveal`} style={{ transitionDelay: `${(i % 4) * 60}ms` }}>
              <div className={styles.photo}>
                <div className={styles.photoInner} style={{ background: person.tone }}>
                  <div className={styles.initials}>{initials}</div>
                </div>
                <div className={styles.num}>→ {String(i + 1).padStart(2, '0')}</div>
              </div>
              <div className={styles.name}>{person.name}</div>
              <div className={styles.role}>{t.team.roles[person.role] ?? person.role}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
