// DurakPano Yapılandırma Dosyası
module.exports = {
  // Sayfa başlığı ve yenileme sıklığı (saniye cinsinden)
  siteTitle: "DurakPano - Canlı Ulaşım Ekranı",
  refreshIntervalSeconds: 30,

  // Takip edilecek duraklar ve hatlar
  stops: [
    {
      id: "inonu-19",
      durakKodu: "205671",
      durakAdi: "İnönü Mahallesi",
      ilce: "Ataşehir",
      hatKodu: "19",
      hatAdi: "Ferhatpaşa / Yeditepe Üni. - Kadıköy",
      hedefYon: "Kadıköy / Uzunçayır Yönü",
      koordinat: { lat: 40.976097, lng: 29.139142 }
    },
    {
      id: "uhud-14tm",
      durakKodu: "213801",
      durakAdi: "Uhud Camii",
      ilce: "Ataşehir",
      hatKodu: "14TM",
      hatAdi: "Tepeüstü - Maltepe Metro / Cevizli",
      hedefYon: "Bostancı / Maltepe Yönü",
      koordinat: { lat: 40.975381, lng: 29.143251 }
    }
  ],

  // İBB / İETT Resmi Açık Veri SOAP Servisleri
  api: {
    seferGerceklesmeUrl: "https://api.ibb.gov.tr/iett/FiloDurum/SeferGerceklesme.asmx",
    ibbUrl: "https://api.ibb.gov.tr/iett/ibb/ibb.asmx",
    planlananSeferUrl: "https://api.ibb.gov.tr/iett/UlasimAnaVeri/PlanlananSeferSaati.asmx",
    timeoutMs: 8000
  }
};
