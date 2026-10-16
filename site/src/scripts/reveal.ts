import { unhide } from '../lib/obfuscate';

// e-mail addresses must be readable right away, so they are decoded on load
for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-mail]')) {
  link.href = unhide(link.dataset.mail!);
  link.textContent = unhide(link.dataset.mailText!);
  delete link.dataset.mail;
  delete link.dataset.mailText;
}

// the WhatsApp link exists only once a person points at, taps or focuses the button
for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-wa]')) {
  const reveal = () => {
    if (!link.dataset.wa) return;
    link.href = unhide(link.dataset.wa);
    link.target = '_blank';
    delete link.dataset.wa;
  };
  for (const type of ['pointerenter', 'touchstart', 'focus']) link.addEventListener(type, reveal, { once: true, passive: true });
  link.addEventListener('click', reveal);
}
