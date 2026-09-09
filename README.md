# Nöbetçi Eczane Kazıyıcı (ücretsiz)

`eczaneler.gen.tr` Cloudflare koruması nedeniyle sunucudan doğrudan çekilemiyor.
Bu küçük proje, **GitHub Actions** üzerinde gerçek bir tarayıcı (Playwright/Chromium) çalıştırıp
Cloudflare'i doğal olarak geçer, tüm Türkiye il/ilçeleri için nöbetçi eczaneleri kazır ve
`eczaneler.json` dosyasını üretir. Güdül Vakfı sitesi bu dosyayı okur.

**Maliyet: 0 TL.** Herkese açık (public) GitHub deposunda Actions dakikaları sınırsız ve ücretsizdir.

---

## Kurulum (tek seferlik, ~5 dakika)

### 1. GitHub deposu oluştur
- github.com → **New repository**
- İsim: `gudulvakfi-eczane` (fark etmez)
- **Public** seç (ücretsiz sınırsız Actions için)
- "Create repository"

### 2. Bu klasörün içeriğini depoya yükle
Bu `eczane-scraper/` klasöründeki **tüm dosyaları** (alt klasör `.github/` dâhil) deponun köküne koy:

```
eczaneler.json
package.json
scrape.mjs
bolgeler.json
.gitignore
.github/workflows/eczane.yml
```

Yükleme yolları:
- **Web'den:** depo sayfasında "Add file → Upload files" ile sürükle-bırak. (`.github` klasörünü web arayüzü kabul eder; dosyayı `.github/workflows/eczane.yml` adıyla eklemen yeterli.)
- **Git ile:**
  ```bash
  git clone https://github.com/KULLANICI/gudulvakfi-eczane.git
  cp -r /path/to/eczane-scraper/* /path/to/eczane-scraper/.github gudulvakfi-eczane/
  cd gudulvakfi-eczane && git add . && git commit -m "ilk kurulum" && git push
  ```

### 3. Actions'ı etkinleştir ve ilk çalıştır
- Depoda **Actions** sekmesi → "I understand my workflows, enable them"
- Sol menüden **"Nöbetçi Eczane Güncelle"** → sağda **"Run workflow"** → çalıştır
- 10-20 dk sürer. Bitince depoda `eczaneler.json` güncellenmiş olur (binlerce satır).
- Bundan sonra **her 2 saatte bir** otomatik çalışır.

### 4. raw adresini al ve siteye gir
- Depoda `eczaneler.json` dosyasına tıkla → sağ üstte **"Raw"** butonu → açılan adresi kopyala.
  Şuna benzer:
  `https://raw.githubusercontent.com/KULLANICI/gudulvakfi-eczane/main/eczaneler.json`
- Vakıf admin panelinde: **Site Ayarları → Nöbetçi Eczane → "JSON Kaynak Adresi"** alanına yapıştır → **Kaydet**.

Bitti. Site artık nöbetçi eczaneleri bu dosyadan okur; veri her 2 saatte bir tazelenir.

---

## Nasıl çalışıyor?

- `bolgeler.json` — 81 il ve ~970 ilçenin listesi (Güdül Vakfı sitesindeki rehber verisinden üretildi).
- `scrape.mjs` — her il/ilçe için `eczaneler.gen.tr/nobetci-{il}-{ilce}` sayfasını açar, güncel nöbet
  sekmesindeki eczane adı / adres / telefonu ayıklar, Google Haritalar bağlantısı üretir.
- `.github/workflows/eczane.yml` — 2 saatte bir kazır, `eczaneler.json` değiştiyse depoya commit'ler.
- Site tarafı (`config/eczane.php` → `eczaneJsonKaynaktanCek()`) bu JSON'u ~20 dk önbellekle okur.

## Sık sorulanlar

- **Actions dakikam biter mi?** Public depoda hayır — sınırsız. Private yaparsan aylık 2.000 dk ücretsiz;
  o zaman `cron`'u `0 */4 * * *` (4 saatte bir) yaparak rahatça altında kalırsın.
- **Bazı ilçeler boş geliyor.** O ilçede o gün nöbetçi yoksa normaldir; site otomatik olarak
  Ankara Eczacı Odası / doğrudan gen.tr yedeklerine düşer.
- **Kazıma başarısız olursa?** İş hata verir ama eski `eczaneler.json` bozulmaz; site bir sonraki
  başarılı çalışmaya kadar mevcut veriyi kullanır.
