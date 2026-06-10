// ── Types ──

export type PaymentAccountType = 'iban' | 'card';

interface PaymentAccountBase {
  id:           string;
  type:         PaymentAccountType;
  label:        string;
  description:  string;
  receiverName: string;
  bankName?:    string;
  currency:     string;
}

export interface IbanPaymentAccount extends PaymentAccountBase {
  type: 'iban';
  iban: string;
  bic:  string;
}

export interface CardPaymentAccount extends PaymentAccountBase {
  type:       'card';
  cardNumber: string;
}

export type PaymentAccount = IbanPaymentAccount | CardPaymentAccount;

// ── Config ──

export const PAYMENT_CONFIG = {
  receiverName:           'Théâtre Tête-à-Tête',
  paymentEmail:           'teteatete.theatre.nice@gmail.com',
  paymentPhone:           '+33 6 13 67 55 95',
  address:                '24 Rue Rossini, 06000 Nice',
  paymentReferencePrefix: 'TETEATETE',
  paymentExpiryHours:     24,
  googleMapsUrl:          'https://www.google.com/maps/place/%D0%A2%D0%B5%D0%B0%D1%82%D1%80+%D0%A2%D0%B5%D1%82-%D0%90-%D0%A2%D0%B5%D1%82+%D0%9D%D0%B8%D1%86%D1%86%D0%B0/@43.7005671,7.2556104,1653m/data=!3m1!1e3!4m10!1m2!2m1!1stete+a+tete!3m6!1s0x12cdd1bec851f20d:0x6b3d9e1b208ecb3e!8m2!3d43.7006246!4d7.2606567!15sCgt0ZXRlIGEgdGV0ZZIBD2FtYXRldXJfdGhlYXRyZeABAA!16s%2Fg%2F11ld_pl36q?entry=ttu&g_ep=EgoyMDI2MDYwMS4wIKXMDSoASAFQAw%3D%3D',

  paymentAccounts: [
    {
      id:           'fr_eu_bank',
      type:         'iban' as const,
      label:        'France / Union européenne',
      description:  'Virement bancaire SEPA',
      receiverName: 'Théâtre Tête-à-Tête',
      iban:         'FR76 3000 4007 0900 0024 0656 507',
      bic:          'BNPAFRPPXXX',
      bankName:     'BNP Paribas',
      currency:     'EUR',
    },
  ] as PaymentAccount[],
};

// ── Helper ──

export function getPaymentAccount(id: string | undefined): PaymentAccount {
  if (!id) return PAYMENT_CONFIG.paymentAccounts[0];
  return PAYMENT_CONFIG.paymentAccounts.find(a => a.id === id)
    ?? PAYMENT_CONFIG.paymentAccounts[0];
}

