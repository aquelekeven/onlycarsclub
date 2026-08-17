import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const root = resolve(import.meta.dirname, "..");
const origin = "https://onlycarsclub.com.br";
const defaultImage = `${origin}/assets/images/paixao-comunidade.webp`;

const pages = {
  "index.html": ["Only Cars Club — Cultura automotiva e comunidade", "Um clube criado para aproximar pessoas, valorizar projetos e fortalecer a cultura automotiva com organização, segurança e respeito."],
  "sobre.html": ["O clube — Only Cars Club", "Conheça a história, os valores e as pessoas que movimentam a comunidade Only Cars Club."],
  "eventos.html": ["Eventos automotivos — Only Cars Club", "Acompanhe os encontros, experiências e próximos eventos da comunidade Only Cars Club."],
  "proximo-evento.html": ["Only Cars Meeting 2026 — Only Cars Club", "Exposição automotiva e drift em São Paulo. Confira data, local, lotes e garanta o ingresso Expo do Only Cars Meeting 2026."],
  "loja.html": ["Loja oficial — Only Cars Club", "Roupas e acessórios oficiais para quem vive a cultura automotiva Only Cars Club dentro e fora das ruas."],
  "produto.html": ["Produto oficial — Only Cars Club", "Confira detalhes, opções e disponibilidade dos produtos oficiais Only Cars Club."],
  "contato.html": ["Contato — Only Cars Club", "Fale com a equipe Only Cars Club sobre eventos, parcerias, pedidos e comunidade."],
  "termos.html": ["Termos de uso — Only Cars Club", "Consulte os termos de uso, compra, eventos e participação da Only Cars Club."],
  "privacidade.html": ["Política de privacidade — Only Cars Club", "Entenda como a Only Cars Club coleta, utiliza e protege seus dados pessoais."],
};

const privatePages = new Set([
  "admin.html", "cadastro.html", "carrinho.html", "confirmacao-email.html",
  "entrega.html", "ingresso.html", "ingresso-retorno.html", "login.html",
  "minha-conta.html", "pagamento.html", "recuperar-senha.html", "redefinir-senha.html",
]);

const allPages = [...Object.keys(pages), ...privatePages];

function upsertHead(html, matcher, markup) {
  if (matcher.test(html)) return html.replace(matcher, markup);
  return html.replace(/(<meta name="viewport"[^>]*>)/, `$1\n  ${markup}`);
}

for (const file of allPages) {
  const path = resolve(root, file);
  let html = await readFile(path, "utf8");
  const title = pages[file]?.[0] || html.match(/<title>(.*?)<\/title>/s)?.[1] || "Only Cars Club";
  const description = pages[file]?.[1] || "Área segura da Only Cars Club para clientes e administração.";
  const canonical = file === "index.html" ? `${origin}/` : `${origin}/${file}`;
  const robots = privatePages.has(file) ? "noindex,nofollow,noarchive" : "index,follow,max-image-preview:large";

  const metadata = [
    `<meta name="description" content="${description}">`,
    `<meta name="robots" content="${robots}">`,
    `<link rel="canonical" href="${canonical}">`,
    `<meta property="og:locale" content="pt_BR">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Only Cars Club">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:image" content="${defaultImage}">`,
    `<meta property="og:image:alt" content="Only Cars Club — cultura automotiva e comunidade">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
    `<meta name="twitter:image" content="${defaultImage}">`,
  ].join("\n  ");

  html = upsertHead(
    html,
    /  <meta name="description"[\s\S]*?<meta name="twitter:image"[^>]*>/,
    `  ${metadata}`,
  );
  html = html.replace(/<img(?![^>]*\bdecoding=)([^>]*?)>/g, '<img decoding="async"$1>');
  html = html.replace(/assets\/js\/main\.js\?v=[^"']+/g, "assets/js/main.js?v=20260816-audit-v146");
  await writeFile(path, html);
}

const homePath = resolve(root, "index.html");
let home = await readFile(homePath, "utf8");
const schema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Only Cars Club",
  url: `${origin}/`,
  logo: `${origin}/assets/images/logotipo-only-branco-color.png`,
  email: "contato@onlycarsclub.com.br",
  sameAs: [
    "https://www.instagram.com/onlycars.club/",
    "https://www.youtube.com/@onlycarsclub",
    "https://www.tiktok.com/@onlycars.club",
  ],
};
const structuredData = JSON.stringify(schema);
const hash = createHash("sha256").update(structuredData).digest("base64");
home = home.replace(/script-src 'self'(?: 'sha256-[^']+')?/, `script-src 'self' 'sha256-${hash}'`);
if (!home.includes('application/ld+json')) {
  home = home.replace("</head>", `  <script type="application/ld+json">${structuredData}</script>\n</head>`);
} else {
  home = home.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">${structuredData}</script>`);
}
await writeFile(homePath, home);

console.log(`Metadados e melhorias de carregamento aplicados em ${allPages.length} páginas.`);
