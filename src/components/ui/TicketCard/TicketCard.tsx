import { useEffect, useState } from 'react';
import { generateTicketQR } from '../../../services/qrService';
import type { Booking } from '../../../types/booking';
import styles from './TicketCard.module.scss';

interface Props {
  booking: Booking;
}

export function TicketCard({ booking: b }: Props) {
  const [qrSrc,    setQrSrc]    = useState('');
  const [qrLoaded, setQrLoaded] = useState(false);

  useEffect(() => {
    setQrSrc('');
    setQrLoaded(false);
    generateTicketQR(b.ticketCode)
      .then(src => { setQrSrc(src); setQrLoaded(true); })
      .catch(() => { setQrLoaded(true); });
  }, [b.ticketCode]);

  return (
    <div className={styles.card}>
      <div className={styles.info}>
        <p className={styles.title}>{b.showTitle}</p>
        <p className={styles.meta}>{b.showDate} · {b.showTime}</p>
        <p className={styles.code}>{b.ticketCode}</p>
      </div>
      <div className={styles.qrWrap}>
        {qrSrc
          ? <img className={styles.qr} src={qrSrc} alt="QR-код билета" width={88} height={88} />
          : <div className={`${styles.qr} ${qrLoaded ? styles.qrError : styles.qrLoading}`} />
        }
      </div>
    </div>
  );
}
