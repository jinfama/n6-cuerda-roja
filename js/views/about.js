// About view — project context, team, sources and credits.

import { State } from '../state.js';

export function initAboutView() {
  render();
  State.subscribe('language', render);
}

function render() {
  const container = document.getElementById('about-container');
  if (!container) return;
  const lang = State.get('language');
  const t = lang === 'en' ? content.en : content.es;

  container.innerHTML = `
    <div class="about-page">
      <header class="about-hero">
        <div class="about-eyebrow">${t.eyebrow}</div>
        <h1>${t.h1}</h1>
        <p class="about-lead">${t.lead}</p>
        <div class="about-pill-row">
          <span>${t.pillLabour}</span>
          <span>${t.pillTrade}</span>
          <span>${t.pillConditions}</span>
          <span>${t.pillOpen}</span>
        </div>
      </header>

      <section class="about-team-section">
        <div class="about-section-head">
          <span>${t.teamH}</span>
          <p>${t.teamIntro}</p>
        </div>
        <div class="about-team-grid">
          ${authorCard({
            photo: 'assets/authors/juan.jpg',
            name: 'Juan Infante-Amate',
            role: t.juanRole,
            desc: t.juanDesc,
            links: [
              { href: 'https://www.ugr.es/personal/juan-infante-amate', title: 'Web UGR', iconSrc: 'assets/icons/web.png' },
              { href: 'https://scholar.google.com/citations?user=s89YchgAAAAJ', title: 'Google Scholar', iconSrc: 'assets/icons/google-scholar-1.png' },
              { href: 'https://www.researchgate.net/profile/Juan-Infante-Amate', title: 'ResearchGate', iconSrc: 'assets/icons/ResearchGate_icon_SVG.svg.png' },
              { href: 'https://orcid.org/0000-0003-1446-7181', title: 'ORCID', cls: 'about-icon-orcid', icon: iconOrcid() },
              { href: 'mailto:jinfama@ugr.es', title: 'Email', icon: iconMail(), external: false },
            ],
          })}
          ${authorCard({
            photo: 'assets/authors/helios.jpg',
            name: 'Helios Escalante Moreno',
            role: t.heliosRole,
            desc: t.heliosDesc,
            links: [
              { href: 'https://www.ugr.es/personal/helios-escalante-moreno', title: 'Web UGR', iconSrc: 'assets/icons/web.png' },
              { href: 'https://produccioncientifica.ugr.es/investigadores/455722/detalle?lang=es', title: 'Producción científica UGR', icon: iconProfile() },
              { href: 'https://scholar.google.com/scholar?q=%22Helios%20Escalante%20Moreno%22', title: 'Google Scholar', iconSrc: 'assets/icons/google-scholar-1.png' },
              { href: 'https://www.researchgate.net/search/publication?q=Helios%20Escalante%20Moreno', title: 'ResearchGate', iconSrc: 'assets/icons/ResearchGate_icon_SVG.svg.png' },
              { href: 'https://x.com/Helios_EM', title: 'X / Twitter', cls: 'about-icon-social', icon: iconX() },
            ],
          })}
        </div>
      </section>

      <div class="about-info-grid">
        <section class="about-info-panel about-intro-panel">
          <h2>${t.introH}</h2>
          <p>${t.introOne}</p>
          <p>${t.introTwo}</p>
        </section>

        <section class="about-info-panel">
          <h2>${t.methodH}</h2>
          <p>${t.methodOne}</p>
          <div class="about-data-links">
            <a class="about-data-link" href="https://www.fao.org/faostat/en/#data" target="_blank" rel="noopener">FAOSTAT</a>
            <a class="about-data-link" href="https://ilostat.ilo.org/" target="_blank" rel="noopener">ILOSTAT</a>
            <a class="about-data-link" href="https://data.worldbank.org/" target="_blank" rel="noopener">World Bank</a>
            <a class="about-data-link" href="https://www.walkfree.org/global-slavery-index/" target="_blank" rel="noopener">GSI</a>
            <a class="about-data-link" href="data/manifest_provisional.json" target="_blank" rel="noopener">${t.manifest}</a>
          </div>
          <p class="about-note">${t.methodNote}</p>
        </section>

        <section class="about-info-panel">
          <h2>${t.fundingH}</h2>
          <p>${t.fundingText}</p>
          <p class="about-note">${t.ackText}</p>
        </section>

        <section class="about-info-panel">
          <h2>${t.citeH}</h2>
          <div class="about-citation">${t.citeText}</div>
          <p class="about-note">${t.licenseText}</p>
        </section>
      </div>
    </div>
  `;
}

