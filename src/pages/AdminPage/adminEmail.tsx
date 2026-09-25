// E-mail с точками переноса после «@» и перед точками: длинный адрес
// переносится по частям (anna.petrova@ / example.com), а не посреди слова.
// Общий для таблиц «Бронирования» и «Зрители».

export function breakableEmail(email: string) {
  return email.split(/(?<=@)|(?=\.)/).map((part, i) => <span key={i}>{i > 0 && <wbr />}{part}</span>);
}
