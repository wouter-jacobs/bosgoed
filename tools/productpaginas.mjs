// Maakt per product een losse landingspagina (bijv. /sleutelhangers/) uit
// data/producten.json, data/galerij.json en data/site.json. De pagina's staan
// niet in het menu van de site; ze zijn bedoeld voor wie via Google op een
// specifiek product zoekt, en linken door naar de gewone onepage-site.
//
// Gebruik:
//   node tools/productpaginas.mjs                 -> schrijft alle pagina's in de site
//   node tools/productpaginas.mjs --voorbeeld <slug> <bestand>
//        -> schrijft één losse voorbeeldpagina (met volledige URL's) naar <bestand>
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const BASIS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_URL = "https://bos-goed.nl/";
const LOGBOEK = path.join(BASIS, "data", "productpaginas.json"); // welke mappen dit script beheert
const GERESERVEERD = new Set(["zakelijk", "ophalen-en-verzenden", "voorwaarden", "beheer", "verklein", "klein", "data", "fotos", "beeld", "tools", "admin", ".github"]);
const VASTE_REGEL = "Met de laser gemaakt in Zeerijp";

const lees = f => JSON.parse(fs.readFileSync(path.join(BASIS, f), "utf8"));
const html = fs.readFileSync(path.join(BASIS, "index.html"), "utf8");
const esc = t => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// --- stukken die we letterlijk van de homepage overnemen ---
const STIJL = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const LETTERS = (html.match(/<link rel="preconnect"[\s\S]*?display=swap" rel="stylesheet">/) || [""])[0];
const BAKEN = (html.match(/<!-- Cloudflare Web Analytics -->[\s\S]*?<!-- End Cloudflare Web Analytics -->/) || [""])[0];
const ZO_WERKT_HET = (html.match(/<section id="zo-werkt-het">[\s\S]*?<\/section>/) || [""])[0];

// --- functies uit het script van de homepage (tekeningen, soorten, whatsapp) ---
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const niets = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => "" : niets), apply: () => niets, set: () => true });
const omgeving = vm.createContext({
  document: { getElementById: () => niets, querySelector: () => niets, querySelectorAll: () => [], createElement: () => niets, head: { appendChild() {} } },
  window: niets, requestAnimationFrame: () => {}, URL, encodeURI, encodeURIComponent, JSON, Math, Number, String, Array, Object, Set, Boolean, console
});
vm.runInContext(scripts[scripts.length - 1].replace(/\nstart\(\);\s*$/, "\n"), omgeving);

// --- gegevens ---
const SITE = lees("data/site.json");
const VERZENDING = fs.existsSync(path.join(BASIS, "data/verzending.json")) ? lees("data/verzending.json") : null;
const VOORWAARDEN = fs.existsSync(path.join(BASIS, "data/voorwaarden.json")) ? lees("data/voorwaarden.json") : null;
const WHATSAPP = omgeving.whatsappNummer(SITE.whatsapp);
let WERK = lees("data/producten.json");
WERK = (Array.isArray(WERK) ? WERK : WERK.producten || []).filter(s => s && s.titel);
let GALERIJ = lees("data/galerij.json");
GALERIJ = (Array.isArray(GALERIJ) ? GALERIJ : GALERIJ.fotos || []).filter(x => x && x.foto);

// Zelfde functie als in index.html, zodat het linkje in het pop-upvenster altijd klopt.
const slugVan = titel => omgeving.slugVan(titel);

function fotosVoor(stuk) {
  const naam = stuk.titel.toLowerCase();
  // Woorddelen om op te zoeken; algemene woorden als "houten" tellen niet mee,
  // anders komt bijvoorbeeld houten speelgoed bij de houten kaarten terecht.
  const algemeen = ["houten", "gegraveerde", "gegraveerd", "voordeur", "naam"];
  const stukjes = naam.split(/\s+/).filter(w => w.length >= 5 && !algemeen.includes(w)).map(w => w.slice(0, Math.min(7, Math.max(5, w.length - 2))));
  const bij = g => String(g.onderschrift || "").toLowerCase();
  const eigen = (Array.isArray(stuk.fotos) ? stuk.fotos : []).filter(Boolean)
    .map(f => ({ foto: typeof f === "string" ? f : f.foto, onderschrift: stuk.titel })).filter(f => f.foto);
  // Eerst foto's met de volledige productnaam in het onderschrift, daarna gedeeltelijke treffers.
  const uitGalerij = [
    ...GALERIJ.filter(g => bij(g).includes(naam)),
    ...GALERIJ.filter(g => !bij(g).includes(naam) && stukjes.some(s => bij(g).includes(s))),
  ];
  const gezien = new Set();
  return [...eigen, ...uitGalerij].filter(f => !gezien.has(f.foto) && gezien.add(f.foto)).slice(0, 12);
}

