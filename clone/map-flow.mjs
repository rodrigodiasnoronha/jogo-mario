// Percorre o quiz com Playwright, espera o JS renderizar e mapeia cada etapa.
// Uso: node map-flow.mjs [url] [--headed] [--choice=first|last|random] [--max=60]
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const url = args.find(a => !a.startsWith('--')) || 'https://quiz.pilatespro.site/';
const opt = k => args.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const choice = opt('choice') || 'first';
const maxSteps = Number(opt('max') || 60);
const headed = args.includes('--headed');

const OUT = path.resolve('out');
fs.rmSync(OUT, { recursive: true, force: true });
for (const d of ['screens', 'html', 'assets']) fs.mkdirSync(path.join(OUT, d), { recursive: true });

const browser = await chromium.launch({ headless: !headed });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  locale: 'pt-BR',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
await context.tracing.start({ screenshots: true, snapshots: true });
const page = await context.newPage();

// --- captura de rede, console e assets ---
const network = [];
const consoleLogs = [];
page.on('console', m => consoleLogs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => consoleLogs.push(`[pageerror] ${e.message}`));
page.on('request', r => {
  const e = { method: r.method(), url: r.url(), type: r.resourceType() };
  if (r.method() !== 'GET') e.postData = r.postData()?.slice(0, 2000);
  network.push(e);
});
page.on('response', async res => {
  const t = res.request().resourceType();
  if (!['script', 'stylesheet', 'image', 'font', 'media'].includes(t) || !res.ok()) return;
  try {
    const u = new URL(res.url());
    const name = (u.hostname + u.pathname).replace(/[^\w.-]+/g, '_').slice(-180);
    fs.writeFileSync(path.join(OUT, 'assets', name), await res.body());
  } catch {}
});

async function settle() {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500); // animações / transições do quiz
}

// Extrai o estado visível da etapa atual
async function snapshot() {
  return page.evaluate(() => {
    const visible = el => {
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
    };
    const txt = el => (el.innerText || el.value || el.getAttribute('aria-label') || el.alt || '').trim().replace(/\s+/g, ' ');
    const sel = el => {
      if (el.id) return `#${CSS.escape(el.id)}`;
      const parts = []; let n = el;
      while (n && n.nodeType === 1 && parts.length < 5) {
        let p = n.tagName.toLowerCase();
        if (n.classList.length) p += '.' + [...n.classList].slice(0, 2).map(c => CSS.escape(c)).join('.');
        const sib = n.parentElement ? [...n.parentElement.children].filter(c => c.tagName === n.tagName) : [];
        if (sib.length > 1) p += `:nth-of-type(${sib.indexOf(n) + 1})`;
        parts.unshift(p); n = n.parentElement;
      }
      return parts.join(' > ');
    };
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,legend,[class*=title i],[class*=question i]')]
      .filter(visible).map(txt).filter(Boolean);
    const inputs = [...document.querySelectorAll('input,textarea,select')].filter(e => visible(e) || ['radio', 'checkbox'].includes(e.type))
      .map(e => ({ tag: e.tagName.toLowerCase(), type: e.type, name: e.name, placeholder: e.placeholder, label: e.labels?.[0] ? txt(e.labels[0]) : '', selector: sel(e) }));
    // Clicáveis: botões, links, roles e divs com cursor pointer (comum em quizzes)
    const cands = new Set([...document.querySelectorAll('button,a[href],[role=button],[role=radio],[role=checkbox],[role=option],label,[onclick],[data-option],[class*=option i],[class*=answer i],[class*=choice i],[class*=card i]')]);
    document.querySelectorAll('div,li,span').forEach(e => { if (getComputedStyle(e).cursor === 'pointer') cands.add(e); });
    let clickables = [...cands].filter(visible).map(e => ({
      tag: e.tagName.toLowerCase(), text: txt(e).slice(0, 120), href: e.getAttribute('href') || undefined,
      selector: sel(e), disabled: e.disabled || e.getAttribute('aria-disabled') === 'true',
      y: Math.round(e.getBoundingClientRect().top + scrollY),
    })).filter(c => c.text);
    // remove pais que só envolvem um único filho clicável com o mesmo texto
    const seen = new Set(); clickables = clickables.filter(c => !seen.has(c.text) && seen.add(c.text));
    return {
      url: location.href, title: document.title, headings: [...new Set(headings)].slice(0, 10),
      text: document.body.innerText.trim().replace(/\n{3,}/g, '\n\n').slice(0, 4000),
      inputs, clickables,
      progress: [...document.querySelectorAll('[role=progressbar],progress,[class*=progress i]')].filter(visible)
        .map(e => e.getAttribute('aria-valuenow') || e.value || e.style.width || txt(e)).filter(Boolean),
    };
  });
}

const CTA = /^(continuar|pr[oó]xim|avan[cç]ar|come[cç]ar|iniciar|quero|seguir|enviar|confirmar|ver (meu|resultado)|descobrir|next|continue|start|submit|ok\b)/i;
const NOISE = /(pol[ií]tica|privacidade|termos|cookies|whatsapp|instagram|facebook|voltar|back)/i;
const FAKE = { email: 'teste@example.com', tel: '11999999999', number: '30', text: 'Teste', name: 'Maria Teste' };

