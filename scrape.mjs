// eczaneler.gen.tr nöbetçi eczane kazıyıcı.
// GitHub Actions'ta gerçek Chromium (Playwright) ile çalışır; Cloudflare "managed challenge"
// tarayıcı tarafından otomatik çözülür. Çıktı: eczaneler.json
//
//   { "guncelleme": "2026-09-09T12:00:00.000Z",
//     "kaynak": "eczaneler.gen.tr",
//     "veri": { "istanbul/kadikoy": [ { "ad": "...", "adres": "...", "tel": "...", "harita": "..." }, ... ] } }

import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';

const ESZAMANLI = Number(process.env.ESZAMANLI || 5);   // paralel sekme sayısı
const ILCE_BEKLE = 200;                                  // istekler arası nezaket gecikmesi (ms)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

function slug(s) {
  return String(s)
    .replaceAll('İ', 'i').replaceAll('I', 'i').replaceAll('ı', 'i')
    .replaceAll('Ş', 's').replaceAll('ş', 's')
    .replaceAll('Ğ', 'g').replaceAll('ğ', 'g')
    .replaceAll('Ü', 'u').replaceAll('ü', 'u')
    .replaceAll('Ö', 'o').replaceAll('ö', 'o')
    .replaceAll('Ç', 'c').replaceAll('ç', 'c')
    .toLowerCase().trim().replaceAll(' ', '-').replace(/[^a-z0-9-]/g, '');
}

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

async function ilceCek(context, ilSlug, ilceSlug) {
  const page = await context.newPage();
  try {
    const url = `https://www.eczaneler.gen.tr/nobetci-${ilSlug}-${ilceSlug}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
    // Cloudflare doğrulaması geçene kadar bekle
    await page.waitForFunction(() => !/just a moment/i.test(document.title), { timeout: 25000 }).catch(() => {});
    await page.waitForSelector('span.isim, .alert-nobet, .alert-warning', { timeout: 9000 }).catch(() => {});
    const satirlar = await page.evaluate(ayikla);
    return satirlar.map((e) => ({
      ad: e.ad,
      adres: e.adres,
      tel: e.tel,
      harita: e.adres
        ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${e.ad} ${e.adres}`)
        : '',
    }));
  } catch {
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  const bolgeler = JSON.parse(await readFile(new URL('./bolgeler.json', import.meta.url)));
  const isler = [];
  for (const b of bolgeler) {
    const ilSlug = slug(b.il);
    for (const ilce of b.ilceler) isler.push({ ilSlug, ilceSlug: slug(ilce), il: b.il, ilce });
  }
  console.log(`${isler.length} il/ilçe kazınacak (eşzamanlı: ${ESZAMANLI})`);

  const tarayici = await chromium.launch({ headless: true });
  const context = await tarayici.newContext({
    userAgent: UA,
    locale: 'tr-TR',
    viewport: { width: 1280, height: 900 },
  });

  // Isınma: ana sayfayı bir kez ziyaret et → Cloudflare çerezi bağlama alınır
  try {
    const p = await context.newPage();
    await p.goto('https://www.eczaneler.gen.tr/', { waitUntil: 'domcontentloaded', timeout: 35000 });
    await p.waitForFunction(() => !/just a moment/i.test(document.title), { timeout: 25000 }).catch(() => {});
    await p.close();
  } catch {}

  const veri = {};
  let sira = 0;
  let dolu = 0;
  let hata = 0;

  async function isci() {
    while (sira < isler.length) {
      const i = sira++;
      const { ilSlug, ilceSlug, il, ilce } = isler[i];
      const sonuc = await ilceCek(context, ilSlug, ilceSlug);
      if (sonuc === null) {
        hata++;
      } else if (sonuc.length) {
        veri[`${ilSlug}/${ilceSlug}`] = sonuc;
        dolu++;
      }
      if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${isler.length} — dolu:${dolu} hata:${hata}`);
      if (ILCE_BEKLE) await new Promise((r) => setTimeout(r, ILCE_BEKLE));
    }
  }

  await Promise.all(Array.from({ length: ESZAMANLI }, isci));
  await tarayici.close();

  const bolgeSayisi = Object.keys(veri).length;
  if (bolgeSayisi === 0) {
    console.error('Hiç veri çekilemedi — mevcut eczaneler.json değiştirilmiyor.');
    process.exit(1);
  }

  const cikti = {
    guncelleme: new Date().toISOString(),
    kaynak: 'eczaneler.gen.tr',
    bolge_sayisi: bolgeSayisi,
    veri,
  };
  await writeFile(new URL('./eczaneler.json', import.meta.url), JSON.stringify(cikti));
  console.log(`Bitti — ${bolgeSayisi} bölgede nöbetçi eczane bulundu, ${hata} istek başarısız.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
