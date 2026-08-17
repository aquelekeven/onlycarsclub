import { access, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "index.html", "sobre.html", "eventos.html", "proximo-evento.html", "loja.html",
  "produto.html", "contato.html", "termos.html", "privacidade.html", "admin.html",
  "cadastro.html", "carrinho.html", "confirmacao-email.html", "entrega.html",
  "ingresso.html", "ingresso-retorno.html", "login.html", "minha-conta.html",
  "pagamento.html", "recuperar-senha.html", "redefinir-senha.html",
];
const errors = [];

for (const file of files) {
  const html = await readFile(resolve(root, file), "utf8");
  for (const required of ['name="description"', 'name="robots"', 'rel="canonical"', 'property="og:title"', 'name="twitter:card"', "Content-Security-Policy"]) {
    if (!html.includes(required)) errors.push(`${file}: ausente ${required}`);
  }
  if (!html.includes("<title>") || !html.includes("<h1")) errors.push(`${file}: título ou H1 ausente`);
  const refs = [...html.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)].map((match) => match[1]);
  for (const ref of refs) {
    if (/^(?:https?:|mailto:|tel:|javascript:|data:|\/)/.test(ref)) continue;
    try { await access(resolve(root, ref)); } catch { errors.push(`${file}: referência inexistente ${ref}`); }
  }
}

for (const file of ["robots.txt", "sitemap.xml", "404.html", "manifest.webmanifest"]) {
  try { await access(resolve(root, file)); } catch { errors.push(`arquivo obrigatório ausente: ${file}`); }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`OK: ${files.length} páginas verificadas, sem referências locais quebradas.`);
}
