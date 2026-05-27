import { TEAM } from '../../data/team';
import { useLang } from '../../i18n/LangContext';
import type { TeamMember, TeamGroup } from '../../types';
import styles from './Team.module.scss';

const GROUP_ORDER: TeamGroup[] = ['directors', 'actors', 'youth'];

const GROUP_LABELS: Record<TeamGroup, { RU: string; FR: string }> = {
  directors: { RU: 'Режиссёры',                    FR: 'Metteurs en scène'          },
  actors:    { RU: 'Актёры',             FR: 'Acteurs'       },
  youth:     { RU: 'Актёры молодёжного театра',     FR: 'Acteurs du théâtre jeunesse'},
};

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('');
}

interface PersonCardProps {
  person: TeamMember;
  index: number;
}

function PersonCard({ person, index }: PersonCardProps) {
  const { lang, t } = useLang();
  const displayName = lang === 'FR' ? (person.nameFR ?? person.name) : person.name;
  return (
    <div
      className={`${styles.person} reveal`}
      style={{ transitionDelay: `${(index % 4) * 60}ms` }}
    >
      <div className={styles.photo}>
        <div className={styles.photoInner} style={{ background: person.tone }}>
          {person.photo
            ? <img src={`/images/team/${person.photo}`} alt={displayName} className={styles.photoImg} />
            : <div className={styles.initials}>{getInitials(displayName)}</div>
          }
        </div>
      </div>
      <div className={styles.name}>{displayName}</div>
      <div className={styles.role}>{t.team.roles[person.role] ?? person.role}</div>
    </div>
  );
}

export function Team() {
  const { lang, t } = useLang();

  const grouped = GROUP_ORDER.map(group => ({
    group,
    label: GROUP_LABELS[group][lang],
    members: TEAM.filter(p => p.group === group),
  })).filter(g => g.members.length > 0);

  return (
    <section className={styles.people} id="people">
      <div className="section-head reveal">
        <div className="num">{t.team.num}</div>
        <h2>{t.team.title} <span className="it">{t.team.titleIt}</span></h2>
        <div className="meta">{t.team.metaLine1}<br />{t.team.metaLine2}</div>
      </div>

      <div className={styles.groups}>
        {grouped.map(({ group, label, members }) => (
          <div key={group} className={styles.groupBlock}>
            <div className={`${styles.groupLabel} reveal`}>{label}</div>
            <div className={styles.grid}>
              {members.map((person, i) => (
                <PersonCard key={person.name} person={person} index={i} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
