// DurakPano Yapılandırma Dosyası
module.exports = {
  // Sayfa başlığı ve yenileme sıklığı (saniye cinsinden)
  siteTitle: "DurakPano - Canlı Ulaşım Ekranı",
  refreshIntervalSeconds: 30,

  // Takip edilecek duraklar ve hatlar
  // İstediğiniz kadar durak veya hat ekleyebilirsiniz.
  stops: [
    {
      id: "inonu-19",
      durakKodu: "205671",
      durakAdi: "İnönü Mahallesi",
      ilce: "Ataşehir",
      hatKodu: "19",
      hatAdi: "Ferhatpaşa / Fındıklı - Kadıköy",
      hedefYon: "Kadıköy Yönü",
      koordinat: { lat: 40.9758, lng: 29.1399 }
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
  ],

  // İBB / İETT Servis Ayarları
  api: {
    seferGerceklesmeUrl: "https://api.ibb.gov.tr/iett/FiloDurum/SeferGerceklesme.asmx",
    hatDurakUrl: "https://api.ibb.gov.tr/iett/UlasimAnaVeri/HatDurakGuzergah.asmx",
    timeoutMs: 6000
  }
};
