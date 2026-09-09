// eczaneler.gen.tr nöbetçi eczane kazıyıcı — İL SAYFASI modu (hızlı) + stealth + teşhis logu.

import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';

const ESZAMANLI = Number(process.env.ESZAMANLI || 6);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

function trAscii(s) {
  return String(s)
    .replaceAll('İ', 'i').replaceAll('I', 'i').replaceAll('ı', 'i')
    .replaceAll('Ş', 's').replaceAll('ş', 's')
    .replaceAll('Ğ', 'g').replaceAll('ğ', 'g')
    .replaceAll('Ü', 'u').replaceAll('ü', 'u')
    .replaceAll('Ö', 'o').replaceAll('ö', 'o')
    .replaceAll('Ç', 'c').replaceAll('ç', 'c')
    .toLowerCase();
}
const slug = (s) => trAscii(s).trim().replaceAll(' ', '-').replace(/[^a-z0-9-]/g, '');

function ayikla() {
  const pane = document.querySelector('.tab-pane.active') || document.querySelector('#nav-bugun') || document.body;
  const out = [];
  pane.querySelectorAll('span.isim').forEach((sp) => {
    const row = sp.closest('.row') || sp.closest('tr') || sp.parentElement;
    if (!row) return;
    let adres = '';
    let tel = '';
    row.querySelectorAll('div').forEach((d) => {
      const c = d.className || '';
      if (c.includes('col-lg-6') && !adres) {
        let t = '';
        for (const n of d.childNodes) {
          if (n.nodeType === 3) t += n.textContent;
          else if (n.nodeName === 'DIV' || n.nodeName === 'BR') break;
        }
        adres = t.replace(/\s+/g, ' ').trim();
      }
      if (c.includes('col-lg-3') && c.includes('py-lg-2') && !tel) tel = d.textContent.replace(/\s+/g, ' ').trim();
    });
    const ad = sp.textContent.replace(/\s+/g, ' ').trim();
    if (ad) out.push({ ad, adres, tel });
  });
  return out;
}

async function ilCek(context, ilSlug) {
  const page = await context.newPage();
  try {
    const url = `https://www.eczaneler.gen.tr/nobetci-${ilSlug}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => !/just a moment|attention required|bir dakika/i.test(document.title), { timeout: 30000 }).catch(() => {});
    await page.waitForSelector('span.isim', { timeout: 12000 }).catch(() => {});
    const rows = await page.evaluate(ayikla);
    const title = await page.title();
    const isimSayi = await page.evaluate(() => document.querySelectorAll('span.isim').length);
    return { rows, title, isimSayi };
  } catch (e) {
    return { rows: null, title: 'HATA: ' + e.message, isimSayi: 0 };
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  const bolgeler = JSON.parse(await readFile(new URL('./bolgeler.json', import.meta.url)));
  console.log(`${bolgeler.length} il taranacak (eşzamanlı: ${ESZAMANLI})`);

  const tarayici = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  const context = await tarayici.newContext({
    userAgent: UA,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    viewport: { width: 1366, height: 900 },
    extraHTTPHeaders: {
      'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
      'Upgrade-Insecure-Requests': '1',
    },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'languages', { get: () => ['tr-TR', 'tr', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
  });

  // Isınma — ana sayfa
  try {
    const p = await context.newPage();
    await p.goto('https://www.eczaneler.gen.tr/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await p.waitForFunction(() => !/just a moment/i.test(document.title), { timeout: 30000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 3000));
    console.log('Isınma sayfa başlığı: ' + (await p.title()));
    await p.close();
  } catch (e) { console.log('Isınma hatası: ' + e.message); }

  const veri = {};
  let sira = 0;
  let toplamEczane = 0;
  let ilkTeshis = 0;

  async function isci() {
    while (sira < bolgeler.length) {
      const b = bolgeler[sira++];
      const ilSlug = slug(b.il);
      const { rows, title, isimSayi } = await ilCek(context, ilSlug);

      if (ilkTeshis < 3) { console.log(`   [teşhis] ${b.il}: başlık="${title}"  .isim=${isimSayi}`); ilkTeshis++; }
      if (rows === null || rows.length === 0) { console.log(`  ${b.il}: 0 eczane  (başlık: ${title})`); continue; }

      const ilceler = [...b.ilceler].sort((a, c) => c.length - a.length);
      const tumu = [];
      for (const r of rows) {
        const kayit = {
          ad: r.ad, adres: r.adres, tel: r.tel,
          harita: r.adres ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${r.ad} ${r.adres}`) : '',
        };
        tumu.push(kayit);
        const adresLc = trAscii(r.adres);
        const eslesen = ilceler.find((ic) => adresLc.includes(trAscii(ic)));
        if (eslesen) (veri[`${ilSlug}/${slug(eslesen)}`] ||= []).push(kayit);
      }
      if (tumu.length) veri[`${ilSlug}/_tumu`] = tumu;
      toplamEczane += tumu.length;
      console.log(`  ${b.il}: ${tumu.length} eczane`);
    }
  }

  await Promise.all(Array.from({ length: ESZAMANLI }, isci));
  await tarayici.close();

  const ilceKovasi = Object.keys(veri).filter((k) => !k.endsWith('/_tumu')).length;
  console.log(`\nToplam ${toplamEczane} eczane, ${ilceKovasi} ilçe kovası.`);

  if (toplamEczane === 0) {
    console.error('Hiç veri çekilemedi — mevcut eczaneler.json değiştirilmiyor. (Yukarıdaki [teşhis] başlıklarına bakın.)');
    process.exit(1);
  }

  await writeFile(new URL('./eczaneler.json', import.meta.url), JSON.stringify({
    guncelleme: new Date().toISOString(),
    kaynak: 'eczaneler.gen.tr',
    toplam_eczane: toplamEczane,
    veri,
  }));
  console.log('eczaneler.json yazıldı.');
}

main().catch((e) => { console.error(e); process.exit(1); });