const content = {
  es: {
    h1: 'Agricultores del Mundo',
    eyebrow: 'Base de datos global',
    lead: 'Trabajo agrario, productividad, condiciones laborales y huellas del comercio en perspectiva histórica.',
    pillLabour: 'Trabajo y horas',
    pillTrade: 'Comercio y huellas',
    pillConditions: 'Condiciones laborales',
    pillOpen: 'Datos abiertos',
    introH: 'Introducción',
    introOne: 'Esta base de datos forma parte de una investigación de la Universidad de Granada sobre la historia global del trabajo agrario y su relación con la producción de alimentos, el comercio internacional y las desigualdades laborales.',
    introTwo: 'El visor reúne series comparables por país, año y categoría productiva para leer cuántas personas trabajan, cuántas horas movilizan, qué productividad alcanzan y qué riesgos sociales quedan asociados a esa producción.',
    teamH: 'Equipo',
    teamIntro: 'Coordinación científica y desarrollo de la base de datos.',
    juanRole: 'Universidad de Granada',
    juanDesc: 'Historia ambiental y económica agraria, metabolismo social y huellas laborales globales.',
    heliosRole: 'Universidad de Granada',
    heliosDesc: 'Geografía, conflictos socioambientales, territorio y cadenas agroalimentarias.',
    methodH: 'Metodología y datos',
    methodOne: 'Las series armonizan fuentes internacionales y resultados del pipeline labour: empleo y horas agrarias, superficies, producción física, productividad, condiciones laborales y huellas embebidas en el comercio.',
    manifest: 'Manifest provisional',
    methodNote: 'Zenodo, repositorio y data paper se activarán cuando el depósito esté cerrado.',
    fundingH: 'Financiación',
    fundingText: 'Investigación vinculada a proyectos del Ministerio de Ciencia, Innovación y Universidades / Agencia Estatal de Investigación y a contrato predoctoral FPI asociado.',
    ackText: 'Agradecemos las revisiones de datos, discusión metodológica y pruebas del visor, así como a los equipos que mantienen las fuentes estadísticas internacionales utilizadas.',
    citeH: 'Cita y licencia',
    citeText: 'Infante-Amate, J. y Escalante Moreno, H. Agricultores del Mundo: base de datos global sobre trabajo agrario en perspectiva histórica. Universidad de Granada. DOI Zenodo pendiente.',
    licenseText: 'Licencia propuesta: CC-BY 4.0 para datos y visualizaciones, respetando las condiciones de cita de las fuentes originales.',
  },
  en: {
    h1: 'Farmers of the World',
    eyebrow: 'Global database',
    lead: 'Agricultural labour, productivity, labour conditions and trade footprints in historical perspective.',
    pillLabour: 'Work and hours',
    pillTrade: 'Trade and footprints',
    pillConditions: 'Labour conditions',
    pillOpen: 'Open data',
    introH: 'Introduction',
    introOne: 'This database is part of a University of Granada research project on the global history of agricultural labour and its links with food production, international trade and labour inequalities.',
    introTwo: 'The viewer brings together comparable series by country, year and product category to read how many people work, how many hours they mobilise, how productive they are and which social risks remain attached to production.',
    teamH: 'Team',
    teamIntro: 'Scientific coordination and database development.',
    juanRole: 'University of Granada',
    juanDesc: 'Environmental and agrarian economic history, social metabolism and global labour footprints.',
    heliosRole: 'University of Granada',
    heliosDesc: 'Geography, socio-environmental conflicts, territory and agri-food chains.',
    methodH: 'Methodology and data',
    methodOne: 'The series harmonise international sources and outputs from the labour pipeline: agricultural employment and hours, land area, physical production, productivity, labour conditions and labour footprints embedded in trade.',
    manifest: 'Provisional manifest',
    methodNote: 'Final links to Zenodo, repository and data paper will be activated once the deposit is closed.',
    fundingH: 'Funding',
    fundingText: 'Funding: research linked to projects from the Spanish Ministry of Science, Innovation and Universities / State Research Agency and to an associated predoctoral FPI contract.',
    ackText: 'We thank colleagues who contributed data review, methodological discussion and viewer testing, as well as the teams maintaining the international statistical sources used here.',
    citeH: 'Citation and license',
    citeText: 'Infante-Amate, J. and Escalante Moreno, H. Farmers of the World: a global database on agricultural labour in historical perspective. University of Granada. Zenodo DOI forthcoming.',
    licenseText: 'Proposed license: CC-BY 4.0 for data and visualisations, respecting the citation requirements of the original sources.',
  },
};

function authorCard({ photo, name, role, desc, links }) {
  return `
    <article class="about-card">
      <img class="about-card-photo" src="${photo}" alt="${name}" loading="lazy">
      <div class="about-card-body">
        <div class="about-card-name">${name}</div>
        <div class="about-card-role">${role}</div>
        <div class="about-card-desc">${desc}</div>
        <div class="about-card-links">
          ${links.map(link).join('')}
        </div>
      </div>
    </article>
  `;
}

function link(item) {
  const external = item.external === false ? '' : ' target="_blank" rel="noopener"';
  if (item.iconSrc) {
    return `<a class="about-icon-link ${item.cls || ''}" href="${item.href}"${external} title="${item.title}" aria-label="${item.title}"><img src="${item.iconSrc}" alt="" loading="lazy"></a>`;
  }
  return `<a class="about-icon-link ${item.cls || ''}" href="${item.href}"${external} title="${item.title}" aria-label="${item.title}">${item.icon}</a>`;
}

function iconProfile() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h16M7 20V8l5-4 5 4v12M9 12h6M9 16h6"/></svg>';
}

function iconOrcid() {
  return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24ZM7.37 4.38a.95.95 0 1 1 0 1.89.95.95 0 0 1 0-1.9Zm-.72 3.04h1.44v10.04H6.65V7.42Zm3.56 0h3.9c3.71 0 5.34 2.65 5.34 5.02 0 2.58-2.02 5.03-5.32 5.03h-3.92V7.42Zm1.44 1.3v7.45h2.3c3.27 0 4.02-2.49 4.02-3.73 0-1.95-1.32-3.72-3.85-3.72h-2.47Z"/></svg>';
}

function iconMail() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/></svg>';
}

function iconX() {
  return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2h3.2l-7 8 8.2 12h-6.4l-5-7.1L6.1 22H2.9l7.5-8.6L2.5 2h6.6l4.5 6.4L18.9 2Zm-1.1 17.9h1.8L8.1 4H6.2l11.6 15.9Z"/></svg>';
}
