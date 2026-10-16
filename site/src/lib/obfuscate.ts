// Simple scraper guard: values sit in the HTML reversed and base64-encoded (UTF-8 safe),
// so bots that only read the page source find no phone number or e-mail address.
export function hide(value: string): string {
  const bytes = new TextEncoder().encode([...value].reverse().join(''));
  return btoa(String.fromCharCode(...bytes));
}

export function unhide(encoded: string): string {
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  return [...new TextDecoder().decode(bytes)].reverse().join('');
}
