export function isSolitaireMahjongPage(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname.toLowerCase() === 'solitaire.net'
      && /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?mahjong\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}
