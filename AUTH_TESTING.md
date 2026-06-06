# Auth & Booking — Manual Testing Checklist

Run through each scenario after any auth-related change.
Check Firebase Console → Authentication → Users and Firestore → users/ in parallel.

---

## A. New email/password user

1. Open the site in an incognito window (no existing session).
2. Open booking modal or AuthModal → go to "Регистрация" tab.
3. Fill name, new email, password → submit.
4. **Expected**: modal closes, user is logged in.
5. Firebase Console → Authentication → Users → email appears.
6. Firestore → users/{uid} → document exists with:
   - `role: "user"`, `provider: "email"`, `displayName`, `email`, `createdAt`, `lastLoginAt`
7. Proceed to create a booking.
8. **Expected**: booking appears in Firestore → bookings/{id} with `userId` = the new uid.
9. **Expected**: confirmation email arrives at the registered email address.

---

## B. Existing email/password user — duplicate registration attempt

1. On the "Регистрация" tab, enter the **same email** as an already-registered account.
2. **Expected**: error message "Этот email уже зарегистрирован. Войдите в аккаунт или используйте Google."
3. **Expected**: the modal automatically switches to the "Вход" tab.
4. **Expected**: the email field retains the typed email.
5. Enter the correct password → login succeeds.
6. Firestore → users/{uid} → `lastLoginAt` is updated; `role` is unchanged.

---

## C. Google user

1. Click "Войти через Google" in AuthModal or BookingModal.
2. Select a Google account in the popup.
3. **Expected**: popup closes, user is logged in.
4. Firebase Console → Authentication → Users → Google account appears.
5. Firestore → users/{uid} → document exists with `provider: "google"`, `photoURL` set.
6. Create a booking.
7. **Expected**: confirmation email arrives at the Google account's email.

**Edge cases:**
- Close the popup without selecting an account → no error shown (silent dismiss).
- Popup blocked by browser → message: "Всплывающее окно заблокировано браузером."
- Domain not in Firebase Authorized Domains → message about unauthorized domain.

---

## D. Admin account

1. Log in with the admin email/password account.
2. Firestore → users/{uid} → `role: "admin"` must be present.
3. Log out and log back in.
4. **Expected**: `role` is still `"admin"` — `ensureUserDocument` never overwrites it.
5. Navigate to /admin → AdminPage loads without redirect.
6. Check that the Users tab in AdminPage shows all Firestore users.

---

## E. Dev debug logs (booking email recipient)

1. Run `npm run dev`.
2. Open DevTools → Console.
3. Create a booking as any non-admin user.
4. **Expected** console output:
   ```
   [BookingModal] booking recipient debug {
     uid: "<firebase-uid>",
     authEmail: "<user@example.com>",
     profileEmail: "<user@example.com>",
     bookingEmail: "<user@example.com>",
   }
   ```
5. Verify `bookingEmail` matches the logged-in user — NOT a hardcoded admin address.
6. These logs do NOT appear in production (`npm run build` + Vercel).

---

## F. Deleting a test user (full cleanup)

To completely remove a test account:

**Step 1 — Firebase Authentication:**
- Firebase Console → Authentication → Users
- Find the email → click ⋮ → "Delete account"

**Step 2 — Firestore user document:**
- Firestore → Collection: `users` → find document with the uid → Delete document

**Step 3 — Test bookings:**
- Firestore → Collection: `bookings`
- Filter by `userId` == the uid (use "Filter" in the Console)
- Delete each matching document

> After deletion: the email can be re-registered fresh without conflicts.

---

## G. Firebase Console — settings to verify

| Setting | Location | Required value |
|---------|----------|----------------|
| Email/Password sign-in | Authentication → Sign-in method | Enabled |
| Google sign-in | Authentication → Sign-in method | Enabled |
| Authorized domains | Authentication → Settings → Authorized domains | `localhost` + Vercel domain |
| Firestore rules | Firestore → Rules | Deployed from `firestore.rules` |

---

## Notes

- `ensureUserDocument` is in `src/context/AuthContext.tsx`.
- It is called from `onAuthStateChanged`, `signInWithGoogle`, `signInWithEmail`.
- `signUpWithEmail` writes the document explicitly to guarantee `displayName` from the form.
- Email recipient in booking: `user.email ?? userProfile?.email ?? ''` (Firebase Auth first).
- One booking = one email. `sendBookingStatusUpdateEmail` is only triggered manually from AdminPage.
