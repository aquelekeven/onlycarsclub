(() => {
  let installPrompt = null;

  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  const isIos = () =>
    /iphone|ipad|ipod/i.test(window.navigator.userAgent);

  const createDialog = () => {
    const dialog = document.createElement("div");
    dialog.className = "app-install-dialog";
    dialog.hidden = true;
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "app-install-title");
    dialog.innerHTML = `
      <div class="app-install-card">
        <strong id="app-install-title">Instalar o Only Cars Club</strong>
        <p data-install-instruction></p>
        <p data-install-extra></p>
        <button class="button primary app-install-close" type="button">Entendi</button>
      </div>
    `;

    const close = () => {
      dialog.hidden = true;
      document.body.style.removeProperty("overflow");
    };

    dialog.querySelector(".app-install-close").addEventListener("click", close);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !dialog.hidden) close();
    });
    document.body.appendChild(dialog);
    return dialog;
  };

  const showInstructions = (dialog, iosDevice) => {
    const instruction = dialog.querySelector("[data-install-instruction]");
    const extra = dialog.querySelector("[data-install-extra]");

    if (iosDevice) {
      instruction.innerHTML =
        'No Safari, toque em <span class="app-install-share-icon" aria-label="Compartilhar">↥</span> <strong>Compartilhar</strong>.';
      extra.innerHTML =
        'Depois escolha <strong>Adicionar à Tela de Início</strong> e confirme em <strong>Adicionar</strong>.';
    } else {
      instruction.innerHTML =
        'Abra o menu do navegador e escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.';
      extra.textContent =
        "Em alguns navegadores, a instalação aparece como um ícone ao lado da barra de endereço.";
    }

    dialog.hidden = false;
    document.body.style.overflow = "hidden";
    dialog.querySelector(".app-install-close").focus();
  };

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    const button = document.querySelector("#install-app-button");
    if (button) button.hidden = true;
  });

  document.addEventListener("DOMContentLoaded", () => {
    const button = document.querySelector("#install-app-button");
    if (!button) return;

    if (isStandalone()) {
      button.hidden = true;
      return;
    }

    const dialog = createDialog();
    button.addEventListener("click", async () => {
      if (installPrompt) {
        const prompt = installPrompt;
        installPrompt = null;
        await prompt.prompt();
        await prompt.userChoice;
        return;
      }

      showInstructions(dialog, isIos());
    });
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js", { scope:"./" }).catch(() => {});
    });
  }
})();
