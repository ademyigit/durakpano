# 🚍 DurakPano

> **Eski tablet, telefon ve mini ekranları akıllı ev içi transit panosuna dönüştüren açık kaynaklı, ultra hafif web uygulaması.**

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)
![Status](https://img.shields.io/badge/status-active-success.svg)

---

## 📌 Proje Hakkında

Çekmecenizde duran eski ve yavaş bir Android tableti (örneğin 512 MB RAM'li Android 4.2 Jelly Bean **Massive M-701**, Piranha, Everest veya eski iPad'ler) çöpe atmak yerine; antreye, kapı girişine veya çalışma masanıza koyabileceğiniz **canlı bir İETT otobüs varış panosuna** dönüştürür.

### ✨ Öne Çıkan Özellikler

- **🪶 Ultra Hafif & 512 MB RAM Dostu:** Ağır frontend framework'leri (React/Vue vb.) içermez. Saf, optimize HTML ve CSS ile render edilir.
- **🔄 Otomatik Yenileme:** `<meta http-equiv="refresh" content="30">` sayesinde eski model Android tarayıcılarında bile JavaScript çökmesi yaşamadan 30 saniyede bir kendini tazeler.
- **🎨 Yüksek Kontrastlı Koyu Tema:** 800x480 çözünürlüklü 7 inç tabletler için özel tasarlanmış; sabah evden çıkarken 3-4 metre uzaktan bile net okunan büyük tipografi.
- **📡 İETT Canlı GPS Entegrasyonu:** İBB / İETT açık veri web servisleri üzerinden araçların anlık GPS koordinatlarını çeker ve durağa varış dakikasını hesaplar.
- **🌙 Gece & Bakım Modu:** Gece yarısı seferler bittiğinde veya İETT servisleri bakımdayken ekranda hata vermek yerine mantıklı bilgilendirme mesajı gösterir.
- **☁️ %100 Ücretsiz Bulut Kurulumu:** Render veya Vercel üzerinde tek kuruş ödemeden 24/7 çalıştırılabilir.

---

## 🚀 1. Hızlı Kurulum: Ücretsiz Bulutta Çalıştırma

Projeyi bilgisayarınızı sürekli açık tutmadan, ücretsiz bir bulut sağlayıcısında barındırabilirsiniz.

### Seçenek A: Render.com ile Yayınlama (Önerilen)

1. Bu projeyi kendi GitHub hesabınıza forklayın veya yükleyin (Push).
2. [Render.com](https://render.com)'a ücretsiz üye olun.
3. Dashboard'dan **New +** $\rightarrow$ **Web Service** seçeneğine tıklayın.
4. GitHub deponuzu seçin:
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** `Free` (Ücretsiz)
5. **Create Web Service** butonuna basın. 1-2 dakika içinde size `https://durakpano-xxxx.onrender.com` şeklinde ücretsiz bir web adresi verecektir!

### Seçenek B: Vercel ile Yayınlama

1. [Vercel](https://vercel.com)'e ücretsiz GitHub hesabınızla giriş yapın.
2. **Add New Project** diyerek bu depoyu seçin.
3. Projede hazır bulunan `vercel.json` sayesinde herhangi bir ayar yapmanıza gerek kalmadan **Deploy** butonuna basın.

---

## 📱 2. Eski Tableti (Massive M-701 vb.) Panoya Dönüştürme

1. **Tableti Temizleyin:**
   - Ayarlar $\rightarrow$ Yedekle ve Sıfırla $\rightarrow$ Fabrika Ayarlarına Dön.
   - Google Play Servislerini ve gereksiz dahili uygulamaları "Devre Dışı Bırak" yaparak 512 MB RAM'i rahatlatın.
2. **Hafif Tarayıcı Kurun:**
   - Cihazınıza **Lightning Browser** veya **Fully Kiosk Browser (Android 4.x legacy)** APK'sını kurun.
3. **Sayfayı Açın ve Sabitleyin:**
   - Tarayıcının ana sayfası olarak Render/Vercel'den aldığınız linki yapıştırın.
   - Sayfanın sağ alt köşesindeki **Tam Ekran ⛶** butonuna basarak adres çubuğunu gizleyin.
4. **Geliştirici Ayarları:**
   - Ayarlar $\rightarrow$ Geliştirici Seçenekleri $\rightarrow$ **"Uyanık Kal" (Şarj olurken ekran asla uyumaz)** seçeneğini işaretleyin.

> [!CAUTION]
> **7/24 Prizde Çalıştırma ve Pil Güvenliği:**
> Eski lityum pillerin 7/24 şarjda kalarak şişmesini önlemek için tableti ucuz bir zaman ayarlı **akıllı prize** bağlayıp günde sadece 2-3 saat şarj alacak şekilde ayarlamanız önemle tavsiye edilir.

---

## 🛠️ 3. Kendi Durak ve Hatlarınızı Ekleme

`config.js` dosyasını açarak takip etmek istediğiniz durakları ve hatları kolayca güncelleyebilirsiniz:

```javascript
module.exports = {
  refreshIntervalSeconds: 30,

  stops: [
    {
      id: "inonu-19",
      durakKodu: "205671",           // İETT 6 haneli durak kodu
      durakAdi: "İnönü Mahallesi",    // Durak adı
      ilce: "Ataşehir",
      hatKodu: "19",                 // Takip etmek istediğiniz hat
      hatAdi: "Ferhatpaşa - Kadıköy",
      hedefYon: "Kadıköy Yönü",
      koordinat: { lat: 40.9758, lng: 29.1399 } // Durak koordinatları
    },
    {
      id: "uhud-14tm",
      durakKodu: "213801",
      durakAdi: "Uhud Camii",
      ilce: "Ataşehir",
      hatKodu: "14TM",
      hatAdi: "Tepeüstü - Cevizli Peronlar",
      hedefYon: "Cevizli / Maltepe Yönü",
      koordinat: { lat: 40.9805, lng: 29.1462 }
    }
  ]
};
```

---

## 💻 4. Yerel Ortamda Çalıştırma

```bash
# Bağımlılıkları yükleyin
npm install

# Geliştirme modunda başlatın
npm start
# veya dosya değişikliklerini izleyen mod:
npm run dev
```

Tarayıcınızda `http://localhost:3000` adresini açarak test edebilirsiniz.

---

## 📄 Lisans

Bu proje [MIT Lisansı](LICENSE) ile lisanslanmıştır. Dilediğiniz gibi geliştirebilir, evinizde veya iş yerinizde ücretsiz kullanabilirsiniz.
