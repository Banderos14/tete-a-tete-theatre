// Вкладка «Пользователи»: список аккаунтов и полное удаление.

import { RU } from '../../i18n';
import { resolveInstagramUsername, instagramProfileUrl } from '../../utils/instagram';
import type { AdminUser } from '../../services/userService';
import { formatTimestamp, contactLabel, formatBirthday, PROVIDER_LABELS } from './adminFormatting';
import type { ConfirmAction } from './adminTypes';
import styles from './AdminPage.module.scss';
import { formatPhoneForDisplay } from '../../utils/phoneDisplay';

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
        <div className={styles.tableWrap}>
          <table className={styles.table}>
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
      )}
    </>
  );
}

function UserRow({ user: u, isBusy, canDelete, onConfirmAction }: {
  user: AdminUser;
  isBusy: boolean;
  canDelete: boolean;
  onConfirmAction: (a: ConfirmAction) => void;
}) {
  const igUsername = resolveInstagramUsername(u);
  const contacts   = contactLabel(u);
  const hasSocials = !!igUsername || u.facebookLinked || !!contacts;
  const birthday   = formatBirthday(u.birthday);

  return (
    <tr>
      <td className={styles.cellName}>
        {u.displayName || '—'}
        {birthday && <p className={styles.cellShowMeta}>Д.р.: {birthday}</p>}
      </td>
      <td>
        <a href={`mailto:${u.email}`} className={styles.emailLink}>{u.email}</a>
        {u.provider && (
          <p className={styles.cellShowMeta}>{PROVIDER_LABELS[u.provider] ?? u.provider}</p>
        )}
      </td>
      <td>{formatPhoneForDisplay(u.phone) || '—'}</td>
      <td>
        <span className={`${styles.badge} ${u.role === 'admin' ? styles.badgeAdmin : ''}`}>
          {u.role}
        </span>
      </td>
      <td>
        {hasSocials ? (
          <>
            {igUsername && (
              <p className={styles.cellShowMeta}>
                Instagram:{' '}
                <a
                  href={instagramProfileUrl(igUsername)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.emailLink}
                >
                  @{igUsername}
                </a>
              </p>
            )}
            <p className={styles.cellShowMeta}>
              Facebook: {u.facebookLinked ? 'подключён' : 'не подключён'}
            </p>
            {contacts && (
              <p className={styles.cellShowMeta}>Связь: {contacts}</p>
            )}
          </>
        ) : (
          <span className={styles.cellMuted}>Не указано</span>
        )}
      </td>
      <td className={styles.cellCenter}>{u.notifications ? '✓' : '—'}</td>
      <td className={styles.cellCenter}>{(u.language ?? 'ru').toUpperCase()}</td>
      <td>
        <span className={styles.cellMono}>{formatTimestamp(u.createdAt)}</span>
        {u.lastLoginAt && (
          <p className={styles.cellShowMeta}>Вход: {formatTimestamp(u.lastLoginAt)}</p>
        )}
      </td>
      <td>
        {canDelete && (
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
        )}
      </td>
    </tr>
  );
}
