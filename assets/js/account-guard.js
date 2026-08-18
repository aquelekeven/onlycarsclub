(function () {
  "use strict";

  async function redirectGuestToLogin() {
    const client = window.OnlySupabase;
    if (!client) {
      location.replace("login.html");
      return;
    }

    const user = await client.getUser().catch(() => null);
    if (!user) location.replace("login.html");
  }

  redirectGuestToLogin();
})();