function vanafPrijs(tekst) {
  const m = String(tekst || "").match(/(\d+)(?:[,.](\d{1,2}))?/);
  return m ? Number(m[1] + "." + (m[2] || "0").padEnd(2, "0")) : null;
}

function beschrijving(stuk) {
  let t = String(stuk.tekst || "").trim().replace(/\s+/g, " ");
  const prijs = stuk.prijs ? " " + String(stuk.prijs).replace(/,-$/, "").replace(/^./, c => c.toUpperCase()) + "." : "";
  const rest = ` Met de laser gemaakt in Zeerijp (Groningen).${prijs} Ophalen in Zeerijp of verzenden.`;
  if ((t + rest).length > 160) t = t.slice(0, Math.max(60, 157 - rest.length)).replace(/\s+\S*$/, "") + "…";
  return (t + rest).trim();
}

function pagina(stuk, alle, basis, o = {}) {
  const slug = o.slug || slugVan(stuk.titel);
  const url = SITE_URL + slug + "/";
  const a = p => basis + p.replace(/^\//, "");          // pad naar een bestand op de site
  const fotos = o.fotos || fotosVoor(stuk);
  const tekst = String(stuk.uitgebreid || stuk.tekst || "").trim();
  const titel = o.titel || `${stuk.titel} laten maken – ${SITE.naam} ${SITE.plaats}`;
  const omschrijving = o.beschrijving || beschrijving(stuk);
  const deelbeeld = fotos.length ? SITE_URL + encodeURI(fotos[0].foto.replace(/^\//, "")) : SITE_URL + "beeld/delen.jpg";
  const bericht = o.bericht || `Hoi Nienke, ik heb een vraag over: ${stuk.titel}. `;

  // Grote foto bovenaan; klikken opent dezelfde lichtbak als op de homepage.
  const kleinImg = (f, i) =>
    `<img src="${esc(a(omgeving.kleinPad(f.foto)))}" alt="${esc(f.onderschrift || stuk.titel)}" loading="${i < 2 ? "eager" : "lazy"}" onerror="this.onerror=null;this.src='${esc(a(f.foto))}'">`;
  const beeld = o.beeld !== undefined ? o.beeld : fotos.length
    ? `<div class="pp-fotos pp-een"><button type="button" class="pp-foto pp-groot" data-i="0">${kleinImg(fotos[0], 0)}</button></div>`
    : `<div class="pp-fotos pp-een"><span class="beeld pp-groot">${omgeving.tekening(omgeving.kiesTekening(stuk))}</span></div>`;
  // Overige foto's in dezelfde schuifbalk als het blok Inspiratie op de homepage.
  const meerFotos = fotos.length > 1
    ? `<section id="fotos">
    <div class="wrap">
      <h2>Foto's</h2>
      <div class="galerij">
        <ul class="spoor" id="spoor" aria-label="Foto's van ${esc(stuk.titel)}">${fotos.slice(1).map((f, i) =>
          `<li><button type="button" data-i="${i + 1}"><span class="foto">${kleinImg(f, i + 1)}</span>${f.onderschrift ? `<span class="onderschrift">${esc(f.onderschrift)}</span>` : ""}</button></li>`).join("")}</ul>
        <div class="pijlen">
          <button class="pijl" type="button" id="terug" aria-label="Vorige foto's">&#8592;</button>
          <button class="pijl" type="button" id="verder" aria-label="Volgende foto's">&#8594;</button>
        </div>
      </div>
    </div>
  </section>`
    : "";
  const lichtbak = fotos.length
    ? `<dialog id="lichtbak" aria-label="Foto vergroot" tabindex="-1">
  <img id="lichtbak-foto" alt="">
  <div class="balk">
    <p id="lichtbak-tekst"></p>
    <button class="pijl" type="button" id="lichtbak-terug" aria-label="Vorige foto"${fotos.length > 1 ? "" : " hidden"}>&#8592;</button>
    <button class="pijl" type="button" id="lichtbak-verder" aria-label="Volgende foto"${fotos.length > 1 ? "" : " hidden"}>&#8594;</button>
    <a class="vraag" id="lichtbak-vraag" href="${WHATSAPP ? `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(bericht)}` : a("/#contact")}">Vraag hiernaar</a>
    <button class="sluit" type="button" id="lichtbak-sluit">Sluiten</button>
  </div>
</dialog>
<script>
(function () {
  var FOTOS = ${JSON.stringify(fotos.map(f => ({ src: a(f.foto), tekst: f.onderschrift || stuk.titel }))).replace(/</g, "\\u003c")};
  var bak = document.getElementById("lichtbak"), img = document.getElementById("lichtbak-foto"), huidig = 0;
  function open(i) {
    huidig = (i + FOTOS.length) % FOTOS.length;
    img.src = FOTOS[huidig].src; img.alt = FOTOS[huidig].tekst;
    document.getElementById("lichtbak-tekst").textContent = FOTOS[huidig].tekst;
    if (!bak.open) { if (bak.showModal) bak.showModal(); else bak.setAttribute("open", ""); bak.focus({ preventScroll: true }); }
  }
  document.querySelectorAll("[data-i]").forEach(function (k) { k.addEventListener("click", function () { open(+k.dataset.i); }); });
  document.getElementById("lichtbak-terug").addEventListener("click", function () { open(huidig - 1); });
  document.getElementById("lichtbak-verder").addEventListener("click", function () { open(huidig + 1); });
  document.getElementById("lichtbak-sluit").addEventListener("click", function () { bak.close(); });
  bak.addEventListener("click", function (e) { if (e.target === bak) bak.close(); });
  bak.addEventListener("keydown", function (e) { if (e.key === "ArrowLeft") open(huidig - 1); if (e.key === "ArrowRight") open(huidig + 1); });
  var start = null;
  bak.addEventListener("touchstart", function (e) { start = e.touches[0].clientX; }, { passive: true });
  bak.addEventListener("touchend", function (e) { if (start === null) return; var d = e.changedTouches[0].clientX - start; if (Math.abs(d) > 50) open(huidig + (d < 0 ? 1 : -1)); start = null; });
  var spoor = document.getElementById("spoor");
  if (!spoor) return;
  function stap() { var li = spoor.querySelector("li"); return li ? li.getBoundingClientRect().width + 20 : spoor.clientWidth; }
  function pijlen() {
    document.getElementById("terug").disabled = spoor.scrollLeft <= 2;
    document.getElementById("verder").disabled = spoor.scrollLeft >= spoor.scrollWidth - spoor.clientWidth - 2;
  }
  document.getElementById("terug").addEventListener("click", function () { spoor.scrollBy({ left: -stap() }); });
  document.getElementById("verder").addEventListener("click", function () { spoor.scrollBy({ left: stap() }); });
  spoor.addEventListener("scroll", function () { requestAnimationFrame(pijlen); }, { passive: true });
  window.addEventListener("resize", pijlen);
  window.addEventListener("load", pijlen);
  pijlen();
})();
</script>`
    : "";

  const meer = (o.meer || alle.filter(s => s !== stuk)).map(s =>
    `<a class="pp-chip" href="${esc(basis === "/" ? "/" + slugVan(s.titel) + "/" : SITE_URL + slugVan(s.titel) + "/")}">${esc(s.titel)}</a>`).join("");

  const prijs = vanafPrijs(stuk.prijs);
  const ld = o.ld ? o.ld(url, fotos) : {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Product", "@id": url + "#product", name: stuk.titel, description: tekst || stuk.titel, url,
        image: fotos.length ? fotos.map(f => SITE_URL + encodeURI(f.foto.replace(/^\//, ""))) : [SITE_URL + "beeld/delen.jpg"],
        brand: { "@type": "Brand", name: SITE.naam }, material: "Hout", category: (stuk.soort || []).join(", "),
        ...(prijs !== null ? { offers: { "@type": "Offer", price: prijs, priceCurrency: "EUR", availability: "https://schema.org/PreOrder",
          priceSpecification: { "@type": "PriceSpecification", minPrice: prijs, priceCurrency: "EUR" }, seller: { "@id": SITE_URL + "#bedrijf" },
          // Alles wordt op maat gemaakt na overleg en akkoord van de klant: niet retourneerbaar.
          hasMerchantReturnPolicy: { "@type": "MerchantReturnPolicy", applicableCountry: "NL", returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted" } } } : {}) },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE.naam, item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Producten", item: SITE_URL + "#werk" },
        { "@type": "ListItem", position: 3, name: stuk.titel, item: url } ] }
    ]
  };

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titel)}</title>
<meta name="description" content="${esc(omschrijving)}">
<link rel="canonical" href="${url}">${o.noindex ? '\n<meta name="robots" content="noindex, follow">' : ""}
<meta property="og:type" content="${o.ld ? "website" : "product"}">
<meta property="og:locale" content="nl_NL">
<meta property="og:site_name" content="${esc(SITE.naam)}">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(titel)}">
<meta property="og:description" content="${esc(omschrijving)}">
<meta property="og:image" content="${esc(deelbeeld)}">
<link rel="icon" type="image/png" sizes="64x64" href="${a("/beeld/favicon.png")}">
<link rel="apple-touch-icon" href="${a("/apple-touch-icon.png")}">
<meta name="theme-color" content="#edf0e4">
${LETTERS}
<style>${STIJL}
  .pp-pad { padding-block: 1rem 3.5rem; }
  .pp-kruimel { font-size: .9rem; margin: 0 0 1.5rem; color: #5c6b58; }
  .pp-kruimel a { color: inherit; }
  .pp-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 3rem; align-items: start; }
  .pp-grid h1 { font-family: var(--display); font-weight: 300; font-size: clamp(2.4rem, 5.5vw, 4rem); line-height: 1.05; margin: 0 0 .4rem; }
  .pp-regel { margin: 0 0 .9rem; color: #5c6b58; }
  .pp-tekst { margin: 1.25rem 0 1.75rem; max-width: 34rem; white-space: pre-line; }
  .pp-fotos { display: grid; grid-template-columns: 2fr 1fr; gap: .75rem; }
  .pp-fotos.pp-een { grid-template-columns: 1fr; }
  .pp-kort { align-self: start; background: var(--blad); border-radius: 10px; padding: 1.4rem 1.6rem; box-shadow: 4px 5px 0 rgba(44,58,42,.18); }
  .pp-kort h2 { font-size: 1.3rem; margin: 0 0 .8rem; }
  .pp-kort dl { margin: 0; display: grid; gap: .7rem; }
  .pp-kort dt { font-size: .8rem; letter-spacing: .08em; text-transform: uppercase; opacity: .75; }
  .pp-kort dd { margin: 0; font-weight: 600; }
  .pp-vragen { max-width: 46rem; border-top: 1px solid rgba(44,58,42,.25); }
  .pp-vragen details { border-bottom: 1px solid rgba(44,58,42,.25); }
  .pp-vragen summary { list-style: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem 0; }
  .pp-vragen summary::-webkit-details-marker { display: none; }
  .pp-vragen summary::after { content: "+"; flex: none; display: grid; place-items: center; width: 2rem; height: 2rem; font-size: 1.4rem; line-height: 1; background: var(--blad); border-radius: 55% 45% 50% 50% / 50% 55% 45% 50%; transition: transform .2s; }
  .pp-vragen details[open] summary::after { transform: rotate(45deg); }
  .pp-vragen summary:hover h3 { text-decoration: underline; text-underline-offset: .2em; }
  .pp-vragen h3 { font-size: 1.15rem; font-weight: 600; margin: 0; }
  .pp-antwoord { padding: 0 3rem 1.2rem 0; }
  .pp-antwoord p { margin: 0 0 .6rem; }
  footer .voet-link { margin-left: 1rem; color: inherit; }
  .pp-artikelen { max-width: 46rem; counter-reset: artikel; padding: 0; margin: 0; list-style: none; }
  .pp-artikelen.pp-vragen { border-top: 0; }
  .pp-artikelen li { counter-increment: artikel; }
  .pp-artikelen li:first-child details { border-top: 1px solid rgba(44,58,42,.25); }
  .pp-artikelen h3 { font-size: 1.15rem; font-weight: 600; margin: 0; }
  .pp-alles { margin: 0 0 1rem; }
  .pp-alles .knop { padding: .5rem 1.1rem; font-size: .95rem; }
  .pp-artikelen h3::before { content: "Artikel " counter(artikel) " – "; font-weight: 400; opacity: .7; }
  .pp-artikelen p { margin: 0 0 .6rem; white-space: pre-line; }
  .pp-grid.pp-enkel { grid-template-columns: 1fr; max-width: 46rem; }
  .pp-bijgewerkt { margin-top: 1.5rem; font-size: .9rem; opacity: .75; }
  .pp-foto { display: block; width: 100%; padding: 0; border: 0; cursor: zoom-in; border-radius: 10px; overflow: hidden; aspect-ratio: 1; background: var(--blad); box-shadow: 4px 5px 0 rgba(44,58,42,.18); }
  .pp-foto img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .pp-groot { grid-row: span 3; aspect-ratio: 4 / 5; }
  .pp-een .pp-groot { aspect-ratio: 4 / 3; grid-row: auto; }
  .pp-chips { display: flex; flex-wrap: wrap; gap: .5rem; margin: 0 0 2rem; }
  .pp-chip { text-decoration: none; background: var(--grond); border: 1px solid var(--blad); border-radius: 999px; padding: .35rem .9rem; font-size: .95rem; }
  .pp-chip:hover { background: var(--blad); }
  @media (max-width: 800px) {
    .pp-grid { grid-template-columns: 1fr; gap: 1.5rem; }
    .pp-fotos { order: -1; }
  }
</style>
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
</head>
<body>

<header class="wrap kop">
  <a class="merk" href="${a("/")}"><img src="${a("/beeld/logo.png")}" alt="${esc(SITE.naam)}" width="240" height="229"></a>
  <nav aria-label="Menu">
    <a href="${a("/#werk")}">Alle producten</a>
    <a href="${a("/#contact")}">Contact</a>
  </nav>
</header>

<main id="top">
  <div class="wrap pp-pad">
    <p class="pp-kruimel"><a href="${a("/")}">${esc(SITE.naam)}</a> › ${o.ld ? "" : `<a href="${a("/#werk")}">Producten</a> › `}${esc(o.kruimel || stuk.titel)}</p>
    <div class="pp-grid${beeld === "" ? " pp-enkel" : ""}">
      <div>
        ${o.label ? `<p class="zakelijk-label">${esc(o.label)}</p>` : ""}
        <h1>${esc(o.h1 || stuk.titel)}</h1>
        ${o.regel === null ? "" : `<p class="pp-regel">${esc(o.regel || VASTE_REGEL)}</p>`}
        ${stuk.prijs ? `<span class="prijs">${esc(stuk.prijs)}</span>` : ""}
        ${tekst ? `<p class="pp-tekst">${esc(tekst)}</p>` : ""}
        <div class="knoppen">
          ${WHATSAPP ? `<a class="knop" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent(bericht)}">${esc(o.knop || "Vraag hiernaar via WhatsApp")}</a>` : ""}
          ${SITE.instagram ? `<a class="knop stil" href="https://www.instagram.com/${esc(SITE.instagram)}/">Bericht via Instagram</a>` : ""}
        </div>
      </div>
      ${beeld}
    </div>
  </div>

  ${meerFotos}

  ${o.stappen || ZO_WERKT_HET}

  <section>
    <div class="wrap">
      <h2>${esc(o.meerKop || "Meer van " + SITE.naam)}</h2>
      <div class="pp-chips">${meer}</div>
      <a class="knop stil" href="${a("/")}">Bekijk alles van ${esc(SITE.naam)}</a>
    </div>
  </section>
</main>

<footer class="wrap">
  <span>© ${new Date().getFullYear()} ${esc(SITE.naam)}, ${esc(SITE.plaats)}${SITE.kvk ? " · KVK " + esc(String(SITE.kvk).trim()) : ""}</span>
  ${VERZENDING ? `<a class="voet-link" href="${a("/ophalen-en-verzenden/")}">${esc(VERZENDING.titel || "Ophalen en verzenden")}</a>` : ""}
  ${VOORWAARDEN ? `<a class="voet-link" href="${a("/voorwaarden/")}">${esc(VOORWAARDEN.titel || "Algemene voorwaarden")}</a>` : ""}
</footer>
${lichtbak}
${BAKEN}
</body>
</html>
`;
}

// --- pagina voor bedrijven, clubs en verenigingen (/zakelijk/) ---
// Tekst en foto's komen uit data/site.json (in /beheer onder Naam en contact).
// Zonder zakelijk_pagina_tekst wordt er geen pagina gemaakt.
const ZAKELIJK_WOORDEN = ["logo", "bedrijf", "vereniging", "club", "sleutelhanger", "flesopener", "kersthanger", "dienbla"];
const ZAKELIJK_PRODUCTEN = ["sleutelhang", "flesopener", "gegraveerde plank", "dienblad", "naambord"];
function zakelijkePagina(basis) {
  const tekst = String(SITE.zakelijk_pagina_tekst || "").trim();
  if (!tekst) return null;
  const bij = g => String(g.onderschrift || "").toLowerCase();
  const eigen = (Array.isArray(SITE.zakelijk_fotos) ? SITE.zakelijk_fotos : []).filter(Boolean)
    .map(f => ({ foto: typeof f === "string" ? f : f.foto, onderschrift: "Zakelijk werk van " + SITE.naam })).filter(f => f.foto);
  const gezien = new Set();
  const fotos = [...eigen, ...GALERIJ.filter(g => ZAKELIJK_WOORDEN.some(w => bij(g).includes(w)))]
    .filter(f => !gezien.has(f.foto) && gezien.add(f.foto)).slice(0, 12);
  const meer = WERK.filter(s => ZAKELIJK_PRODUCTEN.some(w => s.titel.toLowerCase().includes(w)));
  const kop = String(SITE.zakelijk_kop || "Voor je bedrijf, club of vereniging").trim();
  const omschrijving = `Sleutelhangers, flesopeners, planken en kerstcadeaus met het logo van je bedrijf of club. Met de laser gemaakt in ${SITE.plaats} (Groningen). Vraag een voorstel.`;
  return pagina({ titel: kop, tekst, soort: [] }, WERK, basis, {
    slug: "zakelijk",
    titel: `Relatiegeschenken en bedankjes met logo – ${SITE.naam} ${SITE.plaats}`,
    beschrijving: omschrijving,
    label: "Zakelijk",
    h1: kop,
    kruimel: "Zakelijk",
    bericht: "Hoi Nienke, ik heb een vraag over een zakelijke bestelling: ",
    knop: "Vraag een voorstel via WhatsApp",
    fotos,
    meer,
    meerKop: "Populair bij bedrijven en clubs",
    stappen: `<section id="zo-werkt-het">
    <div class="wrap">
      <h2>Zo werkt een zakelijke bestelling</h2>
      <ol class="stappen">
        <li>
          <h3>Stuur je logo en je wens</h3>
          <p>Vertel wat je zoekt en voor hoeveel mensen. Elk soort logobestand is goed.</p>
        </li>
        <li>
          <h3>Ontwerp en voorstel</h3>
          <p>Je krijgt van mij een voorstel met het ontwerp en de prijs per stuk.</p>
        </li>
        <li>
          <h3>Na jouw akkoord aan de slag</h3>
          <p>Ben je tevreden, dan ga ik in productie. Ophalen in ${esc(SITE.plaats)} of verzenden kan allebei.</p>
        </li>
      </ol>
    </div>
  </section>`,
    ld: (url, f) => ({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Service", "@id": url + "#dienst", name: "Relatiegeschenken en bedankjes met logo", serviceType: "Lasergraveren met logo",
          description: tekst, url, provider: { "@id": SITE_URL + "#bedrijf" },
          areaServed: [SITE.plaats, "Loppersum", "Appingedam", "Delfzijl", "Eemsdelta", "Het Hogeland", "Midden-Groningen", "Groningen", "Nederland"],
          ...(f.length ? { image: f.map(x => SITE_URL + encodeURI(x.foto.replace(/^\//, ""))) } : {}) },
        { "@type": "BreadcrumbList", itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE.naam, item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "Zakelijk", item: url } ] }
      ]
    })
  });
}

// --- pagina ophalen en verzenden (/ophalen-en-verzenden/), tekst uit data/verzending.json ---
function verzendPagina(basis) {
  if (!VERZENDING || !Array.isArray(VERZENDING.vragen) || !VERZENDING.vragen.length) return null;
  const titelV = String(VERZENDING.titel || "Ophalen en verzenden").trim();
  const kort = (VERZENDING.kort || []).filter(k => k && k.label && k.waarde);
  const vragen = VERZENDING.vragen.filter(v => v && v.vraag && v.antwoord);
  const zin = s => String(s).split(/\n\s*\n/).map(p => `<p>${esc(p.trim())}</p>`).join("");
  const kader = kort.length ? `<aside class="pp-kort" aria-label="In het kort">
        <h2>In het kort</h2>
        <dl>${kort.map(k => `<div><dt>${esc(k.label)}</dt><dd>${esc(k.waarde)}</dd></div>`).join("")}</dl>
      </aside>` : "";
  const sectie = `<section id="vragen">
    <div class="wrap">
      <h2>Veelgestelde vragen</h2>
      <div class="pp-vragen">${vragen.map(v => `
        <details>
          <summary><h3>${esc(v.vraag)}</h3></summary>
          <div class="pp-antwoord">${zin(v.antwoord)}</div>
        </details>`).join("")}
      </div>
    </div>
  </section>`;
  return pagina({ titel: titelV, tekst: String(VERZENDING.intro || "").trim(), soort: [] }, WERK, basis, {
    slug: "ophalen-en-verzenden",
    titel: `${titelV} – ${SITE.naam} ${SITE.plaats}`,
    beschrijving: `Levertijd, gratis ophalen in ${SITE.plaats}, verzenden met PostNL of DHL en betalen bij ${SITE.naam}. Alles op maat gemaakt, na overleg en akkoord.`.slice(0, 160),
    h1: titelV,
    regel: null,
    kruimel: titelV,
    bericht: "Hoi Nienke, ik heb een vraag over verzenden of ophalen: ",
    knop: "Stel je vraag via WhatsApp",
    fotos: [],
    beeld: kader,
    stappen: sectie,
    meerKop: "Bekijk de producten",
    ld: url => ({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebPage", "@id": url, url, name: titelV, inLanguage: "nl-NL", about: { "@id": SITE_URL + "#bedrijf" },
          isPartOf: { "@id": SITE_URL + "#website" } },
        { "@type": "FAQPage", mainEntity: vragen.map(v => ({ "@type": "Question", name: v.vraag, acceptedAnswer: { "@type": "Answer", text: v.antwoord } })) },
        { "@type": "BreadcrumbList", itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE.naam, item: SITE_URL },
          { "@type": "ListItem", position: 2, name: titelV, item: url } ] }
      ]
    })
  });
}

// --- pagina algemene voorwaarden (/voorwaarden/), tekst uit data/voorwaarden.json ---
function voorwaardenPagina(basis) {
  if (!VOORWAARDEN || !Array.isArray(VOORWAARDEN.artikelen) || !VOORWAARDEN.artikelen.length) return null;
  const titelW = String(VOORWAARDEN.titel || "Algemene voorwaarden").trim();
  const artikelen = VOORWAARDEN.artikelen.filter(x => x && x.kop && x.tekst);
  const alineas = t => String(t).split(/\n\s*\n/).map(p => `<p>${esc(p.trim())}</p>`).join("");
  const sectie = `<section id="artikelen">
    <div class="wrap">
      <p class="pp-alles"><button type="button" class="knop stil" id="alles-open">Alles uitklappen</button></p>
      <ol class="pp-artikelen pp-vragen">${artikelen.map(x => `
        <li>
          <details>
            <summary><h3>${esc(x.kop)}</h3></summary>
            <div class="pp-antwoord">${alineas(x.tekst)}</div>
          </details>
        </li>`).join("")}
      </ol>
      <script>
      (function () {
        var knop = document.getElementById("alles-open"), alle = document.querySelectorAll(".pp-artikelen details");
        function zet(open) { alle.forEach(function (d) { d.open = open; }); knop.textContent = open ? "Alles inklappen" : "Alles uitklappen"; }
        knop.addEventListener("click", function () { zet(knop.textContent === "Alles uitklappen"); });
        window.addEventListener("beforeprint", function () { zet(true); });
      })();
      </script>
      ${VOORWAARDEN.bijgewerkt ? `<p class="pp-bijgewerkt">Laatst bijgewerkt: ${esc(VOORWAARDEN.bijgewerkt)}</p>` : ""}
    </div>
  </section>`;
  return pagina({ titel: titelW, tekst: String(VOORWAARDEN.intro || "").trim(), soort: [] }, WERK, basis, {
    slug: "voorwaarden",
    // Niet in Google: het adres staat alleen hier, voor klanten die de link krijgen.
    noindex: true,
    titel: `${titelW} – ${SITE.naam} ${SITE.plaats}`,
    beschrijving: `De algemene voorwaarden van ${SITE.naam} uit ${SITE.plaats}: voorstel en bestelling, betalen, levering, maatwerk zonder bedenktijd en wat te doen als er iets niet klopt.`.slice(0, 160),
    h1: titelW,
    regel: null,
    kruimel: titelW,
    bericht: "Hoi Nienke, ik heb een vraag over de voorwaarden: ",
    knop: "Stel je vraag via WhatsApp",
    fotos: [],
    beeld: "",
    stappen: sectie,
    meerKop: "Bekijk de producten",
    ld: url => ({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebPage", "@id": url, url, name: titelW, inLanguage: "nl-NL", about: { "@id": SITE_URL + "#bedrijf" },
          isPartOf: { "@id": SITE_URL + "#website" } },
        { "@type": "BreadcrumbList", itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE.naam, item: SITE_URL },
          { "@type": "ListItem", position: 2, name: titelW, item: url } ] }
      ]
    })
  });
}

// --- uitvoeren ---
const args = process.argv.slice(2);
if (args[0] === "--voorbeeld" && args[1] === "voorwaarden") {
  fs.writeFileSync(args[2], voorwaardenPagina(SITE_URL));
  console.log("Voorbeeld geschreven:", args[2]);
} else if (args[0] === "--voorbeeld" && args[1] === "verzending") {
  fs.writeFileSync(args[2], verzendPagina(SITE_URL));
  console.log("Voorbeeld geschreven:", args[2]);
} else if (args[0] === "--voorbeeld" && args[1] === "zakelijk") {
  const inhoud = zakelijkePagina(SITE_URL);
  if (!inhoud) throw new Error("Geen zakelijk_pagina_tekst in data/site.json");
  fs.writeFileSync(args[2], inhoud);
  console.log("Voorbeeld geschreven:", args[2]);
} else if (args[0] === "--voorbeeld") {
  const stuk = WERK.find(s => slugVan(s.titel) === args[1]);
  if (!stuk) throw new Error("Geen product met slug " + args[1] + ". Beschikbaar: " + WERK.map(s => slugVan(s.titel)).join(", "));
  fs.writeFileSync(args[2], pagina(stuk, WERK, SITE_URL));
  console.log("Voorbeeld geschreven:", args[2], "(foto's:", fotosVoor(stuk).length + ")");
} else {
  const oud = fs.existsSync(LOGBOEK) ? JSON.parse(fs.readFileSync(LOGBOEK, "utf8")) : [];
  const nieuw = [];
  for (const stuk of WERK) {
    const slug = slugVan(stuk.titel);
    if (GERESERVEERD.has(slug) || nieuw.includes(slug)) { console.log("Overgeslagen:", stuk.titel); continue; }
    fs.mkdirSync(path.join(BASIS, slug), { recursive: true });
    fs.writeFileSync(path.join(BASIS, slug, "index.html"), pagina(stuk, WERK, "/"));
    nieuw.push(slug);
  }
  const voorwaarden = voorwaardenPagina("/");
  if (voorwaarden) {
    fs.mkdirSync(path.join(BASIS, "voorwaarden"), { recursive: true });
    fs.writeFileSync(path.join(BASIS, "voorwaarden", "index.html"), voorwaarden);
    nieuw.push("voorwaarden");
  }
  const verzending = verzendPagina("/");
  if (verzending) {
    fs.mkdirSync(path.join(BASIS, "ophalen-en-verzenden"), { recursive: true });
    fs.writeFileSync(path.join(BASIS, "ophalen-en-verzenden", "index.html"), verzending);
    nieuw.push("ophalen-en-verzenden");
  }
  const zakelijk = zakelijkePagina("/");
  if (zakelijk) {
    fs.mkdirSync(path.join(BASIS, "zakelijk"), { recursive: true });
    fs.writeFileSync(path.join(BASIS, "zakelijk", "index.html"), zakelijk);
    nieuw.push("zakelijk");
  }
  for (const slug of oud) if (!nieuw.includes(slug) && (slug === "zakelijk" || slug === "ophalen-en-verzenden" || slug === "voorwaarden" || !GERESERVEERD.has(slug))) fs.rmSync(path.join(BASIS, slug), { recursive: true, force: true });
  fs.writeFileSync(LOGBOEK, JSON.stringify(nieuw, null, 1) + "\n");
  const urls = [SITE_URL, ...nieuw.filter(s => s !== "voorwaarden").map(s => SITE_URL + s + "/")];
  fs.writeFileSync(path.join(BASIS, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>
`);
  console.log("Productpagina's:", nieuw.length);
}
