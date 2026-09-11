// Vercel Serverless Function — публичный остаток мест по спектаклям.
//
// Нужен, потому что клиент физически не может посчитать занятость сам: правила
// Firestore не разрешают ему читать чужие брони. Раньше клиентская подписка
// молча падала с permission-denied, и интерфейс всегда показывал полный зал
// свободным — постоянная неправда.
//
// Ответ не содержит никаких персональных данных — только числа.
// Авторитетная проверка вместимости всё равно происходит в /api/create-booking.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from './_lib/firebaseAdmin.js';
import { respond, corsHeaders } from './_lib/http.js';
import { sumOccupiedTickets } from './_lib/bookingRules.js';
import { SHOWS, THEATRE_CAPACITY } from './_lib/shows.js';

interface ShowAvailability {
  capacity:  number;
  sold:      number;
  remaining: number;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') { respond(res, 204, {}, req); return; }
  if (req.method !== 'GET')     { respond(res, 405, { error: 'Method not allowed' }, req); return; }

  const showIds = Object.keys(SHOWS);
  const availability: Record<string, ShowAvailability> = {};
  for (const id of showIds) {
    availability[id] = { capacity: THEATRE_CAPACITY, sold: 0, remaining: THEATRE_CAPACITY };
  }

  try {
    const db = getFirestore(getAdminApp());
    // Один запрос на все спектакли афиши (их единицы, лимит 'in' — 30 значений).
    const snap = await db.collection('bookings').where('showId', 'in', showIds).get();

    const byShow: Record<string, Array<{ status: string; paymentStatus: string; ticketsCount?: number }>> = {};
    snap.docs.forEach((d) => {
      const data   = d.data() as Record<string, unknown>;
      const showId = String(data.showId ?? '');
      if (!availability[showId]) return;
      (byShow[showId] ??= []).push({
        status:        String(data.status ?? ''),
        paymentStatus: String(data.paymentStatus ?? ''),
        ticketsCount:  typeof data.ticketsCount === 'number' ? data.ticketsCount : undefined,
      });
    });
    for (const id of showIds) {
      availability[id]!.sold = sumOccupiedTickets(byShow[id] ?? []);
    }

    for (const id of showIds) {
      const entry = availability[id]!;
      entry.remaining = Math.max(0, entry.capacity - entry.sold);
    }
  } catch (err) {
    console.error('[show-availability] read failed:', err);
    respond(res, 503, { error: 'Availability temporarily unavailable' }, req);
    return;
  }

  // Небольшой edge-кэш: остаток мест не обязан быть посекундно точным,
  // а публичный endpoint не должен превращаться в источник лишних чтений Firestore.
  res.writeHead(200, {
    'Content-Type':  'application/json',
    'Cache-Control': 'public, max-age=15, s-maxage=15, stale-while-revalidate=60',
    ...corsHeaders(req),
  });
  res.end(JSON.stringify({ ok: true, shows: availability }));
}
