// Доступ к Firestore из почтового слоя.

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAdminApp } from '../shared/firebaseAdmin.js';
import type { DeliveryStatus, EmailType } from './email.types.js';

/**
 * Письмо-подтверждение можно отправить только по СВОЕЙ реальной брони.
 * Без этой проверки endpoint работал генератором произвольных писем от имени
 * театра: любой авторизованный пользователь мог отправить себе что угодно.
 */
export async function ownsBookingWithTicketCode(uid: string, ticketCode: string): Promise<boolean> {
  try {
    const snap = await getFirestore(getAdminApp())
      .collection('bookings')
      .where('ticketCode', '==', ticketCode)
      .limit(1)
      .get();
    if (snap.empty) return false;
    return snap.docs[0]!.data()?.userId === uid;
  } catch {
    return false;
  }
}

/**
 * Техническое состояние доставки.
 *
 * Раньше узнать, ушло ли письмо, из приложения было невозможно — только
 * в дашборде Resend. Пишем компактную запись: без адреса получателя (он уже
 * хранится в брони, дублировать персональные данные в лог незачем) — хватает
 * uid, типа письма и ответа провайдера.
 */
export async function logEmailDelivery(entry: {
  type: EmailType; uid: string; status: DeliveryStatus;
  providerStatus?: number; ticketCode?: string;
}): Promise<void> {
  try {
    await getFirestore(getAdminApp()).collection('emailLog').add({
      ...entry,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    // Журнал доставки — вспомогательный: его сбой не должен влиять на письмо.
    console.warn('[send-email] delivery log write failed:', err);
  }
}
