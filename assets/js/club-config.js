// Set storeEnabled to true to restore the preserved storefront and account sections.
window.OnlyClubConfig = Object.freeze({ storeEnabled: false, instagram: 'onlycars.club' });
document.documentElement.classList.toggle('store-paused', !window.OnlyClubConfig.storeEnabled);
document.addEventListener('DOMContentLoaded', () => {
  if (window.OnlyClubConfig.storeEnabled) {
    document.querySelectorAll('template[data-store-legacy]').forEach(template => template.replaceWith(template.content.cloneNode(true)));
    document.querySelectorAll('[data-store-placeholder]').forEach(node => node.remove());
  }
});
