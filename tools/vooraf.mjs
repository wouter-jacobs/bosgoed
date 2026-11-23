// Zet de inhoud uit data/*.json alvast in index.html (producten, filter,
// galerij, Over mij, contact, voettekst en de bedrijfsgegevens voor Google).
// Zo staat alles meteen in de HTML voor zoekmachines. In de browser bouwt de
// pagina dezelfde inhoud daarna gewoon opnieuw op, dus er verandert niets
// aan hoe de site eruitziet.
//
// Gebruikt de functies uit het script in index.html zelf, zodat de uitkomst
// precies gelijk is. Draait automatisch via .github/workflows/bouw.yml.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const BASIS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGINA = path.join(BASIS, "index.html");
const lees = f => JSON.parse(fs.readFileSync(path.join(BASIS, f), "utf8"));

let html = fs.readFileSync(PAGINA, "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const code = scripts[scripts.length - 1].replace(/\nstart\(\);\s*$/, "\n");

// --- minimale nep-omgeving, alleen om de functies te kunnen laden ---
const niets = new Proxy(function () {}, {
  get: (_, k) => (k === Symbol.toPrimitive ? () => "" : niets),
  apply: () => niets,
  set: () => true
});
const kraampje = [...(html.match(/<ul aria-label="In het kraampje">([\s\S]*?)<\/ul>/) || ["", ""])[1]
  .matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => ({ textContent: m[1].trim() }));
const ldBlok = { textContent: "" };
const documentNep = {
  title: "",
  getElementById: id => (id === "bedrijfsgegevens" ? ldBlok : niets),
  querySelector: () => niets,
  querySelectorAll: sel => (sel === "#kraampje li" ? kraampje : []),
  createElement: () => niets,
  head: { appendChild: () => {} }
};
const omgeving = vm.createContext({
  document: documentNep, window: niets, requestAnimationFrame: () => {},
  URL, encodeURI, encodeURIComponent, JSON, Math, Number, String, Array, Object, Set, Boolean, console
});
vm.runInContext(code, omgeving);
const doe = s => vm.runInContext(s, omgeving);

// --- gegevens, op dezelfde manier voorbereid als start() in de pagina ---
const SITE = lees("data/site.json");
let WERK = lees("data/producten.json");
if (!Array.isArray(WERK)) WERK = WERK.producten || [];
WERK = WERK.filter(s => s && s.titel);
let GALERIJ = lees("data/galerij.json");
GALERIJ = (Array.isArray(GALERIJ) ? GALERIJ : (GALERIJ.fotos || [])).filter(x => x && x.foto);
omgeving.__gegevens = { SITE, WERK, GALERIJ };
doe(`SITE = __gegevens.SITE; WERK = __gegevens.WERK; GALERIJ = __gegevens.GALERIJ;
     SITE.whatsappTekst = SITE.whatsapp || ""; SITE.whatsapp = whatsappNummer(SITE.whatsapp);`);

const esc = t => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const titel = SITE.naam + " " + SITE.plaats + " – gegraveerde planken, naamborden en houten cadeaus";
documentNep.title = titel;

// --- de stukken HTML, zoals de functies in de pagina ze ook maken ---
const soorten = ["Alles", ...new Set(WERK.flatMap(s => omgeving.soortenVan(s)))];
const filterHtml = soorten.map(s => `<button type="button" aria-pressed="${s === "Alles"}">${esc(s)}</button>`).join("");

const werkHtml = WERK.length
  ? WERK.map(stuk => '<li><button type="button" class="stuk"><span class="beeld">'
      + omgeving.tekening(omgeving.kiesTekening(stuk)) + "</span>"
      + `<strong>${esc(stuk.titel)}</strong><span class="mat">${esc(stuk.materiaal || "")}</span>`
      + (stuk.prijs ? `<span class="prijs">${esc(stuk.prijs)}</span>` : "")
      + "</button></li>").join("")
  : '<li class="leeg">Hier staat nog geen werk. Kies een andere soort.</li>';

const galerijHtml = GALERIJ.map((item, i) => '<li><button type="button"><span class="foto">'
  + `<img src="${esc(omgeving.kleinPad(item.foto))}" alt="${esc(item.onderschrift || "Werk van " + (SITE.naam || "Bosgoed"))}" loading="${i < 3 ? "eager" : "lazy"}">`
  + "</span>" + (item.onderschrift ? `<span class="onderschrift">${esc(item.onderschrift)}</span>` : "")
  + "</button></li>").join("");

const s = omgeving.SITE ?? doe("SITE");
const knoppen = [];
if (s.whatsapp) knoppen.push(`<a class="knop" href="https://wa.me/${esc(s.whatsapp)}">Stuur een WhatsApp</a>`);
if (s.instagram) knoppen.push(`<a class="knop${s.whatsapp ? " stil" : ""}" href="https://www.instagram.com/${esc(s.instagram)}/">Bericht via Instagram</a>`);
const regels = [];
const regel = (kop, tekst, href) => regels.push(`<dt>${esc(kop)}</dt><dd>${href ? `<a href="${esc(href)}">${esc(tekst)}</a>` : esc(tekst)}</dd>`);
if (s.whatsapp) regel("WhatsApp", s.whatsappTekst, "https://wa.me/" + s.whatsapp);
if (s.instagram) regel("Instagram", "@" + s.instagram, "https://www.instagram.com/" + s.instagram + "/");
if (s.email) regel("E-mail", s.email, "mailto:" + s.email);
if (s.plaats) regel("Ophalen", s.plaats);
regel("Verzenden", "Mogelijk, verzendkosten op aanvraag");

const overTekst = esc(s.over_tekst || doe("OVER_TEKST"));
const voet = esc("© " + new Date().getFullYear() + " " + s.naam + ", " + s.plaats + (s.kvk ? " · KVK " + String(s.kvk).trim() : ""));

doe("bedrijfsgegevens()");
const ld = ldBlok.textContent.replace(/</g, "\\u003c");

// --- invullen in index.html ---
function vul(id, inhoud) {
  const open = new RegExp(`(<([a-z][a-z0-9]*)\\b[^>]*\\bid="${id}"[^>]*>)`);
  const m = html.match(open);
  if (!m) throw new Error("Element niet gevonden: #" + id);
  const start = m.index + m[0].length;
  const einde = html.indexOf(`</${m[2]}>`, start);
  if (einde < 0) throw new Error("Geen sluittag voor #" + id);
  html = html.slice(0, start) + inhoud + html.slice(einde);
}
vul("filter", filterHtml);
vul("werklijst", werkHtml);
vul("spoor", galerijHtml);
vul("over-tekst", overTekst);
vul("contactknoppen", knoppen.join(""));
vul("contactlijst", regels.join(""));
vul("voet", voet);

const zakelijkTekst = String(s.zakelijk_tekst || "").trim();
vul("zakelijk-kop", esc(String(s.zakelijk_kop || "Voor je bedrijf, club of vereniging").trim()));
vul("zakelijk-inhoud", esc(zakelijkTekst));
html = html.replace(/<div class="zakelijk" id="zakelijk"( hidden)?>/, `<div class="zakelijk" id="zakelijk"${zakelijkTekst ? "" : " hidden"}>`);
html = html.replace(/(<a class="knop" id="zakelijk-offerte" href=")[^"]*(")/, (_, a, b) => a + esc(omgeving.zakelijkLink(s)) + b);
html = html.replace(/(<[a-z]+[^>]*\bdata-naam\b[^>]*>)[^<]*(<\/)/g, (_, a, b) => a + esc(s.naam) + b);
html = html.replace(/<section id="inspiratie"( hidden)?>/, `<section id="inspiratie"${GALERIJ.length ? "" : " hidden"}>`);
html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(titel)}</title>`);

const ldTag = `<script type="application/ld+json" id="bedrijfsgegevens">${ld}</script>`;
if (/<script type="application\/ld\+json" id="bedrijfsgegevens">[\s\S]*?<\/script>/.test(html)) {
  html = html.replace(/<script type="application\/ld\+json" id="bedrijfsgegevens">[\s\S]*?<\/script>/, () => ldTag);
} else {
  html = html.replace("</head>", ldTag + "\n</head>");
}

fs.writeFileSync(PAGINA, html);
console.log(`Vooraf ingevuld: ${WERK.length} producten, ${GALERIJ.length} foto's, bedrijfsgegevens ${ld.length} tekens.`);
