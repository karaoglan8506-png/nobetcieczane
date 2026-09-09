// eczaneler.gen.tr nöbetçi eczane kazıyıcı — İL SAYFASI modu (hızlı).
// 81 il sayfasını (/nobetci-{il}) gerçek Chromium ile gezer; her ilin TÜM nöbetçi eczanelerini alır,
// adresteki ilçe adına göre ilçe kovalarına dağıtır. Çıktı: eczaneler.json
//
//   { "guncelleme": "...", "kaynak": "eczaneler.gen.tr",
//     "veri": { "istanbul/kadikoy": [ {ad,adres,tel,harita} ], "istanbul/_tumu": [ ... ] } }
//
// Site tarafı önce "il/ilce" kovasına, yoksa "il/_tumu" kovasına (adreste ilçe eşleşmesi) bakar.

import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';

const ESZAMANLI = Number(process.env.ESZAMANLI || 8);
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

// Sayfadaki güncel (aktif) nöbet panelinden eczane satırlarını çıkarır.
function ayikla() {
  const pane =
    document.querySelector('.tab-pane.active') ||
    document.querySelector('#nav-bugun') ||
    document.body;
  const out = [];
  pane.querySelectorAll('span.isim').forEach((sp) => {
    const row = sp.closest('.row');
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
      if (c.includes('col-lg-3') && c.includes('py-lg-2') && !tel) {
        tel = d.textContent.replace(/\s+/g, ' ').trim();
      }
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
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForFunction(() => !/just a moment/i.test(document.title), { timeout: 25000 }).catch(() => {});
    await page.waitForSelector('span.isim, .alert-nobet, .alert-warning', { timeout: 12000 }).catch(() => {});
    const rows = await page.evaluate(ayikla);
    return rows;
  } catch (e) {
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  const bolgeler = JSON.parse(await readFile(new URL('./bolgeler.json', import.meta.url)));
  console.log(`${bolgeler.length} il taranacak (eşzamanlı: ${ESZAMANLI})`);

  const tarayici = await chromium.launch({ headless: true });
  const context = await tarayici.newContext({ userAgent: UA, locale: 'tr-TR', viewport: { width: 1280, height: 900 } });

  // Isınma
  try {
    const p = await context.newPage();
    await p.goto('https://www.eczaneler.gen.tr/', { waitUntil: 'domcontentloaded', timeout: 40000 });
    await p.waitForFunction(() => !/just a moment/i.test(document.title), { timeout: 25000 }).catch(() => {});
    await p.close();
  } catch {}

  const veri = {};
  let sira = 0;
  let toplamEczane = 0;
  let hataliIl = [];

  async function isci() {
    while (sira < bolgeler.length) {
      const b = bolgeler[sira++];
      const ilSlug = slug(b.il);
      // ilçe adı -> slug haritası (adres eşleştirmesi için, uzun addan kısaya)
      const ilceler = [...b.ilceler].sort((a, c) => c.length - a.length);
      const rows = await ilCek(context, ilSlug);
      if (rows === null) { hataliIl.push(b.il); console.log(`  ! ${b.il} — alınamadı`); continue; }

      const tumu = [];
      for (const r of rows) {
        const kayit = {
          ad: r.ad,
          adres: r.adres,
          tel: r.tel,
          harita: r.adres
            ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${r.ad} ${r.adres}`)
            : '',
        };
        tumu.push(kayit);
        const adresLc = trAscii(r.adres);
        const eslesen = ilceler.find((ic) => adresLc.includes(trAscii(ic)));
        if (eslesen) {
          const k = `${ilSlug}/${slug(eslesen)}`;
          (veri[k] ||= []).push(kayit);
        }
      }
      if (tumu.length) veri[`${ilSlug}/_tumu`] = tumu;
      toplamEczane += tumu.length;
      console.log(`  ${b.il}: ${tumu.length} eczane`);
    }
  }

  await Promise.all(Array.from({ length: ESZAMANLI }, isci));
  await tarayici.close();

  const ilceKovasi = Object.keys(veri).filter((k) => !k.endsWith('/_tumu')).length;
  console.log(`Toplam ${toplamEczane} eczane, ${ilceKovasi} ilçe kovası. Alınamayan il: ${hataliIl.join(', ') || '-'}`);

  if (toplamEczane === 0) {
    console.error('Hiç veri çekilemedi — mevcut eczaneler.json değiştirilmiyor.');
    process.exit(1);
  }

  const cikti = {
    guncelleme: new Date().toISOString(),
    kaynak: 'eczaneler.gen.tr',
    toplam_eczane: toplamEczane,
    veri,
  };
  await writeFile(new URL('./eczaneler.json', import.meta.url), JSON.stringify(cikti));
  console.log('eczaneler.json yazıldı.');
}

main().catch((e) => { console.error(e); process.exit(1); });
