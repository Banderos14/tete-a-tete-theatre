// iPhone/iPad, но не Safari: Chrome, Firefox, Edge, встроенные браузеры приложений.
//
// Нужно одной подсказке на странице билета: вход в Firebase хранится в том
// браузере, где зритель входил, а iOS открывает ссылки из писем в браузере по
// умолчанию. Safari мы не открываем и не обещаем — только подсказываем.
//
// Safari узнаётся по «Version/… Safari/» без маркеров других браузеров; у
// WKWebView встроенных браузеров токена Safari/ нет. SFSafariViewController
// неотличим от Safari — там подсказки не будет, и это безопасная сторона.

const OTHER_IOS_BROWSERS = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|YaBrowser|DuckDuckGo|Brave|FBAN|FBAV|Instagram|Line\/|Twitter|LinkedInApp|Snapchat|GmailApp/i;

export function isIos(ua: string, maxTouchPoints = 0): boolean {
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  // iPadOS в режиме «как на компьютере» представляется Mac'ом с тачскрином.
  return /Macintosh/.test(ua) && maxTouchPoints > 1;
}

export function isIosSafari(ua: string): boolean {
  return /Version\/[\d.]+.*Safari\//.test(ua) && !OTHER_IOS_BROWSERS.test(ua);
}

export function isIosNonSafari(ua: string, maxTouchPoints = 0): boolean {
  return isIos(ua, maxTouchPoints) && !isIosSafari(ua);
}

export function currentIsIosNonSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  return isIosNonSafari(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}
