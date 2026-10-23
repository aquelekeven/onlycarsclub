(() => {
  'use strict';
  const dialog = document.querySelector('[data-ticket-access]');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const key = 'onlycars.ticketAccessDismissed.v1';
  try { if (sessionStorage.getItem(key)) return; } catch (_) {}
  const remember = () => { try { sessionStorage.setItem(key, '1'); } catch (_) {} };
  dialog.querySelectorAll('[data-ticket-access-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });
  dialog.querySelector('[data-ticket-access-link]').addEventListener('click', remember);
  dialog.addEventListener('close', () => {
    remember();
    document.body.classList.remove('ticket-access-open');
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  document.body.classList.add('ticket-access-open');
  dialog.showModal();
  dialog.querySelector('[data-ticket-access-link]').focus({ preventScroll: true });
})();
