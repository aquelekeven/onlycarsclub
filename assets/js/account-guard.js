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
      location.replace("login.html");
      return;
    }

    const user = await client.getUser().catch(() => null);
    if (!user) {
      location.replace("login.html");
      return;
    }

    guestObserver?.disconnect();
  }

  redirectGuestToLogin();
})();