async function fillInputs(inputs) {
  const filled = [];
  for (const i of inputs) {
    const loc = page.locator(i.selector).first();
    try {
      if (i.tag === 'select') { await loc.selectOption({ index: 1 }); filled.push({ ...i, value: 'option#1' }); continue; }
      if (['radio', 'checkbox', 'hidden', 'submit', 'button'].includes(i.type)) continue;
      if (await loc.inputValue().catch(() => '')) continue;
      const hint = `${i.name} ${i.placeholder} ${i.label}`.toLowerCase();
      const v = i.type === 'email' || hint.includes('mail') ? FAKE.email
        : i.type === 'tel' || /fone|phone|whats|cel/.test(hint) ? FAKE.tel
        : i.type === 'number' || /idade|age|peso|altura|weight|height/.test(hint) ? FAKE.number
        : /nome|name/.test(hint) ? FAKE.name : FAKE.text;
      await loc.fill(v); filled.push({ ...i, value: v });
    } catch {}
  }
  return filled;
}

function pick(list) {
  if (!list.length) return null;
  if (choice === 'last') return list.at(-1);
  if (choice === 'random') return list[Math.floor(Math.random() * list.length)];
  return list[0];
}

const steps = [];
const fingerprints = new Map();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

for (let n = 1; n <= maxSteps; n++) {
  await settle();
  const s = await snapshot();
  const id = String(n).padStart(2, '0');
  await page.screenshot({ path: path.join(OUT, 'screens', `${id}.png`), fullPage: true });
  fs.writeFileSync(path.join(OUT, 'html', `${id}.html`), await page.content());

  const fp = s.url + '|' + s.text.slice(0, 500);
  const loops = (fingerprints.get(fp) || 0) + 1; fingerprints.set(fp, loops);

  const options = s.clickables.filter(c => !c.disabled && !CTA.test(c.text) && !NOISE.test(c.text) && !c.href?.startsWith('http'));
  const ctas = s.clickables.filter(c => !c.disabled && CTA.test(c.text));
  const external = s.clickables.filter(c => c.href && /^https?:/.test(c.href) && !c.href.includes(new URL(url).hostname));
  const step = { step: n, ...s, options: options.map(o => o.text), ctas: ctas.map(c => c.text), external, action: null };
  steps.push(step);
  console.log(`\n#${id} ${s.url}\n  ${s.headings[0] || s.text.split('\n')[0]}\n  opções: ${step.options.join(' | ') || '-'}\n  ctas: ${step.ctas.join(' | ') || '-'}`);

  if (loops > 2) { step.action = 'stop: etapa repetida (sem avanço)'; break; }

  step.filled = await fillInputs(s.inputs);
  let target = null;
  // 1ª passada numa etapa: escolhe opção; se já há input preenchido ou nenhuma opção, aperta o CTA
  if (loops === 1 && options.length && !step.filled.length) target = pick(options);
  if (!target) target = ctas[0] || (loops > 1 ? options[1] : null);
  if (!target && external.length) { step.action = `stop: checkout/saída → ${external[0].href}`; break; }
  if (!target) { step.action = 'stop: nenhuma ação disponível'; break; }

  step.action = `click "${target.text}"`;
  try {
    await page.locator(target.selector).first().click({ timeout: 5000 });
  } catch {
    try { await page.getByText(target.text, { exact: true }).first().click({ timeout: 5000 }); }
    catch (e) { step.action += ` (falhou: ${e.message.split('\n')[0]})`; }
  }
  // em multi-select o CTA aparece depois de escolher; tenta clicá-lo na mesma etapa
  await page.waitForTimeout(600);
  const sameScreen = (await page.innerText('body').catch(() => '')).trim().replace(/\n{3,}/g, '\n\n').slice(0, 4000) === s.text;
  const cta = page.getByRole('button', { name: CTA }).first();
  if (sameScreen && await cta.isVisible().catch(() => false) && await cta.isEnabled().catch(() => false) && !CTA.test(target.text)) {
    await cta.click().catch(() => {}); step.action += ' → CTA';
  }
}

await context.tracing.stop({ path: path.join(OUT, 'trace.zip') });
await browser.close();

fs.writeFileSync(path.join(OUT, 'flow.json'), JSON.stringify(steps, null, 2));
fs.writeFileSync(path.join(OUT, 'network.json'), JSON.stringify(network, null, 2));
fs.writeFileSync(path.join(OUT, 'console.log'), consoleLogs.join('\n'));

const md = [`# Fluxo mapeado — ${url}`, '', `Gerado em ${new Date().toISOString()} · estratégia de escolha: \`${choice}\``, ''];
for (const s of steps) {
  md.push(`## Etapa ${s.step} — ${s.headings[0] || s.title}`, '', `- URL: ${s.url}`, `- Screenshot: [screens/${String(s.step).padStart(2, '0')}.png](screens/${String(s.step).padStart(2, '0')}.png)`);
  if (s.progress.length) md.push(`- Progresso: ${s.progress.join(', ')}`);
  if (s.inputs.length) md.push(`- Campos: ${s.inputs.map(i => `${i.type}${i.name ? `(${i.name})` : ''}${i.placeholder ? ` "${i.placeholder}"` : ''}`).join(', ')}`);
  if (s.options.length) md.push('- Opções:', ...s.options.map(o => `  - ${o}`));
  if (s.ctas.length) md.push(`- CTAs: ${s.ctas.join(' · ')}`);
  if (s.external.length) md.push(`- Links externos: ${s.external.map(e => e.href).join(', ')}`);
  md.push(`- **Ação tomada:** ${s.action}`, '');
}
const posts = network.filter(r => r.method !== 'GET');
if (posts.length) md.push('## Requisições não-GET (tracking / envio de lead)', '', ...posts.map(p => `- ${p.method} ${p.url}`), '');
fs.writeFileSync(path.join(OUT, 'FLOW.md'), md.join('\n'));
console.log(`\n✔ ${steps.length} etapas → out/FLOW.md, out/flow.json, out/screens/, out/trace.zip`);
