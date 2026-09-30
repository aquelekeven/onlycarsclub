(function () {
  "use strict";

  async function redirectGuestToLogin() {
    const guest = document.querySelector("[data-account-guest]");
    let guestObserver = null;

    if (guest) {
      guest.hidden = true;
      guestObserver = new MutationObserver(() => {
        if (!guest.hidden) guest.hidden = true;
      });
      guestObserver.observe(guest, { attributes:true, attributeFilter:["hidden"] });
    }

    const client = window.OnlySupabase;
    if (!client) {
      location.replace(`login.html?next=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }

    let user;
    try { user = await client.getUser(); } catch (_) { return; }
    if (!user) {
      location.replace(`login.html?next=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }

    guestObserver?.disconnect();
  }

  redirectGuestToLogin();
})();
