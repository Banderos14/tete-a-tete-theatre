// Вкладка «Пользователи»: список аккаунтов и полное удаление.

import { RU } from '../../i18n';
import { resolveInstagramUsername, instagramProfileUrl } from '../../utils/instagram';
import type { AdminUser } from '../../services/userService';
import { formatTimestamp, contactLabel, formatBirthday, PROVIDER_LABELS } from './adminFormatting';
import type { ConfirmAction } from './adminTypes';
import styles from './AdminPage.module.scss';
import { formatPhoneForDisplay } from '../../utils/phoneDisplay';
import { breakableEmail } from './adminEmail';

const t = RU;

export function UsersTab({
  users, fetching, updatingUserId, currentUid,
  deleteUserError, onDismissError, onConfirmAction,
}: {
  users: AdminUser[];
  fetching: boolean;
  updatingUserId: string | null;
  /** uid текущего администратора — себя удалить нельзя. */
  currentUid: string | undefined;
  deleteUserError: string | null;
  onDismissError: () => void;
  onConfirmAction: (a: ConfirmAction) => void;
}) {
  return (
    <>
      <div className={styles.summaryRow}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryNum}>{users.length}</span>
          <span className={styles.summaryLabel}>{t.admin.usersCount}</span>
        </div>
      </div>

      {deleteUserError && (
        <div className={styles.adminError}>
          <strong>Ошибка удаления:</strong> {deleteUserError}
          {deleteUserError.includes('FIREBASE_SERVICE_ACCOUNT') && (
            <span> — добавьте переменную <code>FIREBASE_SERVICE_ACCOUNT</code> в настройках Vercel.</span>
          )}
          <button className={styles.errorDismiss} onClick={onDismissError}>×</button>
        </div>
      )}

      {fetching ? (
        <div className={styles.centered}><span className={styles.spinner} /></div>
      ) : users.length === 0 ? (
        <p className={styles.empty}>{t.admin.noUsers}</p>
      ) : (
        <>
          {/* Та же система, что у «Бронирований»: на desktop и laptop — таблица с
              фиксированными колонками, на планшете и телефоне — карточки. */}
          <div className={`${styles.tableWrap} ${styles.desktopOnly}`}>
            <table className={`${styles.table} ${styles.usersTable}`}>
              <colgroup>
                <col className={styles.colUserName} />
                <col className={styles.colUserEmail} />
                <col className={styles.colUserPhone} />
                <col className={styles.colUserRole} />
                <col className={styles.colUserSocials} />
                <col className={styles.colUserNotify} />
                <col className={styles.colUserLang} />
                <col className={styles.colUserCreated} />
                <col className={styles.colActions} />
              </colgroup>
              <thead>
                <tr>
                  <th>{t.admin.name}</th>
                  <th>{t.admin.email}</th>
                  <th>{t.admin.phone}</th>
                  <th>Роль</th>
                  <th>Соцсети</th>
                  <th>Уведомления</th>
                  <th>Язык</th>
                  <th>{t.admin.userCreatedAt}</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <UserRow
                    key={u.uid}
                    user={u}
                    isBusy={updatingUserId === u.uid}
                    canDelete={u.role !== 'admin' && u.uid !== currentUid}
                    onConfirmAction={onConfirmAction}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.mobileList}>
            {users.map(u => (
              <UserMobileCard
                key={u.uid}
                user={u}
                isBusy={updatingUserId === u.uid}
                canDelete={u.role !== 'admin' && u.uid !== currentUid}
                onConfirmAction={onConfirmAction}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

interface UserRowProps {
  user: AdminUser;
  isBusy: boolean;
  canDelete: boolean;
  onConfirmAction: (a: ConfirmAction) => void;
}

// ── Блоки ячеек: одни и те же для строки таблицы и карточки ────────────────

function UserName({ u }: { u: AdminUser }) {
  const birthday = formatBirthday(u.birthday);
  return (
    <div className={styles.stack}>
      <span className={styles.cellName}>{u.displayName || '—'}</span>
      {birthday && <span className={styles.cellShowMeta}>Д.р.: {birthday}</span>}
    </div>
  );
}

function UserEmail({ u }: { u: AdminUser }) {
  return (
    <div className={styles.stack}>
      <a href={`mailto:${u.email}`} className={styles.emailLink}>{breakableEmail(u.email)}</a>
      {u.provider && (
        <span className={styles.cellShowMeta}>{PROVIDER_LABELS[u.provider] ?? u.provider}</span>
      )}
    </div>
  );
}

/**
 * Телефон — только для показа (+33 7 49 66 19 40); в ссылку tel: уходит номер как хранится.
 * Прочерк нужен ячейке таблицы; в карточке пустое поле просто не показывается.
 */
function UserPhone({ u, dash = true }: { u: AdminUser; dash?: boolean }) {
  if (!u.phone) return dash ? <span className={styles.cellMuted}>—</span> : null;
  return (
    <a href={`tel:${u.phone.replace(/[^\d+]/g, '')}`} className={styles.phoneLink}>
      {formatPhoneForDisplay(u.phone)}
    </a>
  );
}

function UserRole({ u }: { u: AdminUser }) {
  return (
    <span className={`${styles.badge} ${u.role === 'admin' ? styles.badgeAdmin : ''}`}>
      {u.role}
    </span>
  );
}

function UserSocials({ u }: { u: AdminUser }) {
  const igUsername = resolveInstagramUsername(u);
  const contacts   = contactLabel(u);
  if (!igUsername && !u.facebookLinked && !contacts) {
    return <span className={styles.cellMuted}>Не указано</span>;
  }
  return (
    <div className={styles.stack}>
      {igUsername && (
        <span className={styles.cellShowMeta}>
          Instagram:{' '}
          <a
            href={instagramProfileUrl(igUsername)}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.emailLink}
          >
            @{igUsername}
          </a>
        </span>
      )}
      <span className={styles.cellShowMeta}>
        Facebook: {u.facebookLinked ? 'подключён' : 'не подключён'}
      </span>
      {contacts && <span className={styles.cellShowMeta}>Связь: {contacts}</span>}
    </div>
  );
}

function UserCreated({ u }: { u: AdminUser }) {
  return (
    <div className={styles.stack}>
      <span className={styles.cellMono}>{formatTimestamp(u.createdAt)}</span>
      {u.lastLoginAt && (
        <span className={styles.cellShowMeta}>Вход: {formatTimestamp(u.lastLoginAt)}</span>
      )}
    </div>
  );
}

function UserActions({ u, isBusy, canDelete, onConfirmAction, dash = true }: UserRowProps & { u: AdminUser; dash?: boolean }) {
  if (!canDelete) return dash ? <span className={styles.cellMuted}>—</span> : null;
  return (
    <div className={styles.actionsBlock}>
      <button
        className={styles.actionCancel}
        disabled={isBusy}
        onClick={() => onConfirmAction({
          type: 'deleteUser',
          uid: u.uid,
          displayName: u.displayName || u.email,
        })}
      >
        {isBusy ? '…' : 'Удалить'}
      </button>
    </div>
  );
}

function UserRow(props: UserRowProps) {
  const u = props.user;
  return (
    <tr>
      <td className={styles.cellWrap}><UserName u={u} /></td>
      <td className={styles.cellWrap}><UserEmail u={u} /></td>
      <td><UserPhone u={u} /></td>
      <td><UserRole u={u} /></td>
      <td className={styles.cellWrap}><UserSocials u={u} /></td>
      <td className={styles.cellCenter}>{u.notifications ? '✓' : '—'}</td>
      <td className={styles.cellCenter}>{(u.language ?? 'ru').toUpperCase()}</td>
      <td className={styles.cellWrap}><UserCreated u={u} /></td>
      <td className={styles.cellWrap}><UserActions u={u} {...props} /></td>
    </tr>
  );
}

function UserMobileCard(props: UserRowProps) {
  const u = props.user;
  return (
    <article className={styles.mCard}>
      <header className={styles.mHead}>
        <div className={styles.mWho}><UserName u={u} /></div>
        <UserRole u={u} />
      </header>

      <div className={styles.mContacts}>
        <UserPhone u={u} dash={false} />
        <UserEmail u={u} />
      </div>

      <dl className={styles.mGrid}>
        <div className={styles.mWide}><dt>Соцсети</dt><dd><UserSocials u={u} /></dd></div>
        <div><dt>Уведомления</dt><dd>{u.notifications ? 'Включены' : 'Выключены'}</dd></div>
        <div><dt>Язык</dt><dd>{(u.language ?? 'ru').toUpperCase()}</dd></div>
        <div className={styles.mWide}><dt>{t.admin.userCreatedAt}</dt><dd><UserCreated u={u} /></dd></div>
      </dl>

      <UserActions u={u} {...props} dash={false} />
    </article>
  );
}
