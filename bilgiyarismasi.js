/* ===========================================================
   Bilgi Yarışması — 7. Sınıf · 1. Ünite (ماذا فَعَلْت اليَوْم؟)
   Firebase 8.10.1 (compat) · proje: bilgiyarismasi7sinif1unite
   Soru biçimleri: test · sürükle-bırak · eşleştirme · klavyeyle yazma
   Mod 1 (ADMIN): dosyayı sade adresle açan kişi = öğretmen (giriş yok).
   Mod 2 (TAKIM): ?oda=..&takim=.. linkiyle anonim katılım.
   Canlı oyun döngüsü: admin kontrollü, sunucu-zamanlı geri sayım,
   dijital cevap, öğrenci cihazında doğru/yanlış GÖRÜNMEZ; doğru/yanlış
   + puan yalnız admin (yansıtılan) ekranda. Puan zorluğa göre.
   =========================================================== */

/* ---------------- Firebase ---------------- */
/*  Firebase web uygulaması bilgileri.
    Proje: bilgiyarismasi7sinif1unite (7. sınıf 1. ünite bilgi yarışması)
    Bu değerler Firebase Console → ⚙️ Proje ayarları → "Uygulamalarınız" →
    Web uygulaması → SDK kurulumu ve yapılandırması bölümünden alınmıştır.
    NOT: Firestore güvenlik kuralları "bilgiYarismasi" koleksiyonunu açık
    tutmalıdır; kurallar "if false" kalırsa oda kurma/katılma çalışmaz.        */
const firebaseConfig = {
    apiKey: "AIzaSyAHlqUeWT5iyzQRn1KhHvzUZDVBs0UD9Qg",
    authDomain: "bilgiyarismasi7sinif1unite.firebaseapp.com",
    projectId: "bilgiyarismasi7sinif1unite",
    storageBucket: "bilgiyarismasi7sinif1unite.firebasestorage.app",
    messagingSenderId: "343340842876",
    appId: "1:343340842876:web:c6ae6e1d0df099be01aef9",
    measurementId: "G-HMJTNR4Q65"
};
const FIREBASE_HAZIR = !!(firebaseConfig.apiKey && firebaseConfig.appId);
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
if (!FIREBASE_HAZIR) console.warn("[BIY] firebaseConfig eksik. Canlı yarışma çalışmaz.");
const KOLEKSIYON = "bilgiYarismasi";
const PDF_AKTIF = false;     // PDF'ler hazır olunca true yap → PDF önizleme/indirme geri gelir
const SORU_SURESI = 60;      // saniye (yedek deger)
/* Zorluga gore soru suresi. Ogretmen ana sayfadaki yildiz akordiyonundan
   degistirebilir; secim tarayicida saklanir.  Sinir: 20 sn – 5 dk.     */
const SURE_VARSAYILAN = { 1: 45, 2: 60, 3: 90 };
const SURE_MIN = 20, SURE_MAX = 300, SURE_ADIM = 5;
function sureKirp(n){
  n = Math.round((+n || 0) / SURE_ADIM) * SURE_ADIM;
  return Math.max(SURE_MIN, Math.min(SURE_MAX, n));
}
function sureYazi(sn){
  sn = Math.max(0, Math.round(sn));
  const d = Math.floor(sn / 60), s = sn % 60;
  return d + ":" + (s < 10 ? "0" : "") + s;
}
const TUR_SORU_SAYISI = 20;  // varsayılan soru sayısı
const SORU_SAYI_SECENEK = [10, 20, 25, 50];
const TOPLAM_PUAN = 1000;    // ana tur toplam puanı (yedekler hariç)
const ZAMAN_PAYI = 0.15;     // puanın en fazla %15'i hızdan (çok fazla değil)
const PUAN = { 1: 10, 2: 20, 3: 30 };  // (eski; artık 1000 üzerinden hesaplanır)

/* ---------------- Soru biçimleri ----------------
   Her sorunun bir "bicim" alanı vardır. Yazılmamışsa "test" kabul edilir,
   böylece eski sorular hiç değiştirilmeden çalışmaya devam eder.
     test     → çoktan seçmeli  { secenekler:[...], dogru:index }
     surukle  → kelimeleri sırala { parcalar:["...","..."] }  (dizideki sıra = doğru sıra)
     eslestir → eşleştirme        { ciftler:[["sol","sağ"], ...] }
     yazma    → klavyeyle yaz     { cevapYazi:"بيت", tuslar:[... en fazla 10 ...] }   */
const BICIM_BILGI = {
  "test":     { ad: "اِخْتِيار",           emoji: "🔘" },
  "surukle":  { ad: "تَرْتيب",  emoji: "🧲" },
  "eslestir": { ad: "وَصْل",     emoji: "🔗" },
  "yazma":    { ad: "كِتابَة",  emoji: "⌨️" }
};
const BICIM_TR_AD = {
  "test":"Çoktan seçmeli", "surukle":"Sıralama", "eslestir":"Eşleştirme", "yazma":"Yazma"
};
const BICIM_ACIKLAMA = {
  "test":"Dört şıktan doğru olanı işaretlenir.",
  "surukle":"Karışık kelimeler doğru sıraya dizilir.",
  "eslestir":"Arapça kelime Türkçe karşılığıyla birleştirilir.",
  "yazma":"Cevap harf harf klavyeyle yazılır."
};
const ZORLUK_ACIKLAMA = {
  1:"Tek kelime, doğrudan anlam soruları.",
  2:"Cümle kurma ve çeviri soruları.",
  3:"Uzun cümle, yazma ve ayrıntı soruları."
};
function bicimAl(s){ return (s && s.bicim) || "test"; }
/* Soru tipi suzgeci: kapatilan bicimler her yerde (liste sayilari, unite
   sayilari, havuz) elenir. */
function bicimSecili(q){ return state.bicimSecim[bicimAl(q)] !== false; }
/* Zorluk süzgeci: kolay / orta / zor ayrı ayrı açılıp kapanır. */
const ZORLUK_TR = { 1:"Kolay", 2:"Orta", 3:"Zor" };
function zorlukAl(s){ const z = s && s.zorluk; return (z === 2 || z === 3) ? z : 1; }
function zorlukSecili(q){
  return !state.zorlukSecim || state.zorlukSecim[zorlukAl(q)] !== false;
}
/* Soru her iki süzgeçten de geçiyor mu? */
function suzgectenGecti(q){ return bicimSecili(q) && zorlukSecili(q); }
// Metin Arapça mı? (kutulara doğru yazı tipini vermek için)
function arMi(t){ return /[؀-ۿ]/.test(String(t == null ? "" : t)); }
/* ---------------- Etiketler: animasyonlu SVG rozetler ----------------
   Soru tipi / bicim / zorluk yazi degil ikon; soru cumlesinin ustunde
   ayri satirda durur. Renk ve animasyon CSS'te (biy-ea-*). */
const _EA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">';
const ETIKET_TIP = {
  "fiil":  _EA+'<circle cx="12" cy="12" r="4"/><g class="biy-ea-don"><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"/></g></svg>',
  "cumle": _EA+'<path d="M6.5 4.5h11a2.5 2.5 0 0 1 2.5 2.5v6a2.5 2.5 0 0 1-2.5 2.5H10.5L6 19v-3.5A2.5 2.5 0 0 1 4 13V7a2.5 2.5 0 0 1 2.5-2.5z"/><path class="biy-ea-ciz" d="M8.5 8.5h7M8.5 11.5h4.5"/></svg>',
  "anlam": _EA+'<path d="M9.8 17.5h4.4M10.6 20.5h2.8"/><path d="M12 3.2a5.6 5.6 0 0 1 3.2 10.2c-.7.5-1 1.1-1 1.9h-4.4c0-.8-.3-1.4-1-1.9A5.6 5.6 0 0 1 12 3.2z"/><g class="biy-ea-parla"><path d="M3.6 5.4l1.5.9M20.4 5.4l-1.5.9M12 .9v1.5"/></g></svg>',
  "yemek": _EA+'<circle cx="12" cy="14.5" r="6.2"/><circle cx="12" cy="14.5" r="2.6"/><g class="biy-ea-buhar"><path d="M9.4 5.6c0-1.1 1-1.5 1-2.6M13.6 5.6c0-1.1 1-1.5 1-2.6"/></g></svg>',
  "saat":  _EA+'<circle cx="12" cy="12" r="8.6"/><g class="biy-ea-saat"><path d="M12 12V6.8"/></g><path d="M12 12l3.4 2"/></svg>',
  "gun":   _EA+'<rect x="3.5" y="5" width="17" height="15.2" rx="2"/><path d="M3.5 9.6h17M8 2.8v4M16 2.8v4"/><circle class="biy-ea-puls" cx="12" cy="15" r="1.6" fill="currentColor" stroke="none"/></svg>',
  "namaz": _EA+'<path d="M4 20.5h16"/><path d="M6 20.5v-7M18 20.5v-7"/><path d="M12 4.8c3 2 4.6 3.8 4.6 6.5v9.2H7.4v-9.2c0-2.7 1.6-4.5 4.6-6.5z"/><circle class="biy-ea-puls" cx="12" cy="2.4" r="1" fill="currentColor" stroke="none"/></svg>',
  "zamir": _EA+'<g class="biy-ea-zip"><circle cx="8.3" cy="8.8" r="2.5"/><path d="M3.8 19.2c0-2.6 2-4.6 4.5-4.6s4.5 2 4.5 4.6"/></g><g class="biy-ea-zip2"><circle cx="16.6" cy="7.8" r="2.2"/><path d="M14.6 14.4c.6-.3 1.3-.5 2-.5 2.3 0 4 1.9 4 4.3"/></g></svg>',
  "kelime": _EA+'<rect x="3" y="6" width="18" height="12" rx="2"/><g class="biy-ea-bas"><rect x="9.4" y="10" width="5.2" height="4" rx="1"/></g><path d="M6 9.5h1.2M16.8 9.5H18M6 14.5h1.2M16.8 14.5H18"/></svg>',
  "varsayilan": _EA+'<circle cx="12" cy="12" r="8.6"/><path class="biy-ea-ciz" d="M9.6 9.2a2.4 2.4 0 1 1 3.3 2.2c-.8.4-.9 1-.9 1.8"/><circle cx="12" cy="16.6" r=".9" fill="currentColor" stroke="none"/></svg>'
};
const ETIKET_BICIM = {
  "test":     _EA+'<circle cx="12" cy="12" r="8.6"/><path class="biy-ea-ciz" d="M8.2 12.4l2.6 2.6 5-5.8"/></svg>',
  "surukle":  _EA+'<rect x="2.8" y="9.4" width="5.2" height="5.2" rx="1.3"/><rect x="16" y="9.4" width="5.2" height="5.2" rx="1.3"/><g class="biy-ea-kay"><rect x="9.4" y="9.4" width="5.2" height="5.2" rx="1.3" fill="currentColor" stroke="none"/></g></svg>',
  "eslestir": _EA+'<circle cx="5.4" cy="7" r="1.9"/><circle cx="18.6" cy="7" r="1.9"/><circle cx="5.4" cy="17" r="1.9"/><circle cx="18.6" cy="17" r="1.9"/><path class="biy-ea-ciz" d="M7.6 7h8.8M7.6 17h8.8"/></svg>',
  "yazma":    _EA+'<path d="M4.5 19.5l1-3.8L16.6 4.6a2.1 2.1 0 0 1 3 3L8.4 18.7z"/><path class="biy-ea-ciz" d="M4.5 22.6h15"/></svg>'
};
const _YILDIZ = 'M12 3.6l2.2 4.4 4.9.7-3.5 3.5.8 4.9-4.4-2.3-4.4 2.3.8-4.9-3.5-3.5 4.9-.7z';
const _EAY = _EA.replace('fill="none"', 'fill="currentColor"');
const ETIKET_ZORLUK = {
  1: _EAY+'<path class="biy-ea-y1" stroke="none" d="'+_YILDIZ+'"/></svg>',
  2: _EAY+'<path class="biy-ea-y1" stroke="none" transform="translate(1.5,4.5) scale(.62)" d="'+_YILDIZ+'"/><path class="biy-ea-y2" stroke="none" transform="translate(9.1,4.5) scale(.62)" d="'+_YILDIZ+'"/></svg>',
  3: _EAY+'<path class="biy-ea-y1" stroke="none" transform="translate(1.4,1.9) scale(.55)" d="'+_YILDIZ+'"/><path class="biy-ea-y2" stroke="none" transform="translate(9.4,1.9) scale(.55)" d="'+_YILDIZ+'"/><path class="biy-ea-y3" stroke="none" transform="translate(5.4,8.9) scale(.55)" d="'+_YILDIZ+'"/></svg>'
};
function etiketHtml(s){
  const t = TIP_BILGI[s.tip] || { ad: s.tip || "" };
  const b = bicimAl(s);
  const bb = BICIM_BILGI[b] || { ad: b };
  return '<div class="biy-etiketler">' +
    '<span class="biy-etiket biy-et-tip" title="'+kacis(t.ad)+'">'+(ETIKET_TIP[s.tip]||ETIKET_TIP.varsayilan)+'</span>' +
    '<span class="biy-etiket biy-et-bicim" title="'+kacis(bb.ad)+'">'+(ETIKET_BICIM[b]||ETIKET_TIP.varsayilan)+'</span>' +
    (ETIKET_ZORLUK[s.zorluk] ? '<span class="biy-etiket biy-et-zorluk z'+s.zorluk+'" title="'+kacis(ZORLUK_AD[s.zorluk]||"")+'">'+ETIKET_ZORLUK[s.zorluk]+'</span>' : '') +
  '</div>';
}
/* Soru cümlesinin ekran hâli: arapca alanı zaten büyük gösterildiği için
   soru içindeki «aynı metin» tekrarı kaldırılır (çift cümle olmaz);
   «Türkçe» bölümler bdi ile soldan sağa (LTR) akar. */
function soruHtml(s){
  let m = String((s && s.soru) || "");
  if (s && s.arapca){
    const tekrar = "«" + s.arapca + "»";
    if (m.indexOf(tekrar) >= 0)
      m = m.replace(tekrar, "").replace(/\s{2,}/g, " ").replace(/\s+([؟?،.])/g, "$1").trim();
  }
  return kacis(m).replace(/«([^»]*)»/g, function(tum, ic){
    return /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(ic) ? '«<bdi class="biy-ltr-ic">' + ic + '</bdi>»' : tum;
  });
}
function karistir(dizi){
  const a = (dizi || []).slice();
  for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random()*(i+1)); const g = a[i]; a[i] = a[j]; a[j] = g; }
  return a;
}
// Bir cevabın doğru olup olmadığını TEK yerden karar veren yardımcı.
function cevapDogruMu(s, secilen){
  if (!s || secilen == null) return false;
  const b = bicimAl(s);
  if (b === "surukle")
    return Array.isArray(secilen) && Array.isArray(s.parcalar) && secilen.join("|") === s.parcalar.join("|");
  if (b === "eslestir")
    return Array.isArray(secilen) && Array.isArray(s.ciftler) &&
           secilen.length === s.ciftler.length && s.ciftler.every((c, i) => secilen[i] === c[1]);
  if (b === "yazma")
    return String(secilen).replace(/\s+/g, "") === String(s.cevapYazi || "").replace(/\s+/g, "");
  return secilen === s.dogru;
}
// Doğru cevabın okunabilir metni (önizleme kartları, sınıf modu, soru havuzu).
function dogruCevapMetni(s){
  const b = bicimAl(s);
  if (b === "surukle")  return (s.parcalar || []).join(" ");
  if (b === "eslestir") return (s.ciftler || []).map(c => c[0] + " → " + c[1]).join("  ·  ");
  if (b === "yazma")    return s.cevapYazi || "";
  return (s.secenekler || [])[s.dogru] || "";
}
// Soru havuzu aramasında taranacak metin.
function aramaMetni(q){
  const b = bicimAl(q);
  if (b === "surukle")  return (q.parcalar || []).join(" ");
  if (b === "eslestir") return (q.ciftler || []).map(c => c.join(" ")).join(" ");
  if (b === "yazma")    return q.cevapYazi || "";
  return (q.secenekler || []).join(" ");
}
// Bir takımın verdiği cevabın gösterim biçimi (sonuç ekranı tablosu).
function secimHtml(soru, secilen){
  const b = bicimAl(soru);
  if (secilen == null) return '<span class="biy-rev-yok">—</span>';
  if (b === "surukle")
    return '<span class="biy-rev-metin ar">' + kacis((secilen || []).join(" ")) + '</span>';
  if (b === "eslestir"){
    const sol = (soru.ciftler || []).map(c => c[0]);
    return '<span class="biy-rev-cift">' +
      sol.map((x, i) => '<i>' + kacis(x) + ' → ' + kacis((secilen || [])[i] || "—") + '</i>').join("") + '</span>';
  }
  if (b === "yazma")
    return '<span class="biy-rev-metin ar">' + kacis(String(secilen)) + '</span>';
  const harf = String.fromCharCode(65 + secilen);
  const sMetin = (soru.secenekler || [])[secilen] || "";
  const ar = arMi(sMetin) ? ' ar' : ' biy-ltr';
  return '<b class="biy-rev-harf">' + harf + '</b> <span class="biy-rev-metin' + ar + '">' +
         kacis(sMetin) + '</span>';
}

/* ---------------- Seed soru havuzu ---------------- */
/* 7. SINIF — 1. ÜNİTE:  ماذا فَعَلْت اليَوْم؟  (Bugün Ne Yaptım?)
   Konular: günlük rutin fiilleri, yiyecek-içecekler, saatler,
            haftanın günleri, namaz vakitleri, zamir-fiil uyumu.
   Soru id'leri konu grupları arasında ÇAKIŞMAMALIDIR (birleşik konu kullanıldığı için). */

/* --- 1) Günlük rutin (id 1-99) --- */
const S_GUNLUK = [
  {"id":1,"tip":"fiil","zorluk":1,"soru":"ما مَعْنى «أَسْتَيْقِظُ»؟","secenekler":["Uyanırım","Uyurum","Yıkanırım","Giyerim"],"dogru":0,"arapca":"أَسْتَيْقِظُ"},
  {"id":2,"tip":"fiil","zorluk":1,"soru":"ما مَعْنى «أَتَوَضَّأُ»؟","secenekler":["Abdest alırım","Namaz kılarım","Uyanırım","Yemek yerim"],"dogru":0,"arapca":"أَتَوَضَّأُ"},
  {"id":3,"tip":"fiil","zorluk":1,"soru":"ما مَعْنى «أُصَلّي»؟","secenekler":["Namaz kılarım","Ders çalışırım","Koşarım","Dönerim"],"dogru":0,"arapca":"أُصَلّي"},
  {"id":4,"tip":"fiil","zorluk":1,"soru":"ما مَعْنى «أَتَناوَلُ الفَطور»؟","secenekler":["Kahvaltı yaparım","Akşam yemeği yerim","Süt içerim","Uyurum"],"dogru":0,"arapca":"أَتَناوَلُ الفَطور"},
  {"id":5,"tip":"fiil","zorluk":1,"soru":"ما مَعْنى «أَلْبَسُ مَلابِسي»؟","secenekler":["Elbiselerimi giyerim","Ellerimi yıkarım","Dişlerimi fırçalarım","Odamı temizlerim"],"dogru":0,"arapca":"أَلْبَسُ مَلابِسي"},
  {"id":6,"tip":"fiil","zorluk":1,"soru":"ما مَعْنى «أَرْجِعُ إِلى البَيْت»؟","secenekler":["Eve dönerim","Okula giderim","Evden çıkarım","Eve girerim"],"dogru":0,"arapca":"أَرْجِعُ إِلى البَيْت"},
  {"id":7,"tip":"fiil","zorluk":1,"soru":"ما مَعْنى «أُساعِدُ أُمّي»؟","secenekler":["Anneme yardım ederim","Annemi severim","Annemi beklerim","Anneme sorarım"],"dogru":0,"arapca":"أُساعِدُ أُمّي"},
  {"id":8,"tip":"fiil","zorluk":1,"soru":"ما مَعْنى «أَدْرُسُ دُروسي»؟","secenekler":["Derslerimi çalışırım","Derse giderim","Ders anlatırım","Dersi dinlerim"],"dogru":0,"arapca":"أَدْرُسُ دُروسي"},
  {"id":9,"tip":"fiil","zorluk":2,"soru":"ما تَرْجَمَة «Dişlerimi temizlerim» بِالعَرَبِيَّة؟","secenekler":["أُنَظِّفُ أَسْناني","أَغْسِلُ يَدَيّ","أَلْبَسُ مَلابِسي","أَتَناوَلُ الفَطور"],"dogru":0,"arSecenek":true},
  {"id":10,"tip":"fiil","zorluk":2,"soru":"ما تَرْجَمَة «Geceleyin uyurum» بِالعَرَبِيَّة؟","secenekler":["أَنامُ لَيْلًا","أَسْتَيْقِظُ صَباحًا","أَرْجِعُ ظُهْرًا","أَدْرُسُ مَساءً"],"dogru":0,"arSecenek":true},
  {"id":11,"tip":"fiil","zorluk":2,"soru":"ما مَعْنى «أَغْسِلُ يَدَيّ قَبْل الطَّعام»؟","secenekler":["Yemekten önce ellerimi yıkarım","Yemekten sonra ellerimi yıkarım","Yemekten önce dua ederim","Yemekten sonra dişlerimi fırçalarım"],"dogru":0,"arapca":"أَغْسِلُ يَدَيّ قَبْل الطَّعام"},
  {"id":12,"tip":"fiil","zorluk":2,"soru":"ما مَعْنى «مُبَكِّرًا»؟","secenekler":["Erken","Geç","Yavaş","Hızlı"],"dogru":0,"arapca":"مُبَكِّرًا"},
  {"id":13,"tip":"cumle","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Sabah erken uyanırım.»","parcalar":["أَسْتَيْقِظُ","في","الصَّباح","مُبَكِّرًا"]},
  {"id":14,"tip":"cumle","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Ailemle kahvaltı yaparım.»","parcalar":["أَتَناوَلُ","الفَطور","مَع","عائِلَتي"]},
  {"id":15,"tip":"cumle","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Öğleyin eve dönerim.»","parcalar":["أَرْجِعُ","إِلى","البَيْت","ظُهْرًا"]},
  {"id":16,"tip":"cumle","bicim":"surukle","zorluk":3,"soru":"رَتِّب الكَلِمات: «Abdest alırım, sonra sabah namazını kılarım.»","parcalar":["أَتَوَضَّأُ","ثُمّ","أُصَلّي","الفَجْر"]},
  {"id":17,"tip":"anlam","bicim":"eslestir","zorluk":2,"soru":"صِل الأَفْعال بِمَعانيها.","ciftler":[["أَسْتَيْقِظُ","uyanırım"],["أَنامُ","uyurum"],["أَلْبَسُ","giyerim"],["أُساعِدُ","yardım ederim"]]},
  {"id":18,"tip":"anlam","bicim":"eslestir","zorluk":2,"soru":"صِل الأَفْعال بِمَعانيها.","ciftler":[["أَتَوَضَّأُ","abdest alırım"],["أُصَلّي","namaz kılarım"],["أَدْرُسُ","ders çalışırım"],["أَذْهَبُ","giderim"]]},
  {"id":19,"tip":"anlam","bicim":"eslestir","zorluk":3,"soru":"صِلْ ظُروف الزَّمان.","ciftler":[["الصَّباح","sabah"],["الظُّهْر","öğle"],["المَساء","akşam"],["اللَّيْل","gece"]]},
  {"id":20,"tip":"kelime","bicim":"yazma","zorluk":3,"soru":"اُكْتُبْ «ev» بِالحُروف.","cevapYazi":"بيت","tuslar":["ب","ي","ت","ن","ث","م","ل","ر","س","د"]}
];

/* --- 2) Yiyecek & içecekler (id 101-199) --- */
const S_YEMEK = [
  {"id":101,"tip":"yemek","zorluk":1,"soru":"ما مَعْنى «الحَليب»؟","secenekler":["Süt","Peynir","Bal","Su"],"dogru":0,"arapca":"الحَليب"},
  {"id":102,"tip":"yemek","zorluk":1,"soru":"ما مَعْنى «الجُبْن»؟","secenekler":["Peynir","Zeytin","Et","Ekmek"],"dogru":0,"arapca":"الجُبْن"},
  {"id":103,"tip":"yemek","zorluk":1,"soru":"ما مَعْنى «الزَّيْتون»؟","secenekler":["Zeytin","Üzüm","Elma","Hurma"],"dogru":0,"arapca":"الزَّيْتون"},
  {"id":104,"tip":"yemek","zorluk":1,"soru":"ما مَعْنى «العَسَل»؟","secenekler":["Bal","Tereyağı","Reçel","Şeker"],"dogru":0,"arapca":"العَسَل"},
  {"id":105,"tip":"yemek","zorluk":1,"soru":"ما مَعْنى «الزُّبْدَة»؟","secenekler":["Tereyağı","Bal","Peynir","Yoğurt"],"dogru":0,"arapca":"الزُّبْدَة"},
  {"id":106,"tip":"yemek","zorluk":1,"soru":"ما مَعْنى «السَّمَك»؟","secenekler":["Balık","Tavuk","Et","Pirinç"],"dogru":0,"arapca":"السَّمَك"},
  {"id":107,"tip":"yemek","zorluk":1,"soru":"ما مَعْنى «الدَّجاج»؟","secenekler":["Tavuk","Balık","Et","Yumurta"],"dogru":0,"arapca":"الدَّجاج"},
  {"id":108,"tip":"yemek","zorluk":1,"soru":"ما مَعْنى «الأُرْز»؟","secenekler":["Pirinç","Makarna","Ekmek","Çorba"],"dogru":0,"arapca":"الأُرْز"},
  {"id":109,"tip":"yemek","zorluk":1,"soru":"ما مَعْنى «العَصير»؟","secenekler":["Meyve suyu","Çay","Kahve","Süt"],"dogru":0,"arapca":"العَصير"},
  {"id":110,"tip":"yemek","zorluk":1,"soru":"ما مَعْنى «الخُبْز»؟","secenekler":["Ekmek","Peynir","Pirinç","Tuz"],"dogru":0,"arapca":"الخُبْز"},
  {"id":111,"tip":"yemek","zorluk":2,"soru":"ما مَعْنى «الفَطور - الغَداء - العَشاء» بِالتَّرْتيب؟","secenekler":["Kahvaltı - öğle yemeği - akşam yemeği","Öğle yemeği - kahvaltı - akşam yemeği","Akşam yemeği - kahvaltı - öğle yemeği","Kahvaltı - akşam yemeği - öğle yemeği"],"dogru":0},
  {"id":112,"tip":"yemek","zorluk":2,"soru":"ما تَرْجَمَة «Kahvaltıda süt içerim» بِالعَرَبِيَّة؟","secenekler":["أَشْرَبُ الحَليب في الفَطور","آكُلُ الجُبْن في الفَطور","أَشْرَبُ العَصير في العَشاء","آكُلُ السَّمَك في الغَداء"],"dogru":0,"arSecenek":true},
  {"id":113,"tip":"yemek","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Öğle yemeğinde et ve pirinç yerim.»","parcalar":["أَتَناوَلُ","اللَّحْم","وَالأُرْز","في","الغَداء"]},
  {"id":114,"tip":"yemek","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Öğle yemeğinden sonra kahve içerim.»","parcalar":["أَشْرَبُ","القَهْوَة","بَعْد","الغَداء"]},
  {"id":115,"tip":"yemek","bicim":"surukle","zorluk":3,"soru":"رَتِّب الكَلِمات: «Kahvaltıda zeytin ve peynir yerim.»","parcalar":["أَتَناوَلُ","الزَّيْتون","وَالجُبْن","في","الفَطور"]},
  {"id":116,"tip":"yemek","bicim":"eslestir","zorluk":2,"soru":"صِل المَشْروبات.","ciftler":[["الحَليب","süt"],["القَهْوَة","kahve"],["الشّاي","çay"],["العَصير","meyve suyu"]]},
  {"id":117,"tip":"yemek","bicim":"eslestir","zorluk":2,"soru":"صِل الأَطْعِمَة.","ciftler":[["السَّمَك","balık"],["الدَّجاج","tavuk"],["اللَّحْم","et"],["الخُبْز","ekmek"]]},
  {"id":118,"tip":"yemek","bicim":"eslestir","zorluk":3,"soru":"صِلْ أَطْعِمَة الفَطور.","ciftler":[["الزَّيْتون","zeytin"],["الجُبْن","peynir"],["العَسَل","bal"],["الزُّبْدَة","tereyağı"]]},
  {"id":119,"tip":"kelime","bicim":"yazma","zorluk":3,"soru":"اُكْتُبْ «ekmek» بِالحُروف.","cevapYazi":"خبز","tuslar":["خ","ب","ز","ح","ج","ر","د","ن","ت","م"]},
  {"id":120,"tip":"kelime","bicim":"yazma","zorluk":3,"soru":"اُكْتُبْ «balık» بِالحُروف.","cevapYazi":"سمك","tuslar":["س","م","ك","ش","ن","ل","ب","ت","ح","ر"]}
];

/* --- 3) Saatler (id 201-299) --- */
const S_SAAT = [
  {"id":201,"tip":"saat","zorluk":1,"soru":"كَم السّاعَة؟ «السّاعَة الثّالِثَة»","secenekler":["3","2","4","8"],"dogru":0,"arapca":"السّاعَة الثّالِثَة"},
  {"id":202,"tip":"saat","zorluk":1,"soru":"كَم السّاعَة؟ «السّاعَة السّابِعَة»","secenekler":["7","6","8","9"],"dogru":0,"arapca":"السّاعَة السّابِعَة"},
  {"id":203,"tip":"saat","zorluk":1,"soru":"كَم السّاعَة؟ «السّاعَة العاشِرَة»","secenekler":["10","9","11","12"],"dogru":0,"arapca":"السّاعَة العاشِرَة"},
  {"id":204,"tip":"saat","zorluk":2,"soru":"كَم السّاعَة؟ «السّاعَة الحادِيَة عَشْرَة»","secenekler":["11","10","12","1"],"dogru":0,"arapca":"السّاعَة الحادِيَة عَشْرَة"},
  {"id":205,"tip":"saat","zorluk":2,"soru":"كَيْف نَقولُ السّاعَة 1 بِالعَرَبِيَّة؟","secenekler":["السّاعَة الواحِدَة","السّاعَة الثّانِيَة","السّاعَة الحادِيَة عَشْرَة","السّاعَة الثّامِنَة"],"dogru":0,"arSecenek":true},
  {"id":206,"tip":"saat","zorluk":2,"soru":"كَيْف نَقولُ السّاعَة 12 بِالعَرَبِيَّة؟","secenekler":["السّاعَة الثّانِيَة عَشْرَة","السّاعَة الثّانِيَة","السّاعَة العاشِرَة","السّاعَة التّاسِعَة"],"dogru":0,"arSecenek":true},
  {"id":207,"tip":"saat","zorluk":2,"soru":"كَم السّاعَة؟ «السّاعَة السّادِسَة»","secenekler":["6","5","7","9"],"dogru":0,"arapca":"السّاعَة السّادِسَة"},
  {"id":208,"tip":"saat","bicim":"surukle","zorluk":2,"soru":"رَتِّب السّاعات مِنْ 1 إِلى 4 (مِن اليَمين).","parcalar":["الواحِدَة","الثّانِيَة","الثّالِثَة","الرّابِعَة"]},
  {"id":209,"tip":"saat","bicim":"surukle","zorluk":2,"soru":"رَتِّب السّاعات مِنْ 5 إِلى 8 (مِن اليَمين).","parcalar":["الخامِسَة","السّادِسَة","السّابِعَة","الثّامِنَة"]},
  {"id":210,"tip":"saat","bicim":"surukle","zorluk":3,"soru":"رَتِّب الكَلِمات: «Saat yedide okula giderim.»","parcalar":["أَذْهَبُ","إِلى","المَدْرَسَة","في","السّاعَة","السّابِعَة"]},
  {"id":211,"tip":"saat","bicim":"eslestir","zorluk":2,"soru":"صِل السّاعات بِالأَرْقام.","ciftler":[["الثّانِيَة","2"],["الرّابِعَة","4"],["السّادِسَة","6"],["الثّامِنَة","8"]]},
  {"id":212,"tip":"saat","bicim":"eslestir","zorluk":3,"soru":"صِل السّاعات بِالأَرْقام.","ciftler":[["الخامِسَة","5"],["التّاسِعَة","9"],["العاشِرَة","10"],["الثّانِيَة عَشْرَة","12"]]},
  {"id":213,"tip":"kelime","bicim":"yazma","zorluk":3,"soru":"اُكْتُبْ «saat» بِالحُروف.","cevapYazi":"ساعة","tuslar":["س","ا","ع","ة","ص","ح","ه","ت","ن","م"]}
];

/* --- 4) Haftanın günleri (id 301-399) --- */
const S_GUNLER = [
  {"id":301,"tip":"gun","zorluk":1,"soru":"أَيّ يَوْم هُوَ «يَوْم الجُمُعَة»؟","secenekler":["Cuma","Perşembe","Cumartesi","Pazar"],"dogru":0,"arapca":"يَوْم الجُمُعَة"},
  {"id":302,"tip":"gun","zorluk":1,"soru":"أَيّ يَوْم هُوَ «يَوْم السَّبْت»؟","secenekler":["Cumartesi","Cuma","Pazar","Pazartesi"],"dogru":0,"arapca":"يَوْم السَّبْت"},
  {"id":303,"tip":"gun","zorluk":1,"soru":"أَيّ يَوْم هُوَ «يَوْم الأَحَد»؟","secenekler":["Pazar","Cumartesi","Pazartesi","Salı"],"dogru":0,"arapca":"يَوْم الأَحَد"},
  {"id":304,"tip":"gun","zorluk":1,"soru":"أَيّ يَوْم هُوَ «يَوْم الاِثْنَيْن»؟","secenekler":["Pazartesi","Salı","Çarşamba","Pazar"],"dogru":0,"arapca":"يَوْم الاِثْنَيْن"},
  {"id":305,"tip":"gun","zorluk":1,"soru":"أَيّ يَوْم هُوَ «يَوْم الخَميس»؟","secenekler":["Perşembe","Çarşamba","Cuma","Salı"],"dogru":0,"arapca":"يَوْم الخَميس"},
  {"id":306,"tip":"gun","zorluk":2,"soru":"كَيْف نَقولُ «Çarşamba» بِالعَرَبِيَّة؟","secenekler":["الأَرْبِعاء","الثُّلاثاء","الخَميس","الاِثْنَيْن"],"dogru":0,"arSecenek":true},
  {"id":307,"tip":"gun","zorluk":2,"soru":"أَيّ يَوْم هُوَ «يَوْم الثُّلاثاء»؟","secenekler":["Salı","Çarşamba","Pazartesi","Perşembe"],"dogru":0,"arapca":"يَوْم الثُّلاثاء"},
  {"id":308,"tip":"gun","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Pazar günü Cumartesi gününden sonra gelir.»","parcalar":["يَوْم","الأَحَد","يَأْتي","بَعْد","يَوْم","السَّبْت"]},
  {"id":309,"tip":"gun","bicim":"surukle","zorluk":2,"soru":"رَتِّب الأَيّام: Pazartesi → Perşembe (مِن اليَمين).","parcalar":["الاِثْنَيْن","الثُّلاثاء","الأَرْبِعاء","الخَميس"]},
  {"id":310,"tip":"gun","bicim":"eslestir","zorluk":2,"soru":"صِل الأَيّام.","ciftler":[["الاِثْنَيْن","Pazartesi"],["الثُّلاثاء","Salı"],["الأَرْبِعاء","Çarşamba"],["الخَميس","Perşembe"]]},
  {"id":311,"tip":"gun","bicim":"eslestir","zorluk":2,"soru":"صِل الأَيّام.","ciftler":[["الجُمُعَة","Cuma"],["السَّبْت","Cumartesi"],["الأَحَد","Pazar"],["الأُسْبوع","hafta"]]},
  {"id":312,"tip":"kelime","bicim":"yazma","zorluk":3,"soru":"اُكْتُبْ «gün» بِالحُروف.","cevapYazi":"يوم","tuslar":["ي","و","م","ن","ب","ت","ل","ر","س","ه"]}
];

/* --- 5) Namaz vakitleri (id 401-499) --- */
const S_NAMAZ = [
  {"id":401,"tip":"namaz","zorluk":1,"soru":"أَيّ صَلاة هِيَ «الفَجْر»؟","secenekler":["Sabah","Öğle","İkindi","Akşam"],"dogru":0,"arapca":"الفَجْر"},
  {"id":402,"tip":"namaz","zorluk":1,"soru":"أَيّ صَلاة هِيَ «الظُّهْر»؟","secenekler":["Öğle","İkindi","Akşam","Yatsı"],"dogru":0,"arapca":"الظُّهْر"},
  {"id":403,"tip":"namaz","zorluk":1,"soru":"أَيّ صَلاة هِيَ «العَصْر»؟","secenekler":["İkindi","Öğle","Akşam","Sabah"],"dogru":0,"arapca":"العَصْر"},
  {"id":404,"tip":"namaz","zorluk":1,"soru":"أَيّ صَلاة هِيَ «المَغْرِب»؟","secenekler":["Akşam","Yatsı","İkindi","Sabah"],"dogru":0,"arapca":"المَغْرِب"},
  {"id":405,"tip":"namaz","zorluk":1,"soru":"أَيّ صَلاة هِيَ «العِشاء»؟","secenekler":["Yatsı","Akşam","Sabah","Öğle"],"dogru":0,"arapca":"العِشاء"},
  {"id":406,"tip":"namaz","zorluk":2,"soru":"ما مَعْنى «شُروق الشَّمْس»؟","secenekler":["Güneşin doğuşu","Güneşin batışı","Gece yarısı","Öğle vakti"],"dogru":0,"arapca":"شُروق الشَّمْس"},
  {"id":407,"tip":"namaz","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Güneş doğmadan önce sabah namazı kılarım.»","parcalar":["أُصَلّي","الفَجْر","قَبْل","شُروق","الشَّمْس"]},
  {"id":408,"tip":"namaz","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Uyumadan önce yatsı namazı kılarım.»","parcalar":["أُصَلّي","العِشاء","قَبْل","النَّوْم"]},
  {"id":409,"tip":"namaz","bicim":"surukle","zorluk":3,"soru":"رَتِّب الكَلِمات: «Muhammed öğle namazını cemaatle kılar.»","parcalar":["يُصَلّي","مُحَمَّد","الظُّهْر","مَع","الجَماعَة"]},
  {"id":410,"tip":"namaz","bicim":"eslestir","zorluk":2,"soru":"صِلْ أَوْقات الصَّلاة.","ciftler":[["الفَجْر","sabah"],["الظُّهْر","öğle"],["العَصْر","ikindi"],["المَغْرِب","akşam"]]},
  {"id":411,"tip":"kelime","bicim":"yazma","zorluk":3,"soru":"اُكْتُبْ «mescid / cami» بِالحُروف.","cevapYazi":"مسجد","tuslar":["م","س","ج","د","ح","خ","ش","ن","ت","ر"]}
];

/* --- 6) Zamir - fiil uyumu (id 501-599) --- */
const S_ZAMIR = [
  {"id":501,"tip":"zamir","zorluk":2,"soru":"ما الكَلِمَة المُناسِبَة لِلْفَراغ؟ «هُوَ ... مُبَكِّرًا»","secenekler":["يَسْتَيْقِظُ","تَسْتَيْقِظُ","أَسْتَيْقِظُ","تَسْتَيْقِظينَ"],"dogru":0,"arSecenek":true},
  {"id":502,"tip":"zamir","zorluk":2,"soru":"ما الكَلِمَة المُناسِبَة لِلْفَراغ؟ «هِيَ ... الفَجْر»","secenekler":["تُصَلّي","يُصَلّي","أُصَلّي","تُصَلّينَ"],"dogru":0,"arSecenek":true},
  {"id":503,"tip":"zamir","zorluk":2,"soru":"ما الكَلِمَة المُناسِبَة لِلْفَراغ؟ «أَنْتِ ... إِلى البَيْت»","secenekler":["تَرْجِعينَ","تَرْجِعُ","يَرْجِعُ","أَرْجِعُ"],"dogru":0,"arSecenek":true},
  {"id":504,"tip":"zamir","zorluk":2,"soru":"ما الكَلِمَة المُناسِبَة لِلْفَراغ؟ «أَنْتَ ... أُمَّكَ»","secenekler":["تُساعِدُ","تُساعِدينَ","يُساعِدُ","أُساعِدُ"],"dogru":0,"arSecenek":true},
  {"id":505,"tip":"zamir","zorluk":2,"soru":"ما الكَلِمَة المُناسِبَة لِلْفَراغ؟ «هِيَ ... أَسْنانَها»","secenekler":["تُنَظِّفُ","يُنَظِّفُ","أُنَظِّفُ","تُنَظِّفينَ"],"dogru":0,"arSecenek":true},
  {"id":506,"tip":"zamir","zorluk":2,"soru":"ما الكَلِمَة المُناسِبَة لِلْفَراغ؟ «أَنْتِ ... لَيْلًا»","secenekler":["تَنامينَ","تَنامُ","يَنامُ","أَنامُ"],"dogru":0,"arSecenek":true},
  {"id":507,"tip":"zamir","zorluk":3,"soru":"مَن فاعِل الفِعْل «يَتَناوَلُ»؟","secenekler":["هُوَ","هِيَ","أَنا","أَنْتِ"],"dogru":0,"arSecenek":true},
  {"id":508,"tip":"zamir","bicim":"eslestir","zorluk":2,"soru":"صِل الضَّمائِر بِالأَفْعال (دَرَسَ).","ciftler":[["أَنا","أَدْرُسُ"],["هُوَ","يَدْرُسُ"],["هِيَ","تَدْرُسُ"],["أَنْتِ","تَدْرُسينَ"]]},
  {"id":509,"tip":"zamir","bicim":"eslestir","zorluk":3,"soru":"صِل الضَّمائِر بِالأَفْعال (نامَ).","ciftler":[["أَنا","أَنامُ"],["هُوَ","يَنامُ"],["هِيَ","تَنامُ"],["أَنْتِ","تَنامينَ"]]},
  {"id":510,"tip":"zamir","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «O (kız) ailesiyle kahvaltı yapar.»","parcalar":["هِيَ","تَتَناوَلُ","الفَطور","مَع","أُسْرَتِها"]},
  {"id":511,"tip":"zamir","bicim":"surukle","zorluk":3,"soru":"رَتِّب الكَلِمات: «O (erkek) sabahleyin dişlerini temizler.»","parcalar":["هُوَ","يُنَظِّفُ","أَسْنانَه","في","الصَّباح"]}
];


/* ix51: 4 unite verisi */

/* ---- 2. UNITE — وَقْت التَّسَوُّق ---- */

const S_U2_MARKET = [
  {"id":2001,"tip":"market","zorluk":1,"soru":"ما مَعْنى «الخُبْز»؟","secenekler":["Ekmek","Süt","Peynir","Tuz"],"dogru":0,"arapca":"الخُبْز"},
  {"id":2002,"tip":"market","zorluk":1,"soru":"ما مَعْنى «الحَليب»؟","secenekler":["Süt","Su","Meyve suyu","Çay"],"dogru":0,"arapca":"الحَليب"},
  {"id":2003,"tip":"market","zorluk":1,"soru":"ما مَعْنى «العَسَل»؟","secenekler":["Bal","Şeker","Tereyağı","Reçel"],"dogru":0,"arapca":"العَسَل"},
  {"id":2004,"tip":"market","zorluk":1,"soru":"ما مَعْنى «البَيْض»؟","secenekler":["Yumurta","Peynir","Zeytin","Ekmek"],"dogru":0,"arapca":"البَيْض"},
  {"id":2005,"tip":"market","zorluk":1,"soru":"ما مَعْنى «السُّكَّر»؟","secenekler":["Şeker","Tuz","Bal","Un"],"dogru":0,"arapca":"السُّكَّر"},
  {"id":2006,"tip":"market","zorluk":1,"soru":"ما مَعْنى «المِلْح»؟","secenekler":["Tuz","Şeker","Biber","Baharat"],"dogru":0,"arapca":"المِلْح"},
  {"id":2007,"tip":"market","zorluk":1,"soru":"ما مَعْنى «الجُبْن»؟","secenekler":["Peynir","Tereyağı","Yoğurt","Süt"],"dogru":0,"arapca":"الجُبْن"},
  {"id":2008,"tip":"market","zorluk":1,"soru":"ما مَعْنى «اللَّحْم»؟","secenekler":["Et","Tavuk","Balık","Köfte"],"dogru":0,"arapca":"اللَّحْم"},
  {"id":2009,"tip":"market","zorluk":1,"soru":"ما مَعْنى «الدَّجاج»؟","secenekler":["Tavuk","Et","Balık","Yumurta"],"dogru":0,"arapca":"الدَّجاج"},
  {"id":2010,"tip":"market","zorluk":1,"soru":"ما مَعْنى «السَّمَك»؟","secenekler":["Balık","Tavuk","Et","Çorba"],"dogru":0,"arapca":"السَّمَك"},
  {"id":2011,"tip":"market","zorluk":2,"soru":"ما تَرْجَمَة «Makarna» بِالعَرَبِيَّة؟","secenekler":["مَكَرونَة","بَقّالَة","زُبْدَة","حَساء"],"dogru":0,"arSecenek":true},
  {"id":2012,"tip":"market","zorluk":2,"soru":"ما تَرْجَمَة «Meyve suyu» بِالعَرَبِيَّة؟","secenekler":["عَصير","ماء","قَهْوَة","شاي"],"dogru":0,"arSecenek":true},
  {"id":2013,"tip":"market","zorluk":2,"soru":"ما مَعْنى «البَقّالَة»؟","secenekler":["Bakkal","Kasap","Fırın","Eczane"],"dogru":0,"arapca":"البَقّالَة"},
  {"id":2014,"tip":"market","zorluk":2,"soru":"ما مَعْنى «الزُّبْدَة»؟","secenekler":["Tereyağı","Bal","Peynir","Kaymak"],"dogru":0,"arapca":"الزُّبْدَة"},
  {"id":2015,"tip":"market","zorluk":2,"soru":"ما مَعْنى «أُريدُ خُبْزًا طازَجًا»؟","secenekler":["Taze ekmek istiyorum","Taze süt istiyorum","Bayat ekmek var","Ekmek sevmiyorum"],"dogru":0,"arapca":"أُريدُ خُبْزًا طازَجًا"},
  {"id":2016,"tip":"market","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Taze ekmek istiyorum.»","parcalar":["أُريدُ","خُبْزًا","طازَجًا"]},
  {"id":2017,"tip":"market","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Bakkala gidiyorum.»","parcalar":["أَذْهَبُ","إِلى","البَقّالَة"]},
  {"id":2018,"tip":"market","bicim":"surukle","zorluk":3,"soru":"رَتِّب الكَلِمات: «Meyve suyu ve su istiyorum.»","parcalar":["أُريدُ","عَصيرًا","وَماءً"]},
  {"id":2019,"tip":"market","bicim":"eslestir","zorluk":2,"soru":"صِل المَشْروبات.","ciftler":[["الشّاي","Çay"],["القَهْوَة","Kahve"],["الحَليب","Süt"],["العَصير","Meyve suyu"]]},
  {"id":2020,"tip":"market","bicim":"eslestir","zorluk":2,"soru":"صِل الأَطْعِمَة.","ciftler":[["الخُبْز","Ekmek"],["الجُبْن","Peynir"],["البَيْض","Yumurta"],["العَسَل","Bal"]]},
  {"id":2021,"tip":"market","bicim":"eslestir","zorluk":3,"soru":"صِل المَوادّ الغِذائِيَّة.","ciftler":[["الأُرْز","Pirinç"],["المَكَرونَة","Makarna"],["اللَّحْم","Et"],["السَّمَك","Balık"]]},
  {"id":2022,"tip":"market","bicim":"yazma","zorluk":3,"soru":"اُكْتُبْ «süt» بِالحُروف.","cevapYazi":"حليب","tuslar":["ح","ل","ي","ب","م","س","ك","ر","ن","د"]}
];

const S_U2_SEBZE = [
  {"id":2101,"tip":"sebze","zorluk":1,"soru":"ما مَعْنى «البَصَل»؟","secenekler":["Soğan","Sarımsak","Patates","Havuç"],"dogru":0,"arapca":"البَصَل"},
  {"id":2102,"tip":"sebze","zorluk":1,"soru":"ما مَعْنى «البَطاطا»؟","secenekler":["Patates","Patlıcan","Domates","Soğan"],"dogru":0,"arapca":"البَطاطا"},
  {"id":2103,"tip":"sebze","zorluk":1,"soru":"ما مَعْنى «الطَّماطِم»؟","secenekler":["Domates","Biber","Salatalık","Havuç"],"dogru":0,"arapca":"الطَّماطِم"},
  {"id":2104,"tip":"sebze","zorluk":1,"soru":"ما مَعْنى «الخِيار»؟","secenekler":["Salatalık","Kabak","Domates","Fasulye"],"dogru":0,"arapca":"الخِيار"},
  {"id":2105,"tip":"sebze","zorluk":1,"soru":"ما مَعْنى «الجَزَر»؟","secenekler":["Havuç","Patates","Turp","Soğan"],"dogru":0,"arapca":"الجَزَر"},
  {"id":2106,"tip":"sebze","zorluk":1,"soru":"ما مَعْنى «الباذِنْجان»؟","secenekler":["Patlıcan","Kabak","Biber","Domates"],"dogru":0,"arapca":"الباذِنْجان"},
  {"id":2107,"tip":"sebze","zorluk":2,"soru":"ما مَعْنى «الفُلْفُل»؟","secenekler":["Biber","Tuz","Baharat","Fasulye"],"dogru":0,"arapca":"الفُلْفُل"},
  {"id":2108,"tip":"sebze","zorluk":2,"soru":"ما مَعْنى «الفاصولْيا»؟","secenekler":["Fasulye","Nohut","Mercimek","Bezelye"],"dogru":0,"arapca":"الفاصولْيا"},
  {"id":2109,"tip":"sebze","zorluk":2,"soru":"ما تَرْجَمَة «Sebzeler» بِالعَرَبِيَّة؟","secenekler":["خَضْراوات","فَواكِه","طَماطِم","مَشْروبات"],"dogru":0,"arSecenek":true},
  {"id":2110,"tip":"sebze","zorluk":2,"soru":"ما مَعْنى «أَنا بِحاجَة إِلى خَضْراوات طازَجَة»؟","secenekler":["Taze sebzelere ihtiyacım var","Taze meyve istiyorum","Sebzeleri sevmem","Sebzeler çok pahalı"],"dogru":0,"arapca":"أَنا بِحاجَة إِلى خَضْراوات طازَجَة"},
  {"id":2111,"tip":"sebze","bicim":"eslestir","zorluk":2,"soru":"صِل الخَضْراوات.","ciftler":[["البَصَل","Soğan"],["الجَزَر","Havuç"],["الخِيار","Salatalık"],["الطَّماطِم","Domates"]]},
  {"id":2112,"tip":"sebze","bicim":"eslestir","zorluk":3,"soru":"صِل الخَضْراوات.","ciftler":[["البَطاطا","Patates"],["الباذِنْجان","Patlıcan"],["الفُلْفُل","Biber"],["الفاصولْيا","Fasulye"]]},
  {"id":2113,"tip":"sebze","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Bir kilo domates istiyorum.»","parcalar":["أُريدُ","كيلو","طَماطِم"]},
  {"id":2114,"tip":"sebze","bicim":"yazma","zorluk":3,"soru":"اُكْتُبْ «havuç» بِالحُروف.","cevapYazi":"جزر","tuslar":["ج","ز","ر","ب","ص","ل","خ","ي","ا","د"]}
];

const S_U2_MEYVE = [
  {"id":2201,"tip":"meyve","zorluk":1,"soru":"ما مَعْنى «التُّفّاح»؟","secenekler":["Elma","Portakal","Kiraz","Üzüm"],"dogru":0,"arapca":"التُّفّاح"},
  {"id":2202,"tip":"meyve","zorluk":1,"soru":"ما مَعْنى «البُرْتُقال»؟","secenekler":["Portakal","Mandalina","Elma","Muz"],"dogru":0,"arapca":"البُرْتُقال"},
  {"id":2203,"tip":"meyve","zorluk":1,"soru":"ما مَعْنى «المَوْز»؟","secenekler":["Muz","Elma","Kayısı","Kiraz"],"dogru":0,"arapca":"المَوْز"},
  {"id":2204,"tip":"meyve","zorluk":1,"soru":"ما مَعْنى «العِنَب»؟","secenekler":["Üzüm","Kiraz","İncir","Nar"],"dogru":0,"arapca":"العِنَب"},
  {"id":2205,"tip":"meyve","zorluk":1,"soru":"ما مَعْنى «الكَرَز»؟","secenekler":["Kiraz","Vişne","Üzüm","Çilek"],"dogru":0,"arapca":"الكَرَز"},
  {"id":2206,"tip":"meyve","zorluk":2,"soru":"ما مَعْنى «المِشْمِش»؟","secenekler":["Kayısı","Şeftali","Erik","Elma"],"dogru":0,"arapca":"المِشْمِش"},
  {"id":2207,"tip":"meyve","zorluk":2,"soru":"ما مَعْنى «الزَّيْتون»؟","secenekler":["Zeytin","Üzüm","Hurma","İncir"],"dogru":0,"arapca":"الزَّيْتون"},
  {"id":2208,"tip":"meyve","zorluk":2,"soru":"ما تَرْجَمَة «Meyveler» بِالعَرَبِيَّة؟","secenekler":["فَواكِه","خَضْراوات","مَشْروبات","أَطْعِمَة"],"dogru":0,"arSecenek":true},
  {"id":2209,"tip":"meyve","zorluk":2,"soru":"ما مَعْنى «عِنْدي فَواكِه أَيْضًا»؟","secenekler":["Bende meyveler de var","Meyve istemiyorum","Meyveler taze değil","Sebzelerim de var"],"dogru":0,"arapca":"عِنْدي فَواكِه أَيْضًا"},
  {"id":2210,"tip":"meyve","bicim":"eslestir","zorluk":2,"soru":"صِل الفَواكِه.","ciftler":[["التُّفّاح","Elma"],["المَوْز","Muz"],["العِنَب","Üzüm"],["الكَرَز","Kiraz"]]},
  {"id":2211,"tip":"meyve","bicim":"eslestir","zorluk":3,"soru":"صِل الفَواكِه.","ciftler":[["البُرْتُقال","Portakal"],["المِشْمِش","Kayısı"],["الزَّيْتون","Zeytin"],["الفَواكِه","Meyveler"]]},
  {"id":2212,"tip":"meyve","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Elma ve muz alıyorum.»","parcalar":["أَشْتَري","تُفّاحًا","وَمَوْزًا"]},
  {"id":2213,"tip":"meyve","bicim":"yazma","zorluk":3,"soru":"اُكْتُبْ «muz» بِالحُروف.","cevapYazi":"موز","tuslar":["م","و","ز","ت","ف","ح","ع","ن","ب","ك"]}
];

const S_U2_ADED = [
  {"id":2301,"tip":"aded","zorluk":1,"soru":"ما مَعْنى «خَمْسَة»؟","secenekler":["Beş","Üç","Dört","On"],"dogru":0,"arapca":"خَمْسَة"},
  {"id":2302,"tip":"aded","zorluk":1,"soru":"ما مَعْنى «ثَلاثَة»؟","secenekler":["Üç","İki","Beş","Sekiz"],"dogru":0,"arapca":"ثَلاثَة"},
  {"id":2303,"tip":"aded","zorluk":1,"soru":"ما مَعْنى «سَبْعَة»؟","secenekler":["Yedi","Altı","Dokuz","İki"],"dogru":0,"arapca":"سَبْعَة"},
  {"id":2304,"tip":"aded","zorluk":1,"soru":"ما مَعْنى «عَشَرَة»؟","secenekler":["On","Dokuz","Beş","Yirmi"],"dogru":0,"arapca":"عَشَرَة"},
  {"id":2305,"tip":"aded","zorluk":1,"soru":"ما مَعْنى «اِثْنان»؟","secenekler":["İki","Bir","Üç","Dört"],"dogru":0,"arapca":"اِثْنان"},
  {"id":2306,"tip":"aded","zorluk":1,"soru":"ما مَعْنى «ثَمانِيَة»؟","secenekler":["Sekiz","Yedi","Dokuz","Altı"],"dogru":0,"arapca":"ثَمانِيَة"},
  {"id":2307,"tip":"aded","zorluk":2,"soru":"ما مَعْنى «اِثْنا عَشَر»؟","secenekler":["On iki","On bir","Yirmi","İki"],"dogru":0,"arapca":"اِثْنا عَشَر"},
  {"id":2308,"tip":"aded","zorluk":2,"soru":"ما مَعْنى «خَمْسَة عَشَر»؟","secenekler":["On beş","On dört","Beş","Elli"],"dogru":0,"arapca":"خَمْسَة عَشَر"},
  {"id":2309,"tip":"aded","bicim":"eslestir","zorluk":2,"soru":"صِل الأَعْداد بِالأَرْقام.","ciftler":[["ثَلاثَة","3"],["خَمْسَة","5"],["سَبْعَة","7"],["تِسْعَة","9"]]},
  {"id":2310,"tip":"aded","bicim":"eslestir","zorluk":3,"soru":"صِل الأَعْداد بِالأَرْقام.","ciftler":[["أَحَد عَشَر","11"],["اِثْنا عَشَر","12"],["أَرْبَعَة عَشَر","14"],["خَمْسَة عَشَر","15"]]},
  {"id":2311,"tip":"aded","bicim":"surukle","zorluk":2,"soru":"رَتِّب الأَعْداد مِنْ 1 إِلى 4 (مِن اليَمين).","parcalar":["واحِد","اِثْنان","ثَلاثَة","أَرْبَعَة"]},
  {"id":2312,"tip":"aded","bicim":"surukle","zorluk":3,"soru":"رَتِّب الأَعْداد مِنْ 6 إِلى 9 (مِن اليَمين).","parcalar":["سِتَّة","سَبْعَة","ثَمانِيَة","تِسْعَة"]},
  {"id":2313,"tip":"aded","zorluk":2,"soru":"ما مَعْنى «البَيْضَة الواحِدَة بِليرَتَيْن»؟","secenekler":["Bir yumurta iki liradır","Yumurta bir liradır","İki yumurta bir liradır","Yumurtalar tazedir"],"dogru":0,"arapca":"البَيْضَة الواحِدَة بِليرَتَيْن"},
  {"id":2314,"tip":"aded","zorluk":2,"soru":"ما مَعْنى «بِكَم هذا»؟","secenekler":["Bu kaç para?","Bu ne?","Bu nerede?","Bu kimin?"],"dogru":0,"arapca":"بِكَم هذا؟"},
  {"id":2315,"tip":"aded","zorluk":3,"soru":"ما تَرْجَمَة «Kaç kilo?» بِالعَرَبِيَّة؟","secenekler":["كَم كيلو؟","كَم السّاعَة؟","ما هذا؟","بِكَم هذا؟"],"dogru":0,"arSecenek":true},
  {"id":2316,"tip":"aded","bicim":"yazma","zorluk":3,"soru":"اُكْتُبْ «beş» بِالحُروف.","cevapYazi":"خمسة","tuslar":["خ","م","س","ة","ع","ش","ر","ث","ل","ت"]}
];

const S_U2_MUKAYESE = [
  {"id":2401,"tip":"mukayese","zorluk":1,"soru":"ما مَعْنى «غالٍ»؟","secenekler":["Pahalı","Ucuz","Ağır","Hafif"],"dogru":0,"arapca":"غالٍ"},
  {"id":2402,"tip":"mukayese","zorluk":1,"soru":"ما مَعْنى «رَخيص»؟","secenekler":["Ucuz","Pahalı","Büyük","Küçük"],"dogru":0,"arapca":"رَخيص"},
  {"id":2403,"tip":"mukayese","zorluk":1,"soru":"ما مَعْنى «كَبير»؟","secenekler":["Büyük","Küçük","Ağır","Uzun"],"dogru":0,"arapca":"كَبير"},
  {"id":2404,"tip":"mukayese","zorluk":1,"soru":"ما مَعْنى «صَغير»؟","secenekler":["Küçük","Büyük","Hafif","Kısa"],"dogru":0,"arapca":"صَغير"},
  {"id":2405,"tip":"mukayese","zorluk":1,"soru":"ما مَعْنى «ثَقيل»؟","secenekler":["Ağır","Hafif","Büyük","Pahalı"],"dogru":0,"arapca":"ثَقيل"},
  {"id":2406,"tip":"mukayese","zorluk":1,"soru":"ما مَعْنى «خَفيف»؟","secenekler":["Hafif","Ağır","Küçük","Ucuz"],"dogru":0,"arapca":"خَفيف"},
  {"id":2407,"tip":"mukayese","zorluk":2,"soru":"ما مَعْنى «طازَج»؟","secenekler":["Taze","Bayat","Ucuz","Lezzetli"],"dogru":0,"arapca":"طازَج"},
  {"id":2408,"tip":"mukayese","zorluk":2,"soru":"ما مَعْنى «أَغْلى»؟","secenekler":["Daha pahalı","Daha ucuz","En büyük","Daha ağır"],"dogru":0,"arapca":"أَغْلى"},
  {"id":2409,"tip":"mukayese","zorluk":2,"soru":"ما مَعْنى «أَرْخَص»؟","secenekler":["Daha ucuz","Daha pahalı","Daha küçük","Daha hafif"],"dogru":0,"arapca":"أَرْخَص"},
  {"id":2410,"tip":"mukayese","zorluk":2,"soru":"ما مَعْنى «أَيُّهُما أَكْبَر؟»؟","secenekler":["Hangisi daha büyük?","Hangisi daha küçük?","Hangisi daha pahalı?","Hangisi daha ağır?"],"dogru":0,"arapca":"أَيُّهُما أَكْبَر؟"},
  {"id":2411,"tip":"mukayese","zorluk":2,"soru":"المَوْز بِـ 10 ليرات وَالتُّفّاح بِـ 7 ليرات. أَيُّهُما أَغْلى؟","secenekler":["المَوْز","التُّفّاح"],"dogru":0,"arSecenek":true},
  {"id":2412,"tip":"mukayese","zorluk":2,"soru":"الكَرَز بِـ 9 ليرات وَالتُّفّاح بِـ 7 ليرات. أَيُّهُما أَرْخَص؟","secenekler":["التُّفّاح","الكَرَز"],"dogru":0,"arSecenek":true},
  {"id":2413,"tip":"mukayese","zorluk":3,"soru":"الكَرَز بِـ 9 ليرات وَالتُّفّاح بِـ 7 ليرات. «الكَرَز أَغْلى مِن التُّفّاح» — صَحيح؟","secenekler":["نَعَمْ","لا"],"dogru":0,"arSecenek":true},
  {"id":2414,"tip":"mukayese","zorluk":3,"soru":"المِشْمِش بِـ 8 ليرات وَالمَوْز بِـ 12 ليرة. «المِشْمِش أَغْلى مِن المَوْز» — صَحيح؟","secenekler":["لا","نَعَمْ"],"dogru":0,"arSecenek":true},
  {"id":2415,"tip":"mukayese","bicim":"eslestir","zorluk":2,"soru":"صِل الأَضْداد.","ciftler":[["كَبير","صَغير"],["ثَقيل","خَفيف"],["غالٍ","رَخيص"]]},
  {"id":2416,"tip":"mukayese","bicim":"surukle","zorluk":3,"soru":"رَتِّب الكَلِمات: «Kiraz elmadan daha pahalıdır.»","parcalar":["الكَرَز","أَغْلى","مِن","التُّفّاح"]}
];


/* ---- 3. UNITE — إِلى أَيْن نُسافِر؟ ---- */

const S_U3_VASITA = [
  {"id":3001,"tip":"vasita","zorluk":1,"soru":"ما مَعْنى «الدَّرّاجَة»؟","secenekler":["Bisiklet","Araba","Otobüs","Tren"],"dogru":0,"arapca":"الدَّرّاجَة"},
  {"id":3002,"tip":"vasita","zorluk":1,"soru":"ما مَعْنى «السَّيّارَة»؟","secenekler":["Araba","Uçak","Gemi","Bisiklet"],"dogru":0,"arapca":"السَّيّارَة"},
  {"id":3003,"tip":"vasita","zorluk":1,"soru":"ما مَعْنى «الحافِلَة»؟","secenekler":["Otobüs","Tren","Metro","Gemi"],"dogru":0,"arapca":"الحافِلَة"},
  {"id":3004,"tip":"vasita","zorluk":1,"soru":"ما مَعْنى «القِطار»؟","secenekler":["Tren","Otobüs","Uçak","Araba"],"dogru":0,"arapca":"القِطار"},
  {"id":3005,"tip":"vasita","zorluk":1,"soru":"ما مَعْنى «الطّائِرَة»؟","secenekler":["Uçak","Gemi","Tren","Metro"],"dogru":0,"arapca":"الطّائِرَة"},
  {"id":3006,"tip":"vasita","zorluk":1,"soru":"ما مَعْنى «السَّفينَة»؟","secenekler":["Gemi","Uçak","Bisiklet","Otobüs"],"dogru":0,"arapca":"السَّفينَة"},
  {"id":3007,"tip":"vasita","zorluk":1,"soru":"ما مَعْنى «المِتْرو»؟","secenekler":["Metro","Durak","Yol","Tren"],"dogru":0,"arapca":"المِتْرو"},
  {"id":3008,"tip":"vasita","zorluk":1,"soru":"ما مَعْنى «المَوْقِف»؟","secenekler":["Durak","Yol","Pazar","Köprü"],"dogru":0,"arapca":"المَوْقِف"},
  {"id":3009,"tip":"vasita","zorluk":2,"soru":"ما تَرْجَمَة «Uçak» بِالعَرَبِيَّة؟","secenekler":["الطّائِرَة","السَّفينَة","الحافِلَة","القِطار"],"dogru":0,"arSecenek":true},
  {"id":3010,"tip":"vasita","zorluk":2,"soru":"ما تَرْجَمَة «Gemi» بِالعَرَبِيَّة؟","secenekler":["السَّفينَة","الطّائِرَة","الدَّرّاجَة","المِتْرو"],"dogru":0,"arSecenek":true},
  {"id":3011,"tip":"vasita","zorluk":2,"soru":"ما تَرْجَمَة «Otobüs durağı» بِالعَرَبِيَّة؟","secenekler":["مَوْقِف الحافِلَة","مَحَطَّة المِتْرو","طَريق الحافِلَة","بَيْت الحافِلَة"],"dogru":0,"arSecenek":true},
  {"id":3012,"tip":"vasita","zorluk":2,"soru":"أَيّ وَسيلَة تَسيرُ عَلى الماء؟","secenekler":["السَّفينَة","الطّائِرَة","القِطار","الدَّرّاجَة"],"dogru":0,"arSecenek":true},
  {"id":3013,"tip":"vasita","zorluk":2,"soru":"أَيّ وَسيلَة تَسيرُ تَحْت الأَرْض؟","secenekler":["المِتْرو","الحافِلَة","السَّفينَة","الطّائِرَة"],"dogru":0,"arSecenek":true},
  {"id":3014,"tip":"vasita","bicim":"eslestir","zorluk":2,"soru":"صِل وَسائِل النَّقْل بِمَعانيها.","ciftler":[["الدَّرّاجَة","bisiklet"],["السَّيّارَة","araba"],["الحافِلَة","otobüs"],["القِطار","tren"]]},
  {"id":3015,"tip":"vasita","bicim":"eslestir","zorluk":2,"soru":"صِل وَسائِل النَّقْل بِمَعانيها.","ciftler":[["الطّائِرَة","uçak"],["السَّفينَة","gemi"],["المِتْرو","metro"],["المَوْقِف","durak"]]},
  {"id":3016,"tip":"vasita","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Her sabah bisiklete binerim.»","parcalar":["أَنا","أَرْكَبُ","الدَّرّاجَة","كُلّ","صَباح"]},
  {"id":3017,"tip":"vasita","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Otobüse duraktan bin.»","parcalar":["اِرْكَبْ","الحافِلَة","مِن","المَوْقِف"]},
  {"id":3018,"tip":"vasita","bicim":"surukle","zorluk":3,"soru":"رَتِّب الكَلِمات: «Bisiklete binerim, sonra okula yönelirim.»","parcalar":["أَرْكَبُ","الدَّرّاجَة","ثُمَّ","أَتَّجِهُ","إِلى","المَدْرَسَة"]},
  {"id":3019,"tip":"vasita","bicim":"yazma","zorluk":3,"soru":"اُكْتُبْ «bisiklet» بِالحُروف.","cevapYazi":"دراجة","tuslar":["د","ر","ا","ج","ة","ز","ح","ت","ن","م"]},
  {"id":3020,"tip":"vasita","bicim":"yazma","zorluk":3,"soru":"اُكْتُبْ «uçak» بِالحُروف.","cevapYazi":"طائرة","tuslar":["ط","ا","ئ","ر","ة","ت","ظ","ن","س","ب"]}
];

const S_U3_MEKAN = [
  {"id":3101,"tip":"mekan","zorluk":1,"soru":"ما مَعْنى «المُسْتَشْفى»؟","secenekler":["Hastane","Okul","Kütüphane","Cami"],"dogru":0,"arapca":"المُسْتَشْفى"},
  {"id":3102,"tip":"mekan","zorluk":1,"soru":"ما مَعْنى «المَكْتَبَة»؟","secenekler":["Kütüphane","Pazar","Durak","Deniz"],"dogru":0,"arapca":"المَكْتَبَة"},
  {"id":3103,"tip":"mekan","zorluk":1,"soru":"ما مَعْنى «المَدْرَسَة»؟","secenekler":["Okul","Ev","Cami","Hastane"],"dogru":0,"arapca":"المَدْرَسَة"},
  {"id":3104,"tip":"mekan","zorluk":1,"soru":"ما مَعْنى «المَسْجِد»؟","secenekler":["Cami","Müze","Kale","Pazar"],"dogru":0,"arapca":"المَسْجِد"},
  {"id":3105,"tip":"mekan","zorluk":1,"soru":"ما مَعْنى «السّوق»؟","secenekler":["Çarşı","Yol","Durak","Bahçe"],"dogru":0,"arapca":"السّوق"},
  {"id":3106,"tip":"mekan","zorluk":1,"soru":"ما مَعْنى «الطَّريق»؟","secenekler":["Yol","Deniz","Dağ","Durak"],"dogru":0,"arapca":"الطَّريق"},
  {"id":3107,"tip":"mekan","zorluk":1,"soru":"ما مَعْنى «الحَديقَة»؟","secenekler":["Bahçe","Kütüphane","Çarşı","Okul"],"dogru":0,"arapca":"الحَديقَة"},
  {"id":3108,"tip":"mekan","zorluk":2,"soru":"ما تَرْجَمَة «Hastane» بِالعَرَبِيَّة؟","secenekler":["المُسْتَشْفى","المَكْتَبَة","المَدْرَسَة","المَوْقِف"],"dogru":0,"arSecenek":true},
  {"id":3109,"tip":"mekan","zorluk":2,"soru":"ما تَرْجَمَة «Kütüphane» بِالعَرَبِيَّة؟","secenekler":["المَكْتَبَة","المَسْجِد","السّوق","الحَديقَة"],"dogru":0,"arSecenek":true},
  {"id":3110,"tip":"mekan","zorluk":2,"soru":"أَيْن يَذْهَبُ المَريض؟","secenekler":["إِلى المُسْتَشْفى","إِلى المَكْتَبَة","إِلى السّوق","إِلى المَوْقِف"],"dogru":0,"arSecenek":true},
  {"id":3111,"tip":"mekan","zorluk":2,"soru":"أَيْن نَقْرَأُ الكُتُب؟","secenekler":["في المَكْتَبَة","في السّوق","في المَوْقِف","في الحَديقَة"],"dogru":0,"arSecenek":true},
  {"id":3112,"tip":"mekan","bicim":"eslestir","zorluk":2,"soru":"صِل الأَماكِن بِمَعانيها.","ciftler":[["المُسْتَشْفى","hastane"],["المَكْتَبَة","kütüphane"],["المَدْرَسَة","okul"],["المَسْجِد","cami"]]},
  {"id":3113,"tip":"mekan","bicim":"eslestir","zorluk":2,"soru":"صِل الأَماكِن بِمَعانيها.","ciftler":[["السّوق","çarşı"],["الطَّريق","yol"],["الحَديقَة","bahçe"],["المَوْقِف","durak"]]},
  {"id":3114,"tip":"mekan","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Kütüphaneye yürüyerek giderim.»","parcalar":["أَذْهَبُ","إِلى","المَكْتَبَة","مَشْيًا"]},
  {"id":3115,"tip":"mekan","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Hastanenin önünde in.»","parcalar":["اِنْزِلْ","أَمام","المُسْتَشْفى"]},
  {"id":3116,"tip":"mekan","bicim":"surukle","zorluk":3,"soru":"رَتِّب الكَلِمات: «Annem doktordur, arabayla hastaneye gider.»","parcalar":["أُمّي","طَبيبَة","هِي","تَذْهَبُ","إِلى","المُسْتَشْفى","بِالسَّيّارَة"]},
  {"id":3117,"tip":"mekan","bicim":"yazma","zorluk":3,"soru":"اُكْتُبْ «okul» بِالحُروف.","cevapYazi":"مدرسة","tuslar":["م","د","ر","س","ة","ن","ت","ب","ل","ح"]},
  {"id":3118,"tip":"mekan","bicim":"yazma","zorluk":3,"soru":"اُكْتُبْ «çarşı» بِالحُروف.","cevapYazi":"سوق","tuslar":["س","و","ق","ش","ن","م","ب","ت","ر","ل"]}
];

const S_U3_YON = [
  {"id":3201,"tip":"yon","zorluk":1,"soru":"ما مَعْنى «اليَمين»؟","secenekler":["Sağ","Sol","Ön","Arka"],"dogru":0,"arapca":"اليَمين"},
  {"id":3202,"tip":"yon","zorluk":1,"soru":"ما مَعْنى «اليَسار»؟","secenekler":["Sol","Sağ","Ön","Yukarı"],"dogru":0,"arapca":"اليَسار"},
  {"id":3203,"tip":"yon","zorluk":1,"soru":"ما مَعْنى «الأَمام»؟","secenekler":["Ön","Arka","Sağ","Sol"],"dogru":0,"arapca":"الأَمام"},
  {"id":3204,"tip":"yon","zorluk":1,"soru":"ما مَعْنى «إِشارات المُرور»؟","secenekler":["Trafik işaretleri","Yol tabelası","Otobüs durağı","Yaya geçidi"],"dogru":0,"arapca":"إِشارات المُرور"},
  {"id":3205,"tip":"yon","zorluk":1,"soru":"ما مَعْنى «اِمْشِ»؟","secenekler":["Yürü","Dur","Geç","Bin"],"dogru":0,"arapca":"اِمْشِ"},
  {"id":3206,"tip":"yon","zorluk":1,"soru":"ما مَعْنى «قِفْ»؟","secenekler":["Dur","Yürü","İn","Bin"],"dogru":0,"arapca":"قِفْ"},
  {"id":3207,"tip":"yon","zorluk":2,"soru":"ما مَعْنى «اُعْبُر الطَّريق»؟","secenekler":["Yolu geç","Yolda yürü","Yolda dur","Yola bak"],"dogru":0,"arapca":"اُعْبُر الطَّريق"},
  {"id":3208,"tip":"yon","zorluk":2,"soru":"ماذا نَفْعَلُ عِنْد الضَّوْء الأَحْمَر؟","secenekler":["نَقِفُ","نَعْبُرُ","نَمْشي","نَرْكَبُ"],"dogru":0,"arSecenek":true},
  {"id":3209,"tip":"yon","zorluk":2,"soru":"ماذا نَفْعَلُ عِنْد الضَّوْء الأَخْضَر؟","secenekler":["نَعْبُرُ","نَقِفُ","نَنْزِلُ","نَنامُ"],"dogru":0,"arSecenek":true},
  {"id":3210,"tip":"yon","zorluk":2,"soru":"ما تَرْجَمَة «Sağa yönel» بِالعَرَبِيَّة؟","secenekler":["اِتَّجِهْ إِلى اليَمين","اِتَّجِهْ إِلى اليَسار","اِمْشِ إِلى الأَمام","قِفْ عَلى اليَمين"],"dogru":0,"arSecenek":true},
  {"id":3211,"tip":"yon","zorluk":2,"soru":"«المَدْرَسَة عَلى اليَمين.» ما مَعْناها؟","secenekler":["Okul sağdadır","Okul soldadır","Okul öndedir","Okul uzaktır"],"dogru":0,"arapca":"المَدْرَسَة عَلى اليَمين."},
  {"id":3212,"tip":"yon","bicim":"eslestir","zorluk":2,"soru":"صِل الاِتِّجاهات بِمَعانيها.","ciftler":[["اليَمين","sağ"],["اليَسار","sol"],["الأَمام","ön"],["الطَّريق","yol"]]},
  {"id":3213,"tip":"yon","bicim":"eslestir","zorluk":2,"soru":"صِل الأَوامِر بِمَعانيها.","ciftler":[["اِمْشِ","yürü"],["قِفْ","dur"],["اُعْبُرْ","geç"],["اِنْزِلْ","in"]]},
  {"id":3214,"tip":"yon","bicim":"eslestir","zorluk":3,"soru":"صِل أَلْوان إِشارات المُرور.","ciftler":[["الأَحْمَر","kırmızı"],["الأَصْفَر","sarı"],["الأَخْضَر","yeşil"],["المَوْقِف","durak"]]},
  {"id":3215,"tip":"yon","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Kırmızı ışıkta dur.»","parcalar":["قِفْ","عِنْد","الضَّوْء","الأَحْمَر"]},
  {"id":3216,"tip":"yon","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Çarşı soldadır.»","parcalar":["السّوق","عَلى","اليَسار"]},
  {"id":3217,"tip":"yon","bicim":"surukle","zorluk":3,"soru":"رَتِّب الكَلِمات: «Yolu geç, sonra biraz ileri yürü.»","parcalar":["اُعْبُر","الطَّريق","ثُمَّ","امْشِ","إِلى","الأَمام","قَليلًا"]},
  {"id":3218,"tip":"yon","bicim":"yazma","zorluk":3,"soru":"اُكْتُبْ «yol» بِالحُروف.","cevapYazi":"طريق","tuslar":["ط","ر","ي","ق","ظ","ن","س","ب","ت","م"]}
];

const S_U3_MUKAYESE = [
  {"id":3301,"tip":"mukayese","zorluk":1,"soru":"ما مَعْنى «سَريعَة»؟","secenekler":["Hızlı","Yavaş","Eski","Yeni"],"dogru":0,"arapca":"سَريعَة"},
  {"id":3302,"tip":"mukayese","zorluk":1,"soru":"ما مَعْنى «بَطيئَة»؟","secenekler":["Yavaş","Hızlı","Yeni","Büyük"],"dogru":0,"arapca":"بَطيئَة"},
  {"id":3303,"tip":"mukayese","zorluk":1,"soru":"ما مَعْنى «قَديمَة»؟","secenekler":["Eski","Yeni","Hızlı","Küçük"],"dogru":0,"arapca":"قَديمَة"},
  {"id":3304,"tip":"mukayese","zorluk":1,"soru":"ما مَعْنى «حَديثَة»؟","secenekler":["Modern","Eski","Yavaş","Uzak"],"dogru":0,"arapca":"حَديثَة"},
  {"id":3305,"tip":"mukayese","zorluk":2,"soru":"ما مَعْنى «أَسْرَع»؟","secenekler":["Daha hızlı","Daha yavaş","Daha eski","Daha yeni"],"dogru":0,"arapca":"أَسْرَع"},
  {"id":3306,"tip":"mukayese","zorluk":2,"soru":"ما مَعْنى «أَبْطَأ»؟","secenekler":["Daha yavaş","Daha hızlı","Daha uzak","Daha yakın"],"dogru":0,"arapca":"أَبْطَأ"},
  {"id":3307,"tip":"mukayese","zorluk":2,"soru":"ما مَعْنى «أَقْدَم»؟","secenekler":["Daha eski","Daha yeni","Daha büyük","Daha hızlı"],"dogru":0,"arapca":"أَقْدَم"},
  {"id":3308,"tip":"mukayese","zorluk":2,"soru":"ما مَعْنى «أَحْدَث»؟","secenekler":["Daha modern","Daha eski","Daha yavaş","Daha küçük"],"dogru":0,"arapca":"أَحْدَث"},
  {"id":3309,"tip":"mukayese","zorluk":2,"soru":"أَكْمِلْ: «الطّائِرَة … مِن السَّفينَة.»","secenekler":["أَسْرَع","أَبْطَأ","أَقْدَم","أَصْغَر"],"dogru":0,"arSecenek":true},
  {"id":3310,"tip":"mukayese","zorluk":2,"soru":"أَكْمِلْ: «الدَّرّاجَة … مِن القِطار.»","secenekler":["أَبْطَأ","أَسْرَع","أَحْدَث","أَكْبَر"],"dogru":0,"arSecenek":true},
  {"id":3311,"tip":"mukayese","zorluk":3,"soru":"أَكْمِلْ: «المِتْرو … مِن السَّيّارَة.»","secenekler":["أَحْدَث","أَقْدَم","أَبْطَأ","أَصْغَر"],"dogru":0,"arSecenek":true},
  {"id":3312,"tip":"mukayese","zorluk":3,"soru":"أَيّ جُمْلَة صَحيحَة؟","secenekler":["الطّائِرَة أَسْرَع مِن الحافِلَة","الحافِلَة أَسْرَع مِن الطّائِرَة","الدَّرّاجَة أَسْرَع مِن القِطار","السَّفينَة أَسْرَع مِن الطّائِرَة"],"dogru":0,"arSecenek":true},
  {"id":3313,"tip":"mukayese","bicim":"eslestir","zorluk":2,"soru":"صِل الصِّفات بِمَعانيها.","ciftler":[["سَريعَة","hızlı"],["بَطيئَة","yavaş"],["قَديمَة","eski"],["حَديثَة","modern"]]},
  {"id":3314,"tip":"mukayese","bicim":"eslestir","zorluk":3,"soru":"صِل صِيَغ التَّفْضيل بِمَعانيها.","ciftler":[["أَسْرَع","daha hızlı"],["أَبْطَأ","daha yavaş"],["أَقْدَم","daha eski"],["أَحْدَث","daha modern"]]},
  {"id":3315,"tip":"mukayese","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Uçak gemiden daha hızlıdır.»","parcalar":["الطّائِرَة","أَسْرَع","مِن","السَّفينَة"]},
  {"id":3316,"tip":"mukayese","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Tren otobüsten daha eskidir.»","parcalar":["القِطار","أَقْدَم","مِن","الحافِلَة"]},
  {"id":3317,"tip":"mukayese","bicim":"surukle","zorluk":3,"soru":"رَتِّب الكَلِمات: «Metro arabadan daha moderndir.»","parcalar":["المِتْرو","أَحْدَث","مِن","السَّيّارَة"]},
  {"id":3318,"tip":"mukayese","bicim":"yazma","zorluk":3,"soru":"اُكْتُبْ «hızlı» بِالحُروف.","cevapYazi":"سريع","tuslar":["س","ر","ي","ع","ص","ن","ب","ت","ل","م"]}
];

const S_U3_SEFER = [
  {"id":3401,"tip":"sefer","zorluk":1,"soru":"ما مَعْنى «أُسافِرُ»؟","secenekler":["Seyahat ederim","Dönerim","Varırım","İnerim"],"dogru":0,"arapca":"أُسافِرُ"},
  {"id":3402,"tip":"sefer","zorluk":1,"soru":"ما مَعْنى «أَرْجِعُ»؟","secenekler":["Dönerim","Giderim","Binerim","Yürürüm"],"dogru":0,"arapca":"أَرْجِعُ"},
  {"id":3403,"tip":"sefer","zorluk":1,"soru":"ما مَعْنى «أَصِلُ»؟","secenekler":["Varırım","Çıkarım","İnerim","Dururum"],"dogru":0,"arapca":"أَصِلُ"},
  {"id":3404,"tip":"sefer","zorluk":1,"soru":"ما مَعْنى «أَتَّجِهُ»؟","secenekler":["Yönelirim","Dönerim","Binerim","Geçerim"],"dogru":0,"arapca":"أَتَّجِهُ"},
  {"id":3405,"tip":"sefer","zorluk":1,"soru":"ما مَعْنى «أَرْكَبُ»؟","secenekler":["Binerim","İnerim","Yürürüm","Beklerim"],"dogru":0,"arapca":"أَرْكَبُ"},
  {"id":3406,"tip":"sefer","zorluk":2,"soru":"ما مَعْنى «مَشْيًا»؟","secenekler":["Yürüyerek","Uçakla","Denizden","Karadan"],"dogru":0,"arapca":"مَشْيًا"},
  {"id":3407,"tip":"sefer","zorluk":2,"soru":"ما مَعْنى «بَحْرًا»؟","secenekler":["Deniz yoluyla","Kara yoluyla","Hava yoluyla","Yürüyerek"],"dogru":0,"arapca":"بَحْرًا"},
  {"id":3408,"tip":"sefer","zorluk":2,"soru":"ما مَعْنى «بَرًّا»؟","secenekler":["Kara yoluyla","Deniz yoluyla","Hava yoluyla","Metroyla"],"dogru":0,"arapca":"بَرًّا"},
  {"id":3409,"tip":"sefer","zorluk":2,"soru":"ما مَعْنى «جَوًّا»؟","secenekler":["Hava yoluyla","Deniz yoluyla","Kara yoluyla","Yürüyerek"],"dogru":0,"arapca":"جَوًّا"},
  {"id":3410,"tip":"sefer","zorluk":2,"soru":"«كَيْف تَذْهَبُ إِلى المَدْرَسَة؟» أَيّ جَواب مُناسِب؟","secenekler":["أَذْهَبُ إِلى المَدْرَسَة مَشْيًا","أَذْهَبُ إِلى المَدْرَسَة غَدًا","المَدْرَسَة كَبيرَة","أُحِبُّ المَدْرَسَة"],"dogru":0,"arSecenek":true},
  {"id":3411,"tip":"sefer","zorluk":2,"soru":"«إِلى أَيْن تُسافِرينَ؟» أَيّ جَواب مُناسِب؟","secenekler":["أُسافِرُ إِلى أَنْقَرَة","أُسافِرُ بِالطّائِرَة","أَرْجِعُ مِن المَكْتَبَة","أَنا بِخَيْر"],"dogru":0,"arSecenek":true},
  {"id":3412,"tip":"sefer","zorluk":3,"soru":"«بِماذا تَرْجِعينَ إِلى البَيْت؟» أَيّ جَواب مُناسِب؟","secenekler":["أَرْجِعُ إِلى البَيْت بِالحافِلَة","أَرْجِعُ إِلى البَيْت مَساءً","البَيْت قَريب","أَذْهَبُ إِلى السّوق"],"dogru":0,"arSecenek":true},
  {"id":3413,"tip":"sefer","bicim":"eslestir","zorluk":2,"soru":"صِل الأَفْعال بِمَعانيها.","ciftler":[["أُسافِرُ","seyahat ederim"],["أَرْجِعُ","dönerim"],["أَصِلُ","varırım"],["أَرْكَبُ","binerim"]]},
  {"id":3414,"tip":"sefer","bicim":"eslestir","zorluk":3,"soru":"صِل طُرُق السَّفَر بِمَعانيها.","ciftler":[["مَشْيًا","yürüyerek"],["بَحْرًا","deniz yoluyla"],["بَرًّا","kara yoluyla"],["جَوًّا","hava yoluyla"]]},
  {"id":3415,"tip":"sefer","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Adım Ömer, İstanbul'da otururum.»","parcalar":["اِسْمي","عُمَر","أَنا","أَسْكُنُ","في","إِسْطَنْبول"]},
  {"id":3416,"tip":"sefer","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Kardeşim İzmir'e deniz yoluyla seyahat eder.»","parcalar":["أَخي","يُسافِرُ","إِلى","إِزْمير","بَحْرًا"]},
  {"id":3417,"tip":"sefer","bicim":"surukle","zorluk":3,"soru":"رَتِّب الكَلِمات: «Babam tüccardır, Ankara'ya uçakla seyahat eder.»","parcalar":["أَبي","تاجِر","هُو","يُسافِرُ","إِلى","أَنْقَرَة","بِالطّائِرَة"]},
  {"id":3418,"tip":"sefer","bicim":"yazma","zorluk":3,"soru":"اُكْتُبْ «tatil» بِالحُروف.","cevapYazi":"عطلة","tuslar":["ع","ط","ل","ة","غ","ظ","ن","ت","م","ب"]}
];


/* ---- 4. UNITE — مَدينَتي وَبَلَدي ---- */

const S_U4_SEHIR = [
  {"id":4001,"tip":"sehir","zorluk":1,"soru":"ما مَعْنى «مَدينَة»؟","secenekler":["Şehir","Ülke","Mahalle","Sokak"],"dogru":0,"arapca":"مَدينَة"},
  {"id":4002,"tip":"sehir","zorluk":1,"soru":"ما مَعْنى «بَلَد»؟","secenekler":["Ülke","Şehir","Köy","Cadde"],"dogru":0,"arapca":"بَلَد"},
  {"id":4003,"tip":"sehir","zorluk":1,"soru":"ما مَعْنى «عاصِمَة»؟","secenekler":["Başkent","Şehir","Kale","Müze"],"dogru":0,"arapca":"عاصِمَة"},
  {"id":4004,"tip":"sehir","zorluk":1,"soru":"ما مَعْنى «حَيّ»؟","secenekler":["Mahalle","Şehir","Ülke","Pazar"],"dogru":0,"arapca":"حَيّ"},
  {"id":4005,"tip":"sehir","zorluk":1,"soru":"ما مَعْنى «مُتْحَف»؟","secenekler":["Müze","Kale","Cami","Çarşı"],"dogru":0,"arapca":"مُتْحَف"},
  {"id":4006,"tip":"sehir","zorluk":1,"soru":"ما مَعْنى «قَلْعَة»؟","secenekler":["Kale","Müze","Köprü","Bahçe"],"dogru":0,"arapca":"قَلْعَة"},
  {"id":4007,"tip":"sehir","zorluk":2,"soru":"ما عاصِمَة تُرْكِيا؟","secenekler":["أَنْقَرَة","إِسْطَنْبول","إِزْمير","بورْصَة"],"dogru":0,"arSecenek":true},
  {"id":4008,"tip":"sehir","zorluk":2,"soru":"أَيّ مَدينَة هِيَ «إِسْطَنْبول»؟","secenekler":["İstanbul","İzmir","Ankara","Bursa"],"dogru":0,"arapca":"إِسْطَنْبول"},
  {"id":4009,"tip":"sehir","zorluk":2,"soru":"أَيّ مَدينَة هِيَ «قَيْصَري»؟","secenekler":["Kayseri","Konya","Mersin","Sivas"],"dogru":0,"arapca":"قَيْصَري"},
  {"id":4010,"tip":"sehir","zorluk":2,"soru":"أَيّ مَدينَة هِيَ «طِرابْزون»؟","secenekler":["Trabzon","Samsun","Erzurum","Van"],"dogru":0,"arapca":"طِرابْزون"},
  {"id":4011,"tip":"sehir","zorluk":2,"soru":"أَيّ مَدينَة هِيَ «مارْدين»؟","secenekler":["Mardin","Batman","Diyarbakır","Antalya"],"dogru":0,"arapca":"مارْدين"},
  {"id":4012,"tip":"sehir","zorluk":3,"soru":"أَيّ مَدينَة هِيَ «أَرْضُروم»؟","secenekler":["Erzurum","Afyon","Sinop","Konya"],"dogru":0,"arapca":"أَرْضُروم"},
  {"id":4013,"tip":"sehir","bicim":"eslestir","zorluk":2,"soru":"صِل المُدُن بِأَسْمائِها.","ciftler":[["إِسْطَنْبول","İstanbul"],["أَنْقَرَة","Ankara"],["إِزْمير","İzmir"],["بورْصَة","Bursa"]]},
  {"id":4014,"tip":"sehir","bicim":"eslestir","zorluk":2,"soru":"صِل المُدُن بِأَسْمائِها.","ciftler":[["قونْيا","Konya"],["قَيْصَري","Kayseri"],["مَرْسين","Mersin"],["أَنْطالْيا","Antalya"]]},
  {"id":4015,"tip":"sehir","bicim":"eslestir","zorluk":3,"soru":"صِل المُدُن بِأَسْمائِها.","ciftler":[["طِرابْزون","Trabzon"],["أَرْضُروم","Erzurum"],["مارْدين","Mardin"],["سينوب","Sinop"]]},
  {"id":4016,"tip":"sehir","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Türkiye büyük ve güzel bir ülkedir.»","parcalar":["تُرْكِيا","بَلَد","كَبير","وَجَميل"]},
  {"id":4017,"tip":"sehir","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Ankara Türkiye'nin başkentidir.»","parcalar":["أَنْقَرَة","عاصِمَة","تُرْكِيا"]},
  {"id":4018,"tip":"sehir","bicim":"surukle","zorluk":3,"soru":"رَتِّب الكَلِمات: «Murat'ın mahallesi Mevlânâ Müzesi'ne uzaktır.»","parcalar":["حَيّ","مُراد","بَعيد","عَنْ","مُتْحَف","مَوْلانا"]},
  {"id":4019,"tip":"sehir","bicim":"yazma","zorluk":3,"soru":"اُكْتُبْ «şehir» بِالحُروف.","cevapYazi":"مدينة","tuslar":["م","د","ي","ن","ة","ت","ب","ل","ر","س"]},
  {"id":4020,"tip":"sehir","bicim":"yazma","zorluk":3,"soru":"اُكْتُبْ «müze» بِالحُروف.","cevapYazi":"متحف","tuslar":["م","ت","ح","ف","ن","ج","خ","ب","ق","ر"]}
];

const S_U4_KONUM = [
  {"id":4101,"tip":"konum","zorluk":1,"soru":"ما مَعْنى «شَمال»؟","secenekler":["Kuzey","Güney","Doğu","Batı"],"dogru":0,"arapca":"شَمال"},
  {"id":4102,"tip":"konum","zorluk":1,"soru":"ما مَعْنى «جَنوب»؟","secenekler":["Güney","Kuzey","Batı","Orta"],"dogru":0,"arapca":"جَنوب"},
  {"id":4103,"tip":"konum","zorluk":1,"soru":"ما مَعْنى «شَرْق»؟","secenekler":["Doğu","Batı","Kuzey","Güney"],"dogru":0,"arapca":"شَرْق"},
  {"id":4104,"tip":"konum","zorluk":1,"soru":"ما مَعْنى «غَرْب»؟","secenekler":["Batı","Doğu","Güney","Orta"],"dogru":0,"arapca":"غَرْب"},
  {"id":4105,"tip":"konum","zorluk":1,"soru":"ما مَعْنى «وَسَط»؟","secenekler":["Orta","Kuzey","Doğu","Batı"],"dogru":0,"arapca":"وَسَط"},
  {"id":4106,"tip":"konum","zorluk":1,"soru":"ما مَعْنى «تَقَعُ»؟","secenekler":["Bulunur","Meşhurdur","Gider","Oturur"],"dogru":0,"arapca":"تَقَعُ"},
  {"id":4107,"tip":"konum","zorluk":2,"soru":"أَيْن تَقَعُ إِزْمير؟","secenekler":["في غَرْب تُرْكِيا","في شَرْق تُرْكِيا","في شَمال تُرْكِيا","في وَسَط تُرْكِيا"],"dogru":0,"arSecenek":true},
  {"id":4108,"tip":"konum","zorluk":2,"soru":"أَيْن تَقَعُ أَنْطالْيا؟","secenekler":["في جَنوب تُرْكِيا","في شَمال تُرْكِيا","في شَرْق تُرْكِيا","في غَرْب تُرْكِيا"],"dogru":0,"arSecenek":true},
  {"id":4109,"tip":"konum","zorluk":2,"soru":"أَيْن تَقَعُ سامْسون؟","secenekler":["في شَمال تُرْكِيا","في جَنوب تُرْكِيا","في غَرْب تُرْكِيا","في وَسَط تُرْكِيا"],"dogru":0,"arSecenek":true},
  {"id":4110,"tip":"konum","zorluk":2,"soru":"أَيْن تَقَعُ وان؟","secenekler":["في شَرْق تُرْكِيا","في غَرْب تُرْكِيا","في شَمال تُرْكِيا","في جَنوب تُرْكِيا"],"dogru":0,"arSecenek":true},
  {"id":4111,"tip":"konum","zorluk":2,"soru":"أَيْن تَقَعُ قونْيا؟","secenekler":["في وَسَط تُرْكِيا","في شَمال تُرْكِيا","في غَرْب تُرْكِيا","في شَرْق تُرْكِيا"],"dogru":0,"arSecenek":true},
  {"id":4112,"tip":"konum","zorluk":3,"soru":"أَيْن تَقَعُ مَرْسين؟","secenekler":["في جَنوب تُرْكِيا","في شَمال تُرْكِيا","في شَرْق تُرْكِيا","في وَسَط تُرْكِيا"],"dogru":0,"arSecenek":true},
  {"id":4113,"tip":"konum","zorluk":3,"soru":"أَيْن تَقَعُ سينوب؟","secenekler":["في شَمال تُرْكِيا","في جَنوب تُرْكِيا","في وَسَط تُرْكِيا","في شَرْق تُرْكِيا"],"dogru":0,"arSecenek":true},
  {"id":4114,"tip":"konum","bicim":"eslestir","zorluk":2,"soru":"صِل الاِتِّجاهات بِمَعانيها.","ciftler":[["شَمال","kuzey"],["جَنوب","güney"],["شَرْق","doğu"],["غَرْب","batı"]]},
  {"id":4115,"tip":"konum","bicim":"eslestir","zorluk":3,"soru":"صِل كُلّ مَدينَة بِمَوْقِعِها.","ciftler":[["إِزْمير","batı"],["أَنْطالْيا","güney"],["سامْسون","kuzey"],["وان","doğu"]]},
  {"id":4116,"tip":"konum","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Sinop Türkiye'nin kuzeyinde bulunur.»","parcalar":["تَقَعُ","سينوب","في","شَمال","تُرْكِيا"]},
  {"id":4117,"tip":"konum","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Konya Türkiye'nin ortasında bulunur.»","parcalar":["تَقَعُ","قونْيا","في","وَسَط","تُرْكِيا"]},
  {"id":4118,"tip":"konum","bicim":"surukle","zorluk":3,"soru":"رَتِّب الكَلِمات: «Şehrim Türkiye'nin batısında bulunur.»","parcalar":["تَقَعُ","مَدينَتي","في","غَرْب","تُرْكِيا"]},
  {"id":4119,"tip":"konum","bicim":"yazma","zorluk":3,"soru":"اُكْتُبْ «kuzey» بِالحُروف.","cevapYazi":"شمال","tuslar":["ش","م","ا","ل","س","ن","ب","ت","ر","ج"]}
];

const S_U4_MESHUR = [
  {"id":4201,"tip":"meshur","zorluk":1,"soru":"ما مَعْنى «تَشْتَهِرُ»؟","secenekler":["Meşhurdur","Bulunur","Oturur","Gider"],"dogru":0,"arapca":"تَشْتَهِرُ"},
  {"id":4202,"tip":"meshur","zorluk":1,"soru":"ما مَعْنى «مَشْهورَة»؟","secenekler":["Meşhur","Kalabalık","Tarihî","Küçük"],"dogru":0,"arapca":"مَشْهورَة"},
  {"id":4203,"tip":"meshur","zorluk":1,"soru":"ما مَعْنى «الأَماكِن التّاريخِيَّة»؟","secenekler":["Tarihî yerler","Turistik yerler","Büyük çarşılar","Eski evler"],"dogru":0,"arapca":"الأَماكِن التّاريخِيَّة"},
  {"id":4204,"tip":"meshur","zorluk":1,"soru":"ما مَعْنى «الأَطْعِمَة اللَّذيذَة»؟","secenekler":["Lezzetli yemekler","Tarihî yerler","Büyük şehirler","Güzel bahçeler"],"dogru":0,"arapca":"الأَطْعِمَة اللَّذيذَة"},
  {"id":4205,"tip":"meshur","zorluk":2,"soru":"بِماذا تَشْتَهِرُ بورْصَة؟","secenekler":["بِكَباب إِسْكَنْدَر","بِالمانْتي","بِالقِشْطَة","بِالتَّنْتوني"],"dogru":0,"arSecenek":true},
  {"id":4206,"tip":"meshur","zorluk":2,"soru":"بِماذا تَشْتَهِرُ قَيْصَري؟","secenekler":["بِالمانْتي","بِكَباب جاغ","بِالقِشْطَة","بِكَباب إِسْكَنْدَر"],"dogru":0,"arSecenek":true},
  {"id":4207,"tip":"meshur","zorluk":2,"soru":"بِماذا تَشْتَهِرُ أَرْضُروم؟","secenekler":["بِكَباب جاغ","بِالمانْتي","بِالتَّنْتوني","بِالقِشْطَة"],"dogru":0,"arSecenek":true},
  {"id":4208,"tip":"meshur","zorluk":2,"soru":"بِماذا تَشْتَهِرُ أَفْيون؟","secenekler":["بِالقِشْطَة","بِالمانْتي","بِكَباب جاغ","بِالتَّنْتوني"],"dogru":0,"arSecenek":true},
  {"id":4209,"tip":"meshur","zorluk":2,"soru":"بِماذا تَشْتَهِرُ مَرْسين؟","secenekler":["بِالتَّنْتوني","بِالقِشْطَة","بِالمانْتي","بِكَباب إِسْكَنْدَر"],"dogru":0,"arSecenek":true},
  {"id":4210,"tip":"meshur","zorluk":3,"soru":"بِماذا تَشْتَهِرُ باطْمان؟","secenekler":["بِـحَسَنْكَيْف","بِقَلْعَتِها","بِأَسْوارِها","بِجامِع أولو"],"dogru":0,"arSecenek":true},
  {"id":4211,"tip":"meshur","zorluk":3,"soru":"أَيْن يَقَعُ مَسْجِد آياصوفْيا الكَبير؟","secenekler":["في إِسْطَنْبول","في بورْصَة","في أَنْقَرَة","في قونْيا"],"dogru":0,"arSecenek":true},
  {"id":4212,"tip":"meshur","zorluk":3,"soru":"بِماذا تَشْتَهِرُ دِيارْ بَكْر؟","secenekler":["بِأَسْوارِها التّاريخِيَّة","بِبَحْرِها","بِمُتْحَف مَوْلانا","بِكَباب جاغ"],"dogru":0,"arSecenek":true},
  {"id":4213,"tip":"meshur","bicim":"eslestir","zorluk":2,"soru":"صِل كُلّ مَدينَة بِما تَشْتَهِرُ بِهِ.","ciftler":[["بورْصَة","İskender kebap"],["قَيْصَري","mantı"],["أَرْضُروم","cağ kebabı"],["أَفْيون","kaymak"]]},
  {"id":4214,"tip":"meshur","bicim":"eslestir","zorluk":3,"soru":"صِل كُلّ مَدينَة بِمَعْلَمِها.","ciftler":[["إِسْطَنْبول","Ayasofya"],["قونْيا","Mevlânâ Müzesi"],["باطْمان","Hasankeyf"],["وان","tarihî kale"]]},
  {"id":4215,"tip":"meshur","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Bursa İskender kebapla meşhurdur.»","parcalar":["تَشْتَهِرُ","بورْصَة","بِكَباب","إِسْكَنْدَر"]},
  {"id":4216,"tip":"meshur","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Türkiye lezzetli yemekleriyle meşhurdur.»","parcalar":["تُرْكِيا","مَشْهورَة","بِالأَطْعِمَة","اللَّذيذَة"]},
  {"id":4217,"tip":"meshur","bicim":"surukle","zorluk":3,"soru":"رَتِّب الكَلِمات: «Türkiye tarihî ve turistik yerleriyle meşhurdur.»","parcalar":["تَشْتَهِرُ","تُرْكِيا","بِالأَماكِن","التّاريخِيَّة","وَالسِّياحِيَّة"]},
  {"id":4218,"tip":"meshur","bicim":"yazma","zorluk":3,"soru":"اُكْتُبْ «kale» بِالحُروف.","cevapYazi":"قلعة","tuslar":["ق","ل","ع","ة","ك","غ","ن","ت","م","ب"]}
];

const S_U4_SAAT = [
  {"id":4301,"tip":"saat","zorluk":1,"soru":"ما مَعْنى «النِّصْف»؟","secenekler":["Buçuk","Çeyrek","Üçte bir","Tam"],"dogru":0,"arapca":"النِّصْف"},
  {"id":4302,"tip":"saat","zorluk":1,"soru":"ما مَعْنى «الرُّبْع»؟","secenekler":["Çeyrek","Buçuk","Üçte bir","Yarım"],"dogru":0,"arapca":"الرُّبْع"},
  {"id":4303,"tip":"saat","zorluk":1,"soru":"ما مَعْنى «الثُّلُث»؟","secenekler":["Yirmi dakika","Çeyrek","Buçuk","Beş dakika"],"dogru":0,"arapca":"الثُّلُث"},
  {"id":4304,"tip":"saat","zorluk":1,"soru":"ما مَعْنى «صَباحًا»؟","secenekler":["Sabahleyin","Öğleyin","Akşamleyin","Geceleyin"],"dogru":0,"arapca":"صَباحًا"},
  {"id":4305,"tip":"saat","zorluk":1,"soru":"ما مَعْنى «ظُهْرًا»؟","secenekler":["Öğleyin","Sabahleyin","İkindiyin","Geceleyin"],"dogru":0,"arapca":"ظُهْرًا"},
  {"id":4306,"tip":"saat","zorluk":2,"soru":"كَم السّاعَة؟ «السّاعَة الواحِدَة وَالنِّصْف»","secenekler":["1:30","1:15","1:20","2:30"],"dogru":0,"arapca":"السّاعَة الواحِدَة وَالنِّصْف"},
  {"id":4307,"tip":"saat","zorluk":2,"soru":"كَم السّاعَة؟ «السّاعَة السّادِسَة وَالرُّبْع»","secenekler":["6:15","6:30","6:20","7:15"],"dogru":0,"arapca":"السّاعَة السّادِسَة وَالرُّبْع"},
  {"id":4308,"tip":"saat","zorluk":2,"soru":"كَم السّاعَة؟ «السّاعَة السّابِعَة وَالثُّلُث»","secenekler":["7:20","7:15","7:30","8:20"],"dogru":0,"arapca":"السّاعَة السّابِعَة وَالثُّلُث"},
  {"id":4309,"tip":"saat","zorluk":2,"soru":"كَم السّاعَة؟ «السّاعَة الثّامِنَة وَالنِّصْف»","secenekler":["8:30","8:15","8:20","9:30"],"dogru":0,"arapca":"السّاعَة الثّامِنَة وَالنِّصْف"},
  {"id":4310,"tip":"saat","zorluk":2,"soru":"كَيْف نَقولُ 3:15 بِالعَرَبِيَّة؟","secenekler":["السّاعَة الثّالِثَة وَالرُّبْع","السّاعَة الثّالِثَة وَالنِّصْف","السّاعَة الرّابِعَة وَالرُّبْع","السّاعَة الثّالِثَة وَالثُّلُث"],"dogru":0,"arSecenek":true},
  {"id":4311,"tip":"saat","zorluk":3,"soru":"كَيْف نَقولُ 10:20 بِالعَرَبِيَّة؟","secenekler":["السّاعَة العاشِرَة وَالثُّلُث","السّاعَة العاشِرَة وَالرُّبْع","السّاعَة العاشِرَة وَالنِّصْف","السّاعَة التّاسِعَة وَالثُّلُث"],"dogru":0,"arSecenek":true},
  {"id":4312,"tip":"saat","zorluk":3,"soru":"«أَسْتَيْقِظُ في السّاعَة السّابِعَة وَالنِّصْف.» مَتى يَسْتَيْقِظُ؟","secenekler":["7:30","7:15","7:20","6:30"],"dogru":0,"arapca":"أَسْتَيْقِظُ في السّاعَة السّابِعَة وَالنِّصْف."},
  {"id":4313,"tip":"saat","bicim":"eslestir","zorluk":2,"soru":"صِل الكَلِمات بِمَعانيها.","ciftler":[["النِّصْف","buçuk"],["الرُّبْع","çeyrek"],["الثُّلُث","yirmi dakika"],["السّاعَة","saat"]]},
  {"id":4314,"tip":"saat","bicim":"eslestir","zorluk":3,"soru":"صِل السّاعات بِالأَرْقام.","ciftler":[["الواحِدَة وَالنِّصْف","1:30"],["السّادِسَة وَالرُّبْع","6:15"],["السّابِعَة وَالثُّلُث","7:20"],["الثّامِنَة وَالنِّصْف","8:30"]]},
  {"id":4315,"tip":"saat","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Saat yedi buçukta uyanırım.»","parcalar":["أَسْتَيْقِظُ","في","السّاعَة","السّابِعَة","وَالنِّصْف"]},
  {"id":4316,"tip":"saat","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Evden sekizi çeyrek geçe çıkarım.»","parcalar":["أَخْرُجُ","مِن","البَيْت","في","السّاعَة","الثّامِنَة","وَالرُّبْع"]},
  {"id":4317,"tip":"saat","bicim":"surukle","zorluk":3,"soru":"رَتِّب الكَلِمات: «Okuldan üçü yirmi geçe dönerim.»","parcalar":["أَرْجِعُ","مِن","المَدْرَسَة","في","السّاعَة","الثّالِثَة","وَالثُّلُث"]},
  {"id":4318,"tip":"saat","bicim":"yazma","zorluk":3,"soru":"اُكْتُبْ «saat» بِالحُروف.","cevapYazi":"ساعة","tuslar":["س","ا","ع","ة","ص","ح","ه","ت","ن","م"]}
];

const S_U4_SIFAT = [
  {"id":4401,"tip":"sifat","zorluk":1,"soru":"ما مَعْنى «مُزْدَحِمَة»؟","secenekler":["Kalabalık","Sakin","Küçük","Uzak"],"dogru":0,"arapca":"مُزْدَحِمَة"},
  {"id":4402,"tip":"sifat","zorluk":1,"soru":"ما مَعْنى «سِياحِيَّة»؟","secenekler":["Turistik","Tarihî","Merkezî","Yeni"],"dogru":0,"arapca":"سِياحِيَّة"},
  {"id":4403,"tip":"sifat","zorluk":1,"soru":"ما مَعْنى «تاريخِيَّة»؟","secenekler":["Tarihî","Turistik","Kalabalık","Güzel"],"dogru":0,"arapca":"تاريخِيَّة"},
  {"id":4404,"tip":"sifat","zorluk":1,"soru":"ما مَعْنى «قَريب»؟","secenekler":["Yakın","Uzak","Büyük","Küçük"],"dogru":0,"arapca":"قَريب"},
  {"id":4405,"tip":"sifat","zorluk":1,"soru":"ما مَعْنى «بَعيد»؟","secenekler":["Uzak","Yakın","Yeni","Eski"],"dogru":0,"arapca":"بَعيد"},
  {"id":4406,"tip":"sifat","zorluk":2,"soru":"ما مَعْنى «أَصْغَر مِنْ»؟","secenekler":["Daha küçük","Daha büyük","Daha uzak","Daha yakın"],"dogru":0,"arapca":"أَصْغَر مِنْ"},
  {"id":4407,"tip":"sifat","zorluk":2,"soru":"ما مَعْنى «أَكْبَر مِنْ»؟","secenekler":["Daha büyük","Daha küçük","Daha eski","Daha yeni"],"dogru":0,"arapca":"أَكْبَر مِنْ"},
  {"id":4408,"tip":"sifat","zorluk":2,"soru":"أَكْمِلْ: «مَرْسين … مِنْ أَنْقَرَة.»","secenekler":["أَصْغَر","أَكْبَر","أَبْعَد","أَقْرَب"],"dogru":0,"arSecenek":true},
  {"id":4409,"tip":"sifat","zorluk":2,"soru":"ما جَمْع «طالِب»؟","secenekler":["طُلّاب","طالِبات","طَوالِب","طالِبون"],"dogru":0,"arSecenek":true},
  {"id":4410,"tip":"sifat","zorluk":2,"soru":"ما جَمْع «طالِبَة»؟","secenekler":["طالِبات","طُلّاب","طالِبون","طَوالِب"],"dogru":0,"arSecenek":true},
  {"id":4411,"tip":"sifat","zorluk":2,"soru":"ما جَمْع «سَيّارَة»؟","secenekler":["سَيّارات","سَيّارون","سُيّار","سَيائِر"],"dogru":0,"arSecenek":true},
  {"id":4412,"tip":"sifat","zorluk":3,"soru":"أَيّ كَلِمَة نَسْتَعْمِلُ مَع الجَمْع؟","secenekler":["هَؤُلاء","هَذا","هَذِه","ذَلِك"],"dogru":0,"arSecenek":true},
  {"id":4413,"tip":"sifat","zorluk":3,"soru":"أَكْمِلْ: «… طُلّاب.»","secenekler":["هَؤُلاء","هَذا","هَذِه","هُو"],"dogru":0,"arSecenek":true},
  {"id":4414,"tip":"sifat","bicim":"eslestir","zorluk":2,"soru":"صِل الصِّفات بِمَعانيها.","ciftler":[["مُزْدَحِمَة","kalabalık"],["سِياحِيَّة","turistik"],["تاريخِيَّة","tarihî"],["رائِع","harika"]]},
  {"id":4415,"tip":"sifat","bicim":"eslestir","zorluk":3,"soru":"صِل المُفْرَد بِالجَمْع.","ciftler":[["طالِب","طُلّاب"],["طالِبَة","طالِبات"],["سَيّارَة","سَيّارات"],["طَعام","أَطْعِمَة"]]},
  {"id":4416,"tip":"sifat","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «İstanbul çok kalabalık bir şehirdir.»","parcalar":["إِسْطَنْبول","مَدينَة","مُزْدَحِمَة","جِدًّا"]},
  {"id":4417,"tip":"sifat","bicim":"surukle","zorluk":2,"soru":"رَتِّب الكَلِمات: «Mersin turistik bir şehirdir.»","parcalar":["مَرْسين","مَدينَة","سِياحِيَّة"]},
  {"id":4418,"tip":"sifat","bicim":"surukle","zorluk":3,"soru":"رَتِّب الكَلِمات: «Murat'ın mahallesi merkez çarşıya yakındır.»","parcalar":["حَيّ","مُراد","قَريب","مِن","السّوق","المَرْكَزِيّ"]},
  {"id":4419,"tip":"sifat","bicim":"yazma","zorluk":3,"soru":"اُكْتُبْ «ülke» بِالحُروف.","cevapYazi":"بلد","tuslar":["ب","ل","د","ن","ت","م","ر","س","ك","ح"]}
];

const S_UNITE1 = [].concat(S_GUNLUK, S_YEMEK, S_SAAT, S_GUNLER, S_NAMAZ, S_ZAMIR);
const S_UNITE2 = [].concat(S_U2_MARKET, S_U2_SEBZE, S_U2_MEYVE, S_U2_ADED, S_U2_MUKAYESE);
const S_UNITE3 = [].concat(S_U3_VASITA, S_U3_MEKAN, S_U3_YON, S_U3_MUKAYESE, S_U3_SEFER);
const S_UNITE4 = [].concat(S_U4_SEHIR, S_U4_KONUM, S_U4_MESHUR, S_U4_SAAT, S_U4_SIFAT);
const S_TUMU  = [].concat(S_UNITE1, S_UNITE2, S_UNITE3, S_UNITE4);
/* 2. ünite klasöründe "ilk iki ünitenin tamamı" seçeneği için birleşik havuz */
const S_TUM12 = [].concat(S_UNITE1, S_UNITE2);
const SORULAR = S_UNITE1;   // geriye donuk uyum


const TIP_BILGI = {
  "fiil":    { ad: "أَفْعال يَوْمِيَّة",  emoji: "🏃" },
  "cumle":   { ad: "جُمْلَة",           emoji: "💬" },
  "anlam":   { ad: "مَعْنًى",           emoji: "💡" },
  "yemek":   { ad: "طَعام وَشَراب",  emoji: "🍽️" },
  "saat":    { ad: "السّاعات",         emoji: "🕒" },
  "gun":     { ad: "أَيّام الأُسْبوع",emoji: "📅" },
  "namaz":   { ad: "أَوْقات الصَّلاة", emoji: "🕌" },
  "zamir":   { ad: "ضَمير وَفِعْل",      emoji: "👥" },
  "kelime":  { ad: "كِتابَة الكَلِمات",    emoji: "🔤" },
  /* 2. unite */
  "market":   { ad: "المَوادّ الغِذائِيَّة", emoji: "🛒" },
  "sebze":    { ad: "الخَضْراوات",          emoji: "🥕" },
  "meyve":    { ad: "الفَواكِه",            emoji: "🍎" },
  "aded":     { ad: "الأَعْداد وَالثَّمَن",  emoji: "🔢" },
  "mukayese": { ad: "المُقارَنَة",           emoji: "⚖️" },
  /* 3. unite */
  "vasita":   { ad: "وَسائِل النَّقْل",       emoji: "🚌" },
  "mekan":    { ad: "الأَماكِن",             emoji: "🏥" },
  "yon":      { ad: "الاِتِّجاهات وَالمُرور", emoji: "🚦" },
  "sefer":    { ad: "السَّفَر",               emoji: "🧳" },
  /* 4. unite */
  "sehir":    { ad: "المُدُن",               emoji: "🏙️" },
  "konum":    { ad: "مَواقِع المُدُن",        emoji: "🧭" },
  "meshur":   { ad: "تَشْتَهِرُ بِـ",          emoji: "⭐" },
  "sifat":    { ad: "الصِّفات وَالجَمْع",     emoji: "✨" }
};
const ZORLUK_AD = { 1: "سَهْل", 2: "مُتَوَسِّط", 3: "صَعْب" };
const SIK_RENK = ["#E74C3C", "#3498DB", "#F1C40F", "#27AE60", "#9B59B6"]; // A B C D E

/* =====================================================================
   KARAKTERLER — katilimci adinin yaninda gorunen ozel SVG avatarlar.
   Birey odalarinda 30 tek karakter (hayvan · esya · uzay/robot),
   takim odalarinda 12 arma, okul (sinif) odalarinda 12 okul rozeti.
   Her avatari yalnizca BIR katilimci alabilir; sahiplenme Firestore
   tarafinda islem (transaction) ile yapilir → kim once kaparsa onun.
   SVG'lerde id yoktur (duz renk), bu yuzden her yere guvenle klonlanir.
   ===================================================================== */
const KRK_BIREY = [
  { i:"kedi", a:"قِطّ", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#FFE0B2"/><path d="M13 19l-1.5-9 8.5 4.5z" fill="#EF6C00"/><path d="M35 19l1.5-9-8.5 4.5z" fill="#EF6C00"/><circle cx="24" cy="27" r="13" fill="#F59E0B"/><circle cx="19" cy="25" r="2.3" fill="#3E2723"/><circle cx="29" cy="25" r="2.3" fill="#3E2723"/><path d="M24 30l-2.4 2.2h4.8z" fill="#5D4037"/><path d="M8 27h7M8 32h7M40 27h-7M40 32h-7" stroke="#5D4037" stroke-width="1.5" stroke-linecap="round"/></svg>' },
  { i:"kopek", a:"كَلْب", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#D7CCC8"/><ellipse cx="11.5" cy="23" rx="4.5" ry="9" fill="#6D4C41"/><ellipse cx="36.5" cy="23" rx="4.5" ry="9" fill="#6D4C41"/><circle cx="24" cy="26" r="13" fill="#A1887F"/><circle cx="19" cy="23" r="2.2" fill="#3E2723"/><circle cx="29" cy="23" r="2.2" fill="#3E2723"/><ellipse cx="24" cy="31" rx="7" ry="5.5" fill="#EFEBE9"/><ellipse cx="24" cy="29.5" rx="2.8" ry="2.1" fill="#3E2723"/><path d="M24 32v3.5" stroke="#3E2723" stroke-width="1.5" stroke-linecap="round"/></svg>' },
  { i:"tavsan", a:"أَرْنَب", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#F8BBD0"/><ellipse cx="18" cy="14" rx="4.2" ry="10" fill="#FAFAFA"/><ellipse cx="30" cy="14" rx="4.2" ry="10" fill="#FAFAFA"/><ellipse cx="18" cy="14.5" rx="2" ry="6.8" fill="#F06292"/><ellipse cx="30" cy="14.5" rx="2" ry="6.8" fill="#F06292"/><circle cx="24" cy="31" r="12" fill="#FAFAFA"/><circle cx="19.6" cy="29" r="2.1" fill="#5D4037"/><circle cx="28.4" cy="29" r="2.1" fill="#5D4037"/><path d="M24 33l-2.2 2h4.4z" fill="#F06292"/><path d="M24 35v2" stroke="#5D4037" stroke-width="1.3" stroke-linecap="round"/></svg>' },
  { i:"tilki", a:"ثَعْلَب", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#FFCCBC"/><path d="M12 20l-1-10 9 5z" fill="#E64A19"/><path d="M36 20l1-10-9 5z" fill="#E64A19"/><circle cx="24" cy="26" r="13" fill="#FB8C00"/><path d="M24 24c4 0 7 4 7 8s-3 5-7 5-7-1-7-5 3-8 7-8z" fill="#FFF8E1"/><circle cx="18.5" cy="23" r="2.1" fill="#3E2723"/><circle cx="29.5" cy="23" r="2.1" fill="#3E2723"/><circle cx="24" cy="31" r="2.3" fill="#3E2723"/></svg>' },
  { i:"ayi", a:"دُبّ", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#BCAAA4"/><circle cx="13" cy="15" r="6" fill="#795548"/><circle cx="35" cy="15" r="6" fill="#795548"/><circle cx="13" cy="15" r="3" fill="#D7CCC8"/><circle cx="35" cy="15" r="3" fill="#D7CCC8"/><circle cx="24" cy="27" r="14" fill="#8D6E63"/><circle cx="19" cy="24" r="2.2" fill="#3E2723"/><circle cx="29" cy="24" r="2.2" fill="#3E2723"/><ellipse cx="24" cy="32" rx="7.5" ry="6" fill="#D7CCC8"/><ellipse cx="24" cy="30" rx="3" ry="2.2" fill="#3E2723"/></svg>' },
  { i:"panda", a:"بَانْدا", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#CFD8DC"/><circle cx="13" cy="15" r="6" fill="#263238"/><circle cx="35" cy="15" r="6" fill="#263238"/><circle cx="24" cy="27" r="14" fill="#FAFAFA"/><ellipse cx="18" cy="24" rx="4.6" ry="5.6" fill="#263238" transform="rotate(-16 18 24)"/><ellipse cx="30" cy="24" rx="4.6" ry="5.6" fill="#263238" transform="rotate(16 30 24)"/><circle cx="18.6" cy="24" r="1.8" fill="#FAFAFA"/><circle cx="29.4" cy="24" r="1.8" fill="#FAFAFA"/><ellipse cx="24" cy="31" rx="3" ry="2.2" fill="#263238"/><path d="M24 33.5v2" stroke="#263238" stroke-width="1.5" stroke-linecap="round"/></svg>' },
  { i:"aslan", a:"أَسَد", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#FFE082"/><g fill="#E65100"><circle cx="24" cy="8" r="5"/><circle cx="35" cy="12" r="5"/><circle cx="40" cy="23" r="5"/><circle cx="35" cy="34" r="5"/><circle cx="24" cy="39" r="5"/><circle cx="13" cy="34" r="5"/><circle cx="8" cy="23" r="5"/><circle cx="13" cy="12" r="5"/></g><circle cx="24" cy="24" r="13" fill="#FBC02D"/><circle cx="19" cy="22" r="2.2" fill="#4E342E"/><circle cx="29" cy="22" r="2.2" fill="#4E342E"/><path d="M24 27l-2.6 2.4h5.2z" fill="#4E342E"/><path d="M17 32q7 5 14 0" stroke="#4E342E" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>' },
  { i:"kurbaga", a:"ضِفْدَع", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#C8E6C9"/><circle cx="15" cy="16" r="7" fill="#66BB6A"/><circle cx="33" cy="16" r="7" fill="#66BB6A"/><circle cx="15" cy="16" r="4" fill="#FAFAFA"/><circle cx="33" cy="16" r="4" fill="#FAFAFA"/><circle cx="15" cy="16.5" r="2.2" fill="#1B5E20"/><circle cx="33" cy="16.5" r="2.2" fill="#1B5E20"/><path d="M8 27a16 12 0 0 0 32 0z" fill="#43A047"/><path d="M14 30q10 7 20 0" stroke="#1B5E20" stroke-width="1.8" fill="none" stroke-linecap="round"/><circle cx="12" cy="27" r="1.6" fill="#1B5E20" opacity=".5"/><circle cx="36" cy="27" r="1.6" fill="#1B5E20" opacity=".5"/></svg>' },
  { i:"baykus", a:"بومَة", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#D1C4E9"/><path d="M12 16l3-9 6 6z" fill="#5E35B1"/><path d="M36 16l-3-9-6 6z" fill="#5E35B1"/><ellipse cx="24" cy="27" rx="14" ry="15" fill="#7E57C2"/><circle cx="18" cy="23" r="6" fill="#FAFAFA"/><circle cx="30" cy="23" r="6" fill="#FAFAFA"/><circle cx="18" cy="23" r="2.8" fill="#311B92"/><circle cx="30" cy="23" r="2.8" fill="#311B92"/><path d="M24 27l-3 4h6z" fill="#FB8C00"/><path d="M17 35q7 4 14 0" stroke="#5E35B1" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>' },
  { i:"balik", a:"سَمَكَة", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#B3E5FC"/><path d="M38 24l8-7v14z" fill="#0288D1"/><ellipse cx="22" cy="24" rx="16" ry="11" fill="#29B6F6"/><path d="M22 13q5 4 5 11t-5 11" stroke="#0288D1" stroke-width="2" fill="none"/><circle cx="12" cy="21" r="2.6" fill="#FAFAFA"/><circle cx="11.4" cy="21" r="1.4" fill="#01579B"/><path d="M20 13v-5l7 5z" fill="#0288D1"/></svg>' },
  { i:"kitap", a:"كِتاب", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#FFCDD2"/><path d="M10 12h11a4 4 0 0 1 3 1.6A4 4 0 0 1 27 12h11v25H27a3 3 0 0 0-3 2 3 3 0 0 0-3-2H10z" fill="#EF5350"/><path d="M22.4 15.4V37a4.6 4.6 0 0 0-2.4-.7h-8V15.4z" fill="#FFEBEE"/><path d="M25.6 15.4V37a4.6 4.6 0 0 1 2.4-.7h8V15.4z" fill="#FFEBEE"/><path d="M14 20h6M14 24h6M28 20h6M28 24h6" stroke="#EF9A9A" stroke-width="1.5" stroke-linecap="round"/></svg>' },
  { i:"kalem", a:"قَلَم", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#FFF9C4"/><path d="M12 36l2-8 18-18 6 6-18 18z" fill="#FDD835"/><path d="M32 10l6 6 3-3a4.2 4.2 0 0 0-6-6z" fill="#EC407A"/><path d="M14 28l6 6-8 2z" fill="#FFF8E1"/><path d="M12 36l3-1-2-2z" fill="#455A64"/><path d="M28 14l6 6" stroke="#F9A825" stroke-width="2" stroke-linecap="round"/></svg>' },
  { i:"saat", a:"ساعَة", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#B2EBF2"/><circle cx="24" cy="25" r="15" fill="#00838F"/><circle cx="24" cy="25" r="12" fill="#FAFAFA"/><path d="M24 17v8l6 4" stroke="#00838F" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="25" r="1.8" fill="#00838F"/><path d="M18 8h12v4H18z" fill="#00838F"/></svg>' },
  { i:"canta", a:"حَقيبَة", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#D7CCC8"/><path d="M18 16v-3a6 6 0 0 1 12 0v3" stroke="#5D4037" stroke-width="3" fill="none" stroke-linecap="round"/><rect x="9" y="16" width="30" height="22" rx="4" fill="#8D6E63"/><rect x="9" y="23" width="30" height="4" fill="#5D4037"/><rect x="21" y="21" width="6" height="8" rx="2" fill="#FFCA28"/></svg>' },
  { i:"ampul", a:"مِصْباح", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#FFF59D"/><path d="M24 7a12 12 0 0 0-7 21.7V33h14v-4.3A12 12 0 0 0 24 7z" fill="#FDD835"/><rect x="18" y="33" width="12" height="3.4" rx="1.4" fill="#90A4AE"/><rect x="19.5" y="37" width="9" height="3.4" rx="1.4" fill="#78909C"/><path d="M21 28v-6h6v6" stroke="#F57F17" stroke-width="1.6" fill="none"/><path d="M5 24h3M40 24h3M9 10l2 2M39 10l-2 2" stroke="#F9A825" stroke-width="2" stroke-linecap="round"/></svg>' },
  { i:"fincan", a:"كوب", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#FFE0B2"/><path d="M30 21h4a5 5 0 0 1 0 10h-4" stroke="#8D6E63" stroke-width="3" fill="none"/><path d="M10 17h22v14a8 8 0 0 1-8 8h-6a8 8 0 0 1-8-8z" fill="#FAFAFA"/><path d="M10 17h22v5H10z" fill="#EF6C00"/><path d="M17 12q2-3 0-6M25 12q2-3 0-6" stroke="#BCAAA4" stroke-width="2" fill="none" stroke-linecap="round"/></svg>' },
  { i:"anahtar", a:"مِفْتاح", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#FFECB3"/><circle cx="16" cy="19" r="9" fill="none" stroke="#FFA000" stroke-width="5"/><circle cx="16" cy="19" r="3" fill="#FFF8E1"/><path d="M22 25l14 14" stroke="#FFA000" stroke-width="5" stroke-linecap="round"/><path d="M31 30l4-4M35 34l4-4" stroke="#FFA000" stroke-width="4" stroke-linecap="round"/></svg>' },
  { i:"balon", a:"بالون", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#F8BBD0"/><ellipse cx="24" cy="19" rx="12" ry="14" fill="#EC407A"/><path d="M20 33h8l-4 4z" fill="#AD1457"/><path d="M24 37q4 4 0 8" stroke="#AD1457" stroke-width="1.8" fill="none" stroke-linecap="round"/><ellipse cx="19" cy="14" rx="3" ry="4.5" fill="#F8BBD0" opacity=".75" transform="rotate(-22 19 14)"/></svg>' },
  { i:"ud", a:"عود", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#D7CCC8"/><path d="M31 8l8 8-6 6-8-8z" fill="#8D6E63"/><ellipse cx="19" cy="30" rx="13" ry="11" fill="#A1887F" transform="rotate(-45 19 30)"/><path d="M24 24l8-8" stroke="#5D4037" stroke-width="4" stroke-linecap="round"/><circle cx="18" cy="29" r="4.5" fill="#4E342E"/><path d="M25 22l-9 9M28 25l-9 9" stroke="#FFE0B2" stroke-width="1.2"/></svg>' },
  { i:"kamera", a:"كاميرا", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#B0BEC5"/><path d="M17 12h14l2.5 4H39a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V20a4 4 0 0 1 4-4h5.5z" fill="#455A64"/><circle cx="24" cy="27" r="9" fill="#90A4AE"/><circle cx="24" cy="27" r="5.5" fill="#263238"/><circle cx="22" cy="25" r="1.8" fill="#B0BEC5"/><circle cx="36" cy="21" r="1.8" fill="#FFCA28"/></svg>' },
  { i:"roket", a:"صاروخ", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#C5CAE9"/><path d="M24 5c6 5 9 12 9 20v6H15v-6c0-8 3-15 9-20z" fill="#FAFAFA"/><path d="M15 25l-6 8 6-1zM33 25l6 8-6-1z" fill="#EF5350"/><circle cx="24" cy="19" r="4.6" fill="#42A5F5"/><circle cx="24" cy="19" r="2.4" fill="#E3F2FD"/><path d="M19 31h10l-1 4H20z" fill="#B0BEC5"/><path d="M24 36l3 7h-6z" fill="#FB8C00"/><path d="M24 39l1.6 4h-3.2z" fill="#FFEB3B"/></svg>' },
  { i:"robot", a:"إِنْسان آلِيّ", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#B2DFDB"/><path d="M24 4v5" stroke="#00897B" stroke-width="2.4" stroke-linecap="round"/><circle cx="24" cy="4.5" r="2.6" fill="#FF7043"/><rect x="10" y="10" width="28" height="21" rx="6" fill="#B0BEC5"/><rect x="14" y="15" width="20" height="11" rx="4" fill="#263238"/><circle cx="19.5" cy="20.5" r="2.6" fill="#4DD0E1"/><circle cx="28.5" cy="20.5" r="2.6" fill="#4DD0E1"/><rect x="14" y="33" width="20" height="10" rx="3" fill="#90A4AE"/><rect x="5" y="34" width="7" height="4" rx="2" fill="#78909C"/><rect x="36" y="34" width="7" height="4" rx="2" fill="#78909C"/><rect x="20" y="36" width="8" height="3" rx="1.5" fill="#FF7043"/></svg>' },
  { i:"uydu", a:"قَمَر صِناعِيّ", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#B3E5FC"/><rect x="19" y="18" width="10" height="14" rx="3" fill="#90A4AE"/><rect x="3" y="20" width="13" height="10" rx="2" fill="#1E88E5"/><rect x="32" y="20" width="13" height="10" rx="2" fill="#1E88E5"/><path d="M3 25h13M32 25h13" stroke="#0D47A1" stroke-width="1.4"/><path d="M24 18v-6" stroke="#607D8B" stroke-width="2.4"/><circle cx="24" cy="9.5" r="3.4" fill="#FFCA28"/><path d="M24 32v5" stroke="#607D8B" stroke-width="2.4"/><ellipse cx="24" cy="39" rx="5" ry="2.6" fill="#78909C"/></svg>' },
  { i:"gezegen", a:"كَوْكَب", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#D1C4E9"/><circle cx="24" cy="23" r="12" fill="#7E57C2"/><path d="M14 18a12 12 0 0 1 9-4M18 30a12 12 0 0 0 14-2" stroke="#B39DDB" stroke-width="2.4" fill="none" stroke-linecap="round"/><ellipse cx="24" cy="27" rx="21" ry="6" fill="none" stroke="#FFB300" stroke-width="3" transform="rotate(-18 24 27)"/><circle cx="40" cy="11" r="1.8" fill="#FFF"/><circle cx="8" cy="38" r="1.5" fill="#FFF"/></svg>' },
  { i:"yildiz", a:"نَجْمَة", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#FFF9C4"/><path d="M24 6l5.5 11.2 12.4 1.8-9 8.7 2.2 12.3L24 34.2 12.9 40l2.2-12.3-9-8.7 12.4-1.8z" fill="#FDD835"/><circle cx="19.5" cy="22" r="1.9" fill="#5D4037"/><circle cx="28.5" cy="22" r="1.9" fill="#5D4037"/><path d="M20 27q4 3.5 8 0" stroke="#5D4037" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>' },
  { i:"ay", a:"هِلال", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#B39DDB"/><path d="M30 6a19 19 0 1 0 12 26A19 19 0 0 1 30 6z" fill="#FFF176"/><circle cx="28" cy="18" r="2.6" fill="#FBC02D" opacity=".6"/><circle cx="24" cy="30" r="3.4" fill="#FBC02D" opacity=".5"/><circle cx="12" cy="10" r="1.8" fill="#FFF"/><circle cx="8" cy="20" r="1.4" fill="#FFF"/><circle cx="15" cy="40" r="1.5" fill="#FFF"/></svg>' },
  { i:"ufo", a:"طَبَق طائِر", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#B2EBF2"/><path d="M14 22a10 8 0 0 1 20 0z" fill="#4DD0E1"/><ellipse cx="24" cy="24" rx="18" ry="6" fill="#90A4AE"/><circle cx="13" cy="24" r="1.9" fill="#FFCA28"/><circle cx="24" cy="25" r="1.9" fill="#FF7043"/><circle cx="35" cy="24" r="1.9" fill="#FFCA28"/><path d="M17 29l-5 12h24l-5-12z" fill="#4DD0E1" opacity=".38"/></svg>' },
  { i:"astronot", a:"رائِد فَضاء", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#CFD8DC"/><circle cx="24" cy="20" r="13" fill="#FAFAFA"/><path d="M14 19a10 8 0 0 1 20 0 10 8 0 0 1-20 0z" fill="#263238"/><path d="M17 17a6 4 0 0 1 7-2" stroke="#78909C" stroke-width="2" fill="none" stroke-linecap="round"/><rect x="9" y="16" width="4" height="7" rx="2" fill="#B0BEC5"/><rect x="35" y="16" width="4" height="7" rx="2" fill="#B0BEC5"/><path d="M14 33h20l2 10H12z" fill="#ECEFF1"/><rect x="20" y="36" width="8" height="4" rx="1.6" fill="#FF7043"/></svg>' },
  { i:"kuyruklu", a:"مُذَنَّب", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#B3E5FC"/><path d="M4 42l18-18 6 6z" fill="#4FC3F7" opacity=".55"/><path d="M10 42l14-14 4 4z" fill="#29B6F6" opacity=".8"/><circle cx="31" cy="17" r="9" fill="#FFB300"/><circle cx="31" cy="17" r="5.5" fill="#FFE082"/><circle cx="41" cy="8" r="1.7" fill="#FFF"/><circle cx="14" cy="10" r="1.5" fill="#FFF"/></svg>' },
  { i:"teleskop", a:"مِرْقَب", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#C5CAE9"/><path d="M8 27l22-12 5 8-22 12z" fill="#5C6BC0"/><path d="M30 15l6-3 5 8-6 3z" fill="#3949AB"/><path d="M14 32l-4 10M22 30l6 12" stroke="#455A64" stroke-width="3" stroke-linecap="round"/><circle cx="41" cy="9" r="1.7" fill="#FFF176"/><circle cx="34" cy="5" r="1.3" fill="#FFF176"/></svg>' }
];
const KRK_TAKIM = [
  { i:"t-nesir", a:"فَريق النَّسْر", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#E0F7FA"/><path d="M24 4l16 5.5v15C40 34.5 32.5 41 24 44.5 15.5 41 8 34.5 8 24.5v-15z" fill="#00695C"/><path d="M24 8l12 4.2v12c0 7.6-5.6 12.6-12 15.4-6.4-2.8-12-7.8-12-15.4v-12z" fill="#26A69A"/><path d="M24 13.6c5 0 9 3.9 9 8.9 0 3.9-2.1 7-4.9 9.1L24 34.4l-4.1-2.8c-2.8-2.1-4.9-5.2-4.9-9.1 0-5 4-8.9 9-8.9z" fill="#FFF8E1"/><path d="M16.4 19.4l6 2.2-6.2 1.2zM31.6 19.4l-6 2.2 6.2 1.2z" fill="#00695C"/><circle cx="20.4" cy="23.4" r="1.6" fill="#37474F"/><circle cx="27.6" cy="23.4" r="1.6" fill="#37474F"/><path d="M24 25.6c1.9 0 3.3 1.2 3.3 2.9 0 2.3-1.4 4.6-3.3 6.4-1.9-1.8-3.3-4.1-3.3-6.4 0-1.7 1.4-2.9 3.3-2.9z" fill="#FFB300"/></svg>' },
  { i:"t-nemir", a:"فَريق النَّمِر", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#FFF3E0"/><path d="M24 4l16 5.5v15C40 34.5 32.5 41 24 44.5 15.5 41 8 34.5 8 24.5v-15z" fill="#E65100"/><path d="M24 8l12 4.2v12c0 7.6-5.6 12.6-12 15.4-6.4-2.8-12-7.8-12-15.4v-12z" fill="#FB8C00"/><path d="M16.8 18.4l-2-5 5.2 2.2zM31.2 18.4l2-5-5.2 2.2z" fill="#FFF8E1"/><circle cx="24" cy="25" r="8.9" fill="#FFF8E1"/><path d="M18.6 19.6l1.5 3M29.4 19.6l-1.5 3M15.4 26.2h2.8M32.6 26.2h-2.8" stroke="#E65100" stroke-width="1.8" fill="none" stroke-linecap="round"/><circle cx="21" cy="24.2" r="1.6" fill="#37474F"/><circle cx="27" cy="24.2" r="1.6" fill="#37474F"/><path d="M24 27.6l2.2 1.6-2.2 1.8-2.2-1.8z" fill="#37474F"/><path d="M24 31v1.6" stroke="#37474F" stroke-width="1.5" stroke-linecap="round"/></svg>' },
  { i:"t-zib", a:"فَريق الذِّئْب", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#ECEFF1"/><path d="M24 4l16 5.5v15C40 34.5 32.5 41 24 44.5 15.5 41 8 34.5 8 24.5v-15z" fill="#37474F"/><path d="M24 8l12 4.2v12c0 7.6-5.6 12.6-12 15.4-6.4-2.8-12-7.8-12-15.4v-12z" fill="#78909C"/><path d="M16.4 17.2l-1-5.2 5.2 3zM31.6 17.2l1-5.2-5.2 3z" fill="#FFF8E1"/><path d="M24 15.4c4.9 0 8.3 3.2 8.3 7.4 0 3.2-1.6 5.8-3.6 7.8l-4.7 4.4-4.7-4.4c-2-2-3.6-4.6-3.6-7.8 0-4.2 3.4-7.4 8.3-7.4z" fill="#FFF8E1"/><path d="M21 27.6h6l-.8 4.2c-.3 1.4-1.2 2.1-2.2 2.1s-1.9-.7-2.2-2.1z" fill="#CFD8DC"/><circle cx="20.9" cy="22.6" r="1.6" fill="#37474F"/><circle cx="27.1" cy="22.6" r="1.6" fill="#37474F"/><path d="M24 26.6l1.9 1.4-1.9 1.6-1.9-1.6z" fill="#37474F"/></svg>' },
  { i:"t-fil", a:"فَريق الفيل", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#E8EAF6"/><path d="M24 4l16 5.5v15C40 34.5 32.5 41 24 44.5 15.5 41 8 34.5 8 24.5v-15z" fill="#283593"/><path d="M24 8l12 4.2v12c0 7.6-5.6 12.6-12 15.4-6.4-2.8-12-7.8-12-15.4v-12z" fill="#5C6BC0"/><path d="M17.6 17c-3.8-1.6-6.4.2-6.4 3.8s2.6 6 6.4 5z" fill="#FFF8E1"/><path d="M30.4 17c3.8-1.6 6.4.2 6.4 3.8s-2.6 6-6.4 5z" fill="#FFF8E1"/><ellipse cx="24" cy="22.6" rx="6.8" ry="7.2" fill="#FFF8E1"/><path d="M24 27.6v4.4c0 2 2 2.8 3.2 1.4" stroke="#FFF8E1" stroke-width="3.6" fill="none" stroke-linecap="round"/><circle cx="21.2" cy="21.4" r="1.5" fill="#37474F"/><circle cx="26.8" cy="21.4" r="1.5" fill="#37474F"/></svg>' },
  { i:"t-hisan", a:"فَريق الحِصان", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#E3F2FD"/><path d="M24 4l16 5.5v15C40 34.5 32.5 41 24 44.5 15.5 41 8 34.5 8 24.5v-15z" fill="#1565C0"/><path d="M24 8l12 4.2v12c0 7.6-5.6 12.6-12 15.4-6.4-2.8-12-7.8-12-15.4v-12z" fill="#42A5F5"/><path d="M20.4 15.6l-2-4.4 4.6 2.4zM27.6 15.6l2-4.4-4.6 2.4z" fill="#FFF8E1"/><path d="M24 13.4c3.7 0 6.2 2.4 6.2 5.9 0 2.3-.7 4.2-1.8 5.9l-.6 5.6c-.2 2.2-1.8 3.7-3.8 3.7s-3.6-1.5-3.8-3.7l-.6-5.6c-1.1-1.7-1.8-3.6-1.8-5.9 0-3.5 2.5-5.9 6.2-5.9z" fill="#FFF8E1"/><path d="M18.8 16c-1.9 2.6-2.4 5.8-1.4 9.2" stroke="#1565C0" stroke-width="2.6" fill="none" stroke-linecap="round"/><circle cx="21.4" cy="20.6" r="1.5" fill="#37474F"/><circle cx="26.6" cy="20.6" r="1.5" fill="#37474F"/><circle cx="22.7" cy="29.4" r="1" fill="#37474F"/><circle cx="25.3" cy="29.4" r="1" fill="#37474F"/></svg>' },
  { i:"t-dulfin", a:"فَريق الدُّلْفين", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#E0F2F1"/><path d="M24 4l16 5.5v15C40 34.5 32.5 41 24 44.5 15.5 41 8 34.5 8 24.5v-15z" fill="#00838F"/><path d="M24 8l12 4.2v12c0 7.6-5.6 12.6-12 15.4-6.4-2.8-12-7.8-12-15.4v-12z" fill="#26C6DA"/><path d="M12.4 21.4c2.4 0 4.4.5 5.9 1.5 2-3.4 5.4-5.4 10.2-6.1-1 1.6-1.4 3.1-1.1 4.5 3.6.8 6.3 2.7 8.1 5.7-2.7-.8-5-.6-6.9.5-2.9 1.7-6 4.1-10.5 4.1-3.6 0-6.4-1.7-8.3-5 1.8.3 3.4.1 4.7-.6-1.2-.9-1.9-2.1-2.1-4.6z" fill="#FFF8E1"/><path d="M20.6 22.6l1.6-6 5.4 3.4z" fill="#FFF8E1"/><circle cx="29.2" cy="20.8" r="1.2" fill="#37474F"/><path d="M31.4 22.6l-2.8 1.2" stroke="#37474F" stroke-width="1.1" stroke-linecap="round"/></svg>' },
  { i:"t-qird", a:"فَريق القِرْد", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#EFEBE9"/><path d="M24 4l16 5.5v15C40 34.5 32.5 41 24 44.5 15.5 41 8 34.5 8 24.5v-15z" fill="#4E342E"/><path d="M24 8l12 4.2v12c0 7.6-5.6 12.6-12 15.4-6.4-2.8-12-7.8-12-15.4v-12z" fill="#8D6E63"/><circle cx="15.8" cy="21.6" r="3.8" fill="#FFF8E1"/><circle cx="32.2" cy="21.6" r="3.8" fill="#FFF8E1"/><circle cx="24" cy="23.8" r="8.4" fill="#FFF8E1"/><ellipse cx="24" cy="27.6" rx="5.4" ry="4.2" fill="#FFE0B2"/><circle cx="21.2" cy="22.4" r="1.6" fill="#37474F"/><circle cx="26.8" cy="22.4" r="1.6" fill="#37474F"/><circle cx="22.6" cy="26.6" r=".9" fill="#37474F"/><circle cx="25.4" cy="26.6" r=".9" fill="#37474F"/><path d="M21.6 29.6c1.4 1.2 3.4 1.2 4.8 0" stroke="#37474F" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>' },
  { i:"t-zarafa", a:"فَريق الزَّرافَة", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#FFF8E1"/><path d="M24 4l16 5.5v15C40 34.5 32.5 41 24 44.5 15.5 41 8 34.5 8 24.5v-15z" fill="#F57F17"/><path d="M24 8l12 4.2v12c0 7.6-5.6 12.6-12 15.4-6.4-2.8-12-7.8-12-15.4v-12z" fill="#FFCA28"/><path d="M20.6 34.6V25c0-3.6 1-6.4 2.9-8.4l4.2 3.2c-1.2 1.2-1.9 2.9-1.9 5.2v9.6z" fill="#FFF8E1"/><path d="M26.4 14.8c3.4 0 6 1.8 6.8 4.4.3 1.1-.5 2-1.6 2h-6.4c-2 0-3.6-1.4-3.8-3.2-.2-2 1.9-3.2 5-3.2z" fill="#FFF8E1"/><path d="M24.6 14.6l-.7-2.6M29.6 15l1.1-2.6" stroke="#FFF8E1" stroke-width="2.6" stroke-linecap="round"/><circle cx="23.7" cy="11.4" r="1.4" fill="#FFF8E1"/><circle cx="31" cy="12" r="1.4" fill="#FFF8E1"/><circle cx="25.6" cy="18.2" r="1.2" fill="#37474F"/><circle cx="22.6" cy="26.4" r="1.5" fill="#F57F17"/><circle cx="22.4" cy="30.8" r="1.4" fill="#F57F17"/><circle cx="25" cy="28.6" r="1.2" fill="#F57F17"/></svg>' },
  { i:"t-sulhfa", a:"فَريق السُّلَحْفاة", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#E8F5E9"/><path d="M24 4l16 5.5v15C40 34.5 32.5 41 24 44.5 15.5 41 8 34.5 8 24.5v-15z" fill="#2E7D32"/><path d="M24 8l12 4.2v12c0 7.6-5.6 12.6-12 15.4-6.4-2.8-12-7.8-12-15.4v-12z" fill="#66BB6A"/><circle cx="24" cy="17.4" r="3.2" fill="#FFF8E1"/><path d="M17.2 21.8l-2.4-1.6M30.8 21.8l2.4-1.6M17.8 31.4l-2.2 1.8M30.2 31.4l2.2 1.8" stroke="#FFF8E1" stroke-width="4" stroke-linecap="round"/><ellipse cx="24" cy="26.6" rx="8.6" ry="7.8" fill="#2E7D32"/><ellipse cx="24" cy="26.6" rx="6.4" ry="5.7" fill="#FFF8E1"/><circle cx="24" cy="26.6" r="2.5" fill="#2E7D32"/><path d="M24 21v1.8M24 30.4v1.8M17.8 26.6h1.9M28.3 26.6h1.9" stroke="#2E7D32" stroke-width="1.6" stroke-linecap="round"/><circle cx="22.7" cy="16.8" r=".9" fill="#37474F"/><circle cx="25.3" cy="16.8" r=".9" fill="#37474F"/></svg>' },
  { i:"t-batriq", a:"فَريق البَطْريق", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#E1F5FE"/><path d="M24 4l16 5.5v15C40 34.5 32.5 41 24 44.5 15.5 41 8 34.5 8 24.5v-15z" fill="#0277BD"/><path d="M24 8l12 4.2v12c0 7.6-5.6 12.6-12 15.4-6.4-2.8-12-7.8-12-15.4v-12z" fill="#4FC3F7"/><path d="M24 14.4c-4.2 0-7.6 3.4-7.6 8.4 0 6 3.4 12 7.6 12s7.6-6 7.6-12c0-5-3.4-8.4-7.6-8.4z" fill="#37474F"/><path d="M24 18.6c-3 0-5 2.6-5 6.6 0 4.6 2.4 9 5 9s5-4.4 5-9c0-4-2-6.6-5-6.6z" fill="#FFF8E1"/><circle cx="21.6" cy="20.4" r="1.4" fill="#FFF8E1"/><circle cx="26.4" cy="20.4" r="1.4" fill="#FFF8E1"/><circle cx="21.6" cy="20.6" r=".8" fill="#37474F"/><circle cx="26.4" cy="20.6" r=".8" fill="#37474F"/><path d="M24 22.4l2.4 1.8-2.4 1.6-2.4-1.6z" fill="#FFB300"/><path d="M21.4 34.6l-2.8 1.6M26.6 34.6l2.8 1.6" stroke="#FFB300" stroke-width="2.4" stroke-linecap="round"/></svg>' },
  { i:"t-gazal", a:"فَريق الغَزال", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#FCE4EC"/><path d="M24 4l16 5.5v15C40 34.5 32.5 41 24 44.5 15.5 41 8 34.5 8 24.5v-15z" fill="#AD1457"/><path d="M24 8l12 4.2v12c0 7.6-5.6 12.6-12 15.4-6.4-2.8-12-7.8-12-15.4v-12z" fill="#EC407A"/><path d="M21.4 14.6c-2.6-1.2-4-3.4-4.2-6.6 1.4.4 2.6 1.2 3.4 2.4M26.6 14.6c2.6-1.2 4-3.4 4.2-6.6-1.4.4-2.6 1.2-3.4 2.4" stroke="#FFF8E1" stroke-width="1.9" fill="none" stroke-linecap="round"/><path d="M19.6 12.4l-2.2-.6M17.9 9.8l-2 -.4M28.4 12.4l2.2-.6M30.1 9.8l2-.4" stroke="#FFF8E1" stroke-width="1.5" stroke-linecap="round"/><ellipse cx="18.2" cy="22.4" rx="2.8" ry="1.5" fill="#FFF8E1" transform="rotate(-22 18.2 22.4)"/><ellipse cx="29.8" cy="22.4" rx="2.8" ry="1.5" fill="#FFF8E1" transform="rotate(22 29.8 22.4)"/><path d="M24 16c3.2 0 5.4 2.2 5.4 5.3 0 2-.5 3.7-1.3 5.1l-.7 5c-.3 2.1-1.7 3.5-3.4 3.5s-3.1-1.4-3.4-3.5l-.7-5c-.8-1.4-1.3-3.1-1.3-5.1 0-3.1 2.2-5.3 5.4-5.3z" fill="#FFF8E1"/><circle cx="21.7" cy="21.6" r="1.4" fill="#37474F"/><circle cx="26.3" cy="21.6" r="1.4" fill="#37474F"/><path d="M24 30l1.6 1.2-1.6 1.4-1.6-1.4z" fill="#37474F"/></svg>' },
  { i:"t-farasha", a:"فَريق الفَراشَة", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#EDE7F6"/><path d="M24 4l16 5.5v15C40 34.5 32.5 41 24 44.5 15.5 41 8 34.5 8 24.5v-15z" fill="#4527A0"/><path d="M24 8l12 4.2v12c0 7.6-5.6 12.6-12 15.4-6.4-2.8-12-7.8-12-15.4v-12z" fill="#7E57C2"/><path d="M22.8 22.4c-2.2-4.6-5.2-7.2-8.2-6.4-2.7.7-3.2 4.2-1.5 6.7 1.2 1.8 3 2.9 5.1 3.1-2.1.8-3.5 2.2-3.9 4-.5 2.5 1.3 4.3 3.5 3.9 2.3-.4 4.2-2.7 5.2-5.6z" fill="#FFF8E1"/><path d="M25.2 22.4c2.2-4.6 5.2-7.2 8.2-6.4 2.7.7 3.2 4.2 1.5 6.7-1.2 1.8-3 2.9-5.1 3.1 2.1.8 3.5 2.2 3.9 4 .5 2.5-1.3 4.3-3.5 3.9-2.3-.4-4.2-2.7-5.2-5.6z" fill="#FFF8E1"/><circle cx="17.6" cy="20.6" r="1.6" fill="#4527A0"/><circle cx="30.4" cy="20.6" r="1.6" fill="#4527A0"/><circle cx="19" cy="29.4" r="1.2" fill="#4527A0"/><circle cx="29" cy="29.4" r="1.2" fill="#4527A0"/><path d="M24 18.4c1 0 1.7.9 1.7 2.1v11.8c0 1.2-.7 2.1-1.7 2.1s-1.7-.9-1.7-2.1V20.5c0-1.2.7-2.1 1.7-2.1z" fill="#37474F"/><path d="M22.9 18.2l-2.5-3.4M25.1 18.2l2.5-3.4" stroke="#FFF8E1" stroke-width="1.8" stroke-linecap="round"/></svg>' }
];
const KRK_SINIF = [
  { i:"s-madrasa", a:"صَفّ المَدْرَسَة", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#E3F2FD"/><circle cx="24" cy="24" r="19" fill="#1E88E5"/><circle cx="24" cy="24" r="19" fill="none" stroke="#FFFFFF" stroke-width="2.4" opacity=".7"/><path d="M24 10l13 7v3H11v-3z" fill="#FFF8E1"/><rect x="13" y="20" width="22" height="14" rx="2" fill="#FFECB3"/><rect x="21" y="25" width="6" height="9" rx="1.4" fill="#1565C0"/><rect x="15.5" y="24" width="4" height="4" rx="1" fill="#1565C0"/><rect x="28.5" y="24" width="4" height="4" rx="1" fill="#1565C0"/></svg>' },
  { i:"s-taharruc", a:"صَفّ التَّخَرُّج", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#EDE7F6"/><circle cx="24" cy="24" r="19" fill="#5E35B1"/><circle cx="24" cy="24" r="19" fill="none" stroke="#FFFFFF" stroke-width="2.4" opacity=".7"/><path d="M24 12l14 6-14 6-14-6z" fill="#FFF8E1"/><path d="M15 22v7c0 3 4.5 5 9 5s9-2 9-5v-7" fill="none" stroke="#FFF8E1" stroke-width="2.6"/><path d="M37 19v9" stroke="#FFD54F" stroke-width="2.2" stroke-linecap="round"/><circle cx="37" cy="30" r="2.2" fill="#FFD54F"/></svg>' },
  { i:"s-daftar", a:"صَفّ الدَّفْتَر", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#FFF3E0"/><circle cx="24" cy="24" r="19" fill="#EF6C00"/><circle cx="24" cy="24" r="19" fill="none" stroke="#FFFFFF" stroke-width="2.4" opacity=".7"/><rect x="13" y="11" width="20" height="26" rx="2.6" fill="#FFF8E1"/><path d="M18 17h11M18 22h11M18 27h7" stroke="#EF6C00" stroke-width="1.9" stroke-linecap="round"/><rect x="11" y="11" width="4" height="26" rx="2" fill="#FFB300"/></svg>' },
  { i:"s-sabbura", a:"صَفّ السَّبّورَة", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#E8F5E9"/><circle cx="24" cy="24" r="19" fill="#2E7D32"/><circle cx="24" cy="24" r="19" fill="none" stroke="#FFFFFF" stroke-width="2.4" opacity=".7"/><rect x="11" y="12" width="26" height="18" rx="2.4" fill="#1B5E20"/><rect x="13.4" y="14.4" width="21.2" height="13.2" rx="1.4" fill="#388E3C"/><path d="M17 19h9M17 23h13" stroke="#FFF8E1" stroke-width="1.8" stroke-linecap="round"/><path d="M16 30v5M32 30v5" stroke="#8D6E63" stroke-width="2.4" stroke-linecap="round"/></svg>' },
  { i:"s-tuffaha", a:"صَفّ التُّفّاحَة", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#FFEBEE"/><circle cx="24" cy="24" r="19" fill="#C62828"/><circle cx="24" cy="24" r="19" fill="none" stroke="#FFFFFF" stroke-width="2.4" opacity=".7"/><path d="M24 15c-3-3-11-2-11 7 0 7 5 14 8 14 1.5 0 2-1 3-1s1.5 1 3 1c3 0 8-7 8-14 0-9-8-10-11-7z" fill="#FFCDD2"/><path d="M24 15v-4" stroke="#6D4C41" stroke-width="2.2" stroke-linecap="round"/><path d="M24 13c3-3 6-3 7-2 0 3-3 5-7 4z" fill="#66BB6A"/></svg>' },
  { i:"s-hafila", a:"صَفّ الحافِلَة", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#FFFDE7"/><circle cx="24" cy="24" r="19" fill="#F9A825"/><circle cx="24" cy="24" r="19" fill="none" stroke="#FFFFFF" stroke-width="2.4" opacity=".7"/><rect x="9" y="15" width="30" height="16" rx="4" fill="#FFF8E1"/><rect x="12" y="18" width="9" height="7" rx="1.6" fill="#4FC3F7"/><rect x="24" y="18" width="9" height="7" rx="1.6" fill="#4FC3F7"/><circle cx="16" cy="32" r="3.4" fill="#37474F"/><circle cx="32" cy="32" r="3.4" fill="#37474F"/><rect x="9" y="27" width="30" height="2.6" fill="#F57F17"/></svg>' },
  { i:"s-jaras", a:"صَفّ الجَرَس", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#FFF8E1"/><circle cx="24" cy="24" r="19" fill="#FFA000"/><circle cx="24" cy="24" r="19" fill="none" stroke="#FFFFFF" stroke-width="2.4" opacity=".7"/><path d="M24 11a10 10 0 0 1 10 10v7l3 4H11l3-4v-7a10 10 0 0 1 10-10z" fill="#FFF8E1"/><circle cx="24" cy="35" r="3.2" fill="#FFF8E1"/><path d="M24 8v3" stroke="#FFF8E1" stroke-width="2.4" stroke-linecap="round"/></svg>' },
  { i:"s-kura", a:"صَفّ الكُرَة الأَرْضِيَّة", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#E0F7FA"/><circle cx="24" cy="24" r="19" fill="#00838F"/><circle cx="24" cy="24" r="19" fill="none" stroke="#FFFFFF" stroke-width="2.4" opacity=".7"/><circle cx="24" cy="23" r="12" fill="#4DD0E1"/><path d="M12 23h24M24 11c4 5 4 19 0 24M24 11c-4 5-4 19 0 24" stroke="#00695C" stroke-width="1.8" fill="none"/><path d="M24 35v4M18 39h12" stroke="#FFF8E1" stroke-width="2.4" stroke-linecap="round"/></svg>' },
  { i:"s-mijhar", a:"صَفّ المِجْهَر", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#F3E5F5"/><circle cx="24" cy="24" r="19" fill="#7B1FA2"/><circle cx="24" cy="24" r="19" fill="none" stroke="#FFFFFF" stroke-width="2.4" opacity=".7"/><path d="M27 11l6 4-9 13-6-4z" fill="#FFF8E1"/><path d="M18 24l6 4-3 4-6-4z" fill="#E1BEE7"/><path d="M14 34h20" stroke="#FFF8E1" stroke-width="2.8" stroke-linecap="round"/><path d="M20 34c-3-4-2-9 2-11" stroke="#FFF8E1" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>' },
  { i:"s-alwan", a:"صَفّ الأَلْوان", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#FCE4EC"/><circle cx="24" cy="24" r="19" fill="#D81B60"/><circle cx="24" cy="24" r="19" fill="none" stroke="#FFFFFF" stroke-width="2.4" opacity=".7"/><path d="M24 11c8 0 14 5 14 11 0 4-3 5-6 5h-3c-2 0-3 1-3 3s1 2 1 3-1 2-3 2c-8 0-14-6-14-13S16 11 24 11z" fill="#FFF8E1"/><circle cx="18" cy="19" r="2.2" fill="#EF5350"/><circle cx="25" cy="17" r="2.2" fill="#42A5F5"/><circle cx="31" cy="21" r="2.2" fill="#66BB6A"/><circle cx="17" cy="27" r="2.2" fill="#FFCA28"/></svg>' },
  { i:"s-midad", a:"صَفّ المِعْداد", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#E8EAF6"/><circle cx="24" cy="24" r="19" fill="#3949AB"/><circle cx="24" cy="24" r="19" fill="none" stroke="#FFFFFF" stroke-width="2.4" opacity=".7"/><rect x="11" y="12" width="26" height="24" rx="3" fill="none" stroke="#FFF8E1" stroke-width="2.6"/><path d="M11 20h26M11 28h26" stroke="#FFF8E1" stroke-width="1.8"/><circle cx="17" cy="16" r="2.6" fill="#FF7043"/><circle cx="24" cy="16" r="2.6" fill="#FFCA28"/><circle cx="19" cy="24" r="2.6" fill="#4DD0E1"/><circle cx="30" cy="24" r="2.6" fill="#66BB6A"/><circle cx="22" cy="32" r="2.6" fill="#EC407A"/><circle cx="31" cy="32" r="2.6" fill="#FFF8E1"/></svg>' },
  { i:"s-kutub", a:"صَفّ الكُتُب", s:'<svg viewBox="0 0 48 48" class="biy-krk-svg" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="#E0F2F1"/><circle cx="24" cy="24" r="19" fill="#00695C"/><circle cx="24" cy="24" r="19" fill="none" stroke="#FFFFFF" stroke-width="2.4" opacity=".7"/><rect x="11" y="28" width="26" height="6" rx="1.6" fill="#FFF8E1"/><rect x="13" y="21" width="22" height="6" rx="1.6" fill="#FFD54F"/><rect x="15" y="14" width="18" height="6" rx="1.6" fill="#FF8A65"/><path d="M11 31h26M13 24h22M15 17h18" stroke="#00695C" stroke-width="1.2" opacity=".45"/></svg>' }
];

function krkSeti(mod){
  return mod === "takim" ? KRK_TAKIM : (mod === "okul" ? KRK_SINIF : KRK_BIREY);
}
function krkBul(id){
  if (!id) return null;
  const hepsi = KRK_BIREY.concat(KRK_TAKIM, KRK_SINIF);
  for (let i = 0; i < hepsi.length; i++) if (hepsi[i].i === id) return hepsi[i];
  return null;
}
function krkAd(id){ const k = krkBul(id); return k ? k.a : ""; }
/* Avatari isim yanina koymak icin: krkSvg("kedi", "biy-krk-mini") */
function krkSvg(id, ek){
  const k = krkBul(id);
  if (!k) return "";
  return '<span class="biy-krk ' + (ek || "") + '" title="' + k.a + '" aria-hidden="true">' + k.s + '</span>';
}

const SEVIYE_ZORLUK = { kolay: 1, orta: 2, zor: 3 };

/* ---------------- Konular ----------------
   Yeni konu eklemek için bu diziye bir nesne ekleyin:
   { id: "benzersiz-id", ad: "Konu Adı", pdf: "PDF dosya adı.pdf", sorular: [ ...soru nesneleri... ] }
   • pdf: repo kökündeki PDF dosyasının adı (boş bırakılırsa indirme/önizleme pasif olur).
   • sorular: SORULAR ile aynı biçimde; boşsa o konuda yarışma başlatılamaz.
   NOT: Soru id'leri aynı konu içinde benzersiz olmalıdır (birleşik konu da dâhil).      */
/* anahtar: index.html basligindan uniteyi tanimak icin (harekeler soyulur) */
/* Bilgi yarismasi yalnizca 2. ve 4. unite sonunda acilir.
   2. unitede ilk iki unitenin, 4. unitede butun unitelerin sorulari secilebilir.
   Baska bir unite numarasi gelirse eski davranis korunur: yalniz o unite.   */
/* Ders ve ünite adlarının Türkçesi cevrimdisi.js'teki CDTR sözlüğünden gelir;
   karşılığı yoksa özgün Arapça ad kullanılır. */
function dersAdi(k){
  const t = (window.CDTR && window.CDTR.ders && k) ? window.CDTR.ders[k.id] : null;
  return t || (k ? k.ad : "");
}
function dersAr(k){
  return (window.CDTR && window.CDTR.ders && k && window.CDTR.ders[k.id]) ? k.ad : "";
}
function uniteBasligi(u){
  const t = (window.CDTR && window.CDTR.unite && u) ? window.CDTR.unite[u.no] : null;
  return t || (u ? u.ad : "");
}
function uniteAr(u){
  return (window.CDTR && window.CDTR.unite && u && window.CDTR.unite[u.no]) ? u.ad : "";
}
const arEk = m => m ? '<i class="biy-ar-alt">' + kacis(m) + '</i>' : '';

/* Klasörün kapsamına birebir uyan "hepsi bir arada" konusu. 2. ünite
   dosyasında ilk iki ünite, 4. ünite dosyasında dördü birden. */
function kapsamTumKonu(kilit){
  const gor = gorunurUniteNolar(kilit);
  return KONULAR.find(k => k.tumUnite && Array.isArray(k.kapsam)
    && k.kapsam.length === gor.length
    && k.kapsam.every((n, i) => n === gor[i])) || null;
}
function gorunurUniteNolar(kilit){
  /* Klasör kapsamı: 2. ünite dosyasında ilk iki ünitenin BÜTÜN dersleri,
     4. ünite dosyasında dört ünitenin tamamı seçilebilir. */
  if (!kilit) return [1, 2, 3, 4];
  if (kilit === 2) return [1, 2];
  if (kilit === 4) return [1, 2, 3, 4];
  return [kilit];
}
const UNITELER = [
  { no: 1, ad: "الوَحْدَة الأولى",   alt: "ماذا فَعَلْت اليَوْم؟",
    anahtar: ["ماذا فعلت اليوم", "الوحدة الاولى", "1. ünite", "1.ünite"] },
  { no: 2, ad: "الوَحْدَة الثّانِيَة", alt: "وَقْت التَّسَوُّق",
    anahtar: ["وقت التسوق", "الوحدة الثانية", "2. ünite", "2.ünite"] },
  { no: 3, ad: "الوَحْدَة الثّالِثَة", alt: "إِلى أَيْن نُسافِر؟",
    anahtar: ["الى اين نسافر", "إلى أين نسافر", "الوحدة الثالثة", "3. ünite", "3.ünite"] },
  { no: 4, ad: "الوَحْدَة الرّابِعَة", alt: "مَدينَتي وَبَلَدي",
    anahtar: ["مدينتي وبلدي", "الوحدة الرابعة", "4. ünite", "4.ünite"] }
];
/* Arapca metni karsilastirilabilir hale getir: harekeler, tatvil ve
   elif/ye varyantlari sadelestirilir.                                  */
function arSade(t){
  return String(t == null ? "" : t)
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("tr")
    .trim();
}
/* Yol parcalarini SONDAN basa tarayarak unite numarasini bulur.
   "unite_2_oyunlar", "ünite2", "unit-2", "u2" gibi yazimlari tanir;
   "7 Ünite Oyunları" gibi ust klasorlere takilmaz.                    */
function uniteYoldan(yol){
  let t = "";
  try { t = decodeURIComponent(yol || ""); } catch(e){ t = String(yol || ""); }
  const parca = t.split(/[\/\\?#]+/).filter(Boolean);
  for (let i = parca.length - 1; i >= 0; i--){
    const s = parca[i].toLocaleLowerCase("tr");
    let m = s.match(/(?:unite|ünite|unit|vahde|wahda)[^0-9a-zçğıöşü]{0,3}([1-4])(?![0-9])/);
    if (m) return +m[1];
    m = s.match(/(?:^|[^0-9a-zçğıöşü])([1-4])[^0-9a-zçğıöşü]{0,3}(?:unite|ünite|unit)/);
    if (m) return +m[1];
    m = s.match(/^u[_\-]?([1-4])$/);
    if (m) return +m[1];
  }
  return 0;
}
/* Adres / klasor / referrer'dan uniteyi cikar (senkron denemeler). */
function uniteAlgila(){
  const gecerli = n => (n >= 1 && n <= 4) ? n : 0;
  // 1) adres parametresi: ?u=3 veya ?unite=3  (en kesin yol)
  try {
    const p = new URLSearchParams(location.search);
    const u = gecerli(+(p.get("unite") || p.get("u") || 0));
    if (u) return { no: u, kaynak: "adres" };
  } catch(e){}
  // 2) index sayfasi kendisi soyleyebilir: window.BIY_UNITE = 3
  if (gecerli(+window.BIY_UNITE)) return { no: +window.BIY_UNITE, kaynak: "sayfa" };
  // 3) bulundugu klasorun adi
  let n = uniteYoldan((location.pathname || "") + "/" + (location.hash || ""));
  if (n) return { no: n, kaynak: "klasör" };
  // 4) gelinen sayfanin adresi
  n = uniteYoldan(document.referrer || "");
  if (n) return { no: n, kaynak: "bağlantı" };
  return null;
}
/* index.html'in BASLIGINDAN unite bul (ayni sunucudaysa okunur). */
async function uniteBasliktanAlgila(){
  const r = document.referrer;
  if (!r || r.indexOf(location.origin) !== 0) return null;
  try {
    const html = await (await fetch(r, { cache: "no-store" })).text();
    const metin = arSade(html.replace(/<script[\s\S]*?<\/script>/gi, " ")
                              .replace(/<[^>]+>/g, " "));
    for (const u of UNITELER){
      if ((u.anahtar || []).some(a => metin.indexOf(arSade(a)) >= 0)) return u.no;
    }
    const tr = metin.match(/([1-4])\s*\.?\s*(ünite|unite)/);
    if (tr) return +tr[1];
  } catch(e){}
  return null;
}
const KONULAR = [
  /* ---- 1. unite ---- */
  { id: "unite1",  unite: 1, birlesik: true, ad: "كُلّ الأَسْئِلَة", pdf: "", sorular: S_UNITE1 },
  { id: "gunluk",  unite: 1, ad: "الرّوتين اليَوْمِيّ",        pdf: "", sorular: S_GUNLUK },
  { id: "yemek",   unite: 1, ad: "الطَّعام وَالشَّراب",         pdf: "", sorular: S_YEMEK },
  { id: "saat",    unite: 1, ad: "السّاعات",                  pdf: "", sorular: S_SAAT },
  { id: "gunler",  unite: 1, ad: "أَيّام الأُسْبوع",            pdf: "", sorular: S_GUNLER },
  { id: "namaz",   unite: 1, ad: "أَوْقات الصَّلاة",            pdf: "", sorular: S_NAMAZ },
  { id: "zamir",   unite: 1, ad: "الضَّمير وَالفِعْل",          pdf: "", sorular: S_ZAMIR },
  /* ---- 2. unite ---- */
  { id: "unite2",   unite: 2, birlesik: true, ad: "كُلّ الأَسْئِلَة", pdf: "", sorular: S_UNITE2 },
  { id: "market",   unite: 2, ad: "المَوادّ الغِذائِيَّة", pdf: "", sorular: S_U2_MARKET },
  { id: "sebze",    unite: 2, ad: "الخَضْراوات",          pdf: "", sorular: S_U2_SEBZE },
  { id: "meyve",    unite: 2, ad: "الفَواكِه",            pdf: "", sorular: S_U2_MEYVE },
  { id: "aded",     unite: 2, ad: "الأَعْداد وَالثَّمَن",  pdf: "", sorular: S_U2_ADED },
  { id: "mukayese", unite: 2, ad: "المُقارَنَة",           pdf: "", sorular: S_U2_MUKAYESE },
  /* ---- 3. unite ---- */
  { id: "unite3",   unite: 3, birlesik: true, ad: "كُلّ الأَسْئِلَة", pdf: "", sorular: S_UNITE3 },
  { id: "vasita",   unite: 3, ad: "وَسائِل النَّقْل",         pdf: "", sorular: S_U3_VASITA },
  { id: "mekan",    unite: 3, ad: "الأَماكِن",             pdf: "", sorular: S_U3_MEKAN },
  { id: "yon",      unite: 3, ad: "الاِتِّجاهات وَالمُرور",  pdf: "", sorular: S_U3_YON },
  { id: "mukayese3",unite: 3, ad: "المُقارَنَة بَيْن الوَسائِل", pdf: "", sorular: S_U3_MUKAYESE },
  { id: "sefer",    unite: 3, ad: "جُمَل السَّفَر",           pdf: "", sorular: S_U3_SEFER },
  /* ---- 4. unite ---- */
  { id: "unite4",   unite: 4, birlesik: true, ad: "كُلّ الأَسْئِلَة", pdf: "", sorular: S_UNITE4 },
  { id: "sehir",    unite: 4, ad: "المُدُن",               pdf: "", sorular: S_U4_SEHIR },
  { id: "konum",    unite: 4, ad: "مَواقِع المُدُن",        pdf: "", sorular: S_U4_KONUM },
  { id: "meshur",   unite: 4, ad: "تَشْتَهِرُ بِـ",          pdf: "", sorular: S_U4_MESHUR },
  { id: "saat4",    unite: 4, ad: "السّاعَة (النِّصْف وَالرُّبْع)", pdf: "", sorular: S_U4_SAAT },
  { id: "sifat",    unite: 4, ad: "الصِّفات وَالجَمْع",      pdf: "", sorular: S_U4_SIFAT },
  /* ---- 5. satir: butun unitelerin sorulari ---- */
  { id: "tumu",  unite: 0, birlesik: true, tumUnite: true, kapsam: [1,2,3,4],
    ad: "كُلّ الوَحَدات", pdf: "", sorular: S_TUMU },
  { id: "tum12", unite: 0, birlesik: true, tumUnite: true, kapsam: [1,2],
    ad: "كُلّ أَسْئِلَة الوَحْدَتَيْن", pdf: "", sorular: S_TUM12 }
];

/* ---------------- Biçime göre HTML üreticileri ---------------- */
// Önizleme / sınıf modu kartlarındaki "şıklar" alanı.
function sikKartHtml(s, dogruGoster){
  const b = bicimAl(s);
  if (b === "test"){
    let h = "";
    (s.secenekler || []).forEach((sec, i) => {
      const dogruMu = dogruGoster && i === s.dogru;
      // Yon sik metnine gore: Arapca harf varsa RTL, yoksa (Turkce cevap) LTR
      const sAr = arMi(sec);
      const sinif = "biy-secenek" + (dogruMu ? " dogru" : "") + (sAr ? " biy-arapca-secenek" : "");
      h += '<div class="'+sinif+'"><span class="biy-sik">'+String.fromCharCode(65+i)+'</span><span class="biy-secenek-metin'+(sAr?'':' biy-ltr')+'">'+kacis(sec)+'</span></div>';
    });
    return h;
  }
  const bb = BICIM_BILGI[b] || { ad: b, emoji: "❓" };
  const govde = dogruGoster ? dogruCevapMetni(s) : ("سُؤال · " + bb.ad);
  return '<div class="biy-secenek'+(dogruGoster?' dogru':'')+' biy-arapca-secenek biy-bicim-kutu">' +
         '<span class="biy-sik">'+bb.emoji+'</span><span class="biy-secenek-metin">'+kacis(govde)+'</span></div>';
}
// Yansıtılan admin tahtasındaki soru gövdesi (cevap fazı ve sonuç ekranı).
function tahtaIcerikHtml(soru, sonucMu){
  const b = bicimAl(soru);
  if (b === "test"){
    let h = "";
    (soru.secenekler || []).forEach((sec, i) => {
      const dogru = sonucMu && i === soru.dogru;
      h += '<div class="biy-a-opt'+(dogru?' dogru':'')+(arMi(sec)?' ar':' biy-ltr')+'" style="--c:'+SIK_RENK[i % SIK_RENK.length]+'">' +
           '<span class="biy-a-harf">'+String.fromCharCode(65+i)+'</span><span class="biy-a-metin">'+kacis(sec)+'</span>' +
           (dogru?'<span class="biy-a-tik">✓</span>':'') + '</div>';
    });
    return h;
  }
  if (b === "surukle"){
    const dizi = sonucMu ? (soru.parcalar || []) : (soru.karisik || soru.parcalar || []);
    return '<div class="biy-a-dizi'+(sonucMu?' dogru':'')+'">' +
      dizi.map(p => '<span class="biy-a-parca">'+kacis(p)+'</span>').join("") + '</div>' +
      (sonucMu ? '<div class="biy-a-cevapcubuk">✓ '+kacis((soru.parcalar||[]).join(" "))+'</div>' : '');
  }
  if (b === "eslestir"){
    const c = soru.ciftler || [];
    if (sonucMu){
      return '<div class="biy-a-cift dogru">' +
        c.map(x => '<div class="biy-a-cift-satir"><span class="biy-a-sol'+(arMi(x[0])?' ar':'')+'">'+kacis(x[0])+'</span><span class="biy-a-ok">→</span><span class="biy-a-sag'+(arMi(x[1])?' ar':'')+'">'+kacis(x[1])+'</span></div>').join("") +
      '</div>';
    }
    const sol = soru.sollar || c.map(x => x[0]);
    const sag = soru.sagKarisik || karistir(c.map(x => x[1]));
    return '<div class="biy-a-cift">' +
      '<div class="biy-a-sutun">'+sol.map(x => '<span class="biy-a-sol'+(arMi(x)?' ar':'')+'">'+kacis(x)+'</span>').join("")+'</div>' +
      '<div class="biy-a-sutun">'+sag.map(x => '<span class="biy-a-sag'+(arMi(x)?' ar':'')+'">'+kacis(x)+'</span>').join("")+'</div>' +
    '</div>';
  }
  if (b === "yazma"){
    const tus = soru.tusKarisik || soru.tuslar || [];
    return '<div class="biy-a-tuslar">'+tus.map(t => '<span class="biy-a-tus">'+kacis(t)+'</span>').join("")+'</div>' +
      (sonucMu ? '<div class="biy-a-cevapcubuk">✓ '+kacis(soru.cevapYazi||"")+'</div>' : '');
  }
  return "";
}
/* ---------------- Durum ---------------- */
const state = {
  mod: null, uid: null,
  bicimSecim: { "test": true, "surukle": true, "eslestir": true, "yazma": true },
  zorlukSecim: { 1: true, 2: true, 3: true },
  oyunModu: "takim",         // takim | birey | okul  (yarışma biçimi)
  bekleyenListe: [],         // birey modu: onay bekleyen katılımcılar
  katilimId: null,           // öğrenci tarafı: kendi katılımcı kaydının id'si
  katilimAbone: null,        // öğrenci tarafı: kendi kaydını dinleyen abonelik
  katilBagli: false,         // takimBagla bir kez çalıştı mı
  atildiMi: false,           // öğretmen bu cihazı yarışmadan çıkardı mı (kalıcı bayrak)
  takimNabiz: null,          // öğrenci tarafı: "hâlâ buradayım" zamanlayıcısı
  uniteNo: 1,                // seçili ünite (1-4) — konu listesi buna göre dolar
  uniteAcik: null,           // akordiyonda açık duran ünite — AÇILIŞTA HEPSİ KAPALI
  otoUnite: null,            // ünite kendiliğinden seçildiyse { no, kaynak }
  uniteKilit: null,          // klasörden gelen ünite: listede yalnız o görünür
                             // (4. ünitede ayrıca «bütün üniteler» satırı da kalır)
  sureler: { 1: SURE_VARSAYILAN[1], 2: SURE_VARSAYILAN[2], 3: SURE_VARSAYILAN[3] },  // zorluğa göre süre
  konuId: null,              // seçili konu (açılışta seçili değil)
  seviye: null,              // kolay | orta | zor  (başta seçili değil)
  sorularZ: 1,               // Sorular önizleme sekmesi (zorluk)
  soruGizli: true,           // admin ekranında soruyu gizle/göster (açılışta gizli)
  gizliIndex: -1,            // gizleme hangi soru için sıfırlandı (her yeni soruda gizlenir)
  soruSayisi: null,          // turdaki soru sayısı (başta seçili değil)
  soruSayiMax: 50,           // seçili konu+seviyedeki mevcut soruya göre üst sınır
  soruHedef: null,           // öğretmenin elle seçtiği soru sayısı = havuzun üst sınırı
  havuzVurguGorildi: false,  // havuz bölümü bir kez açıldıysa vurgu tekrarlanmaz
  secilenSet: null,          // elle seçilen soru anahtarları (Set) — havuzdan
  soruSecArama: "",          // soru havuzu arama metni
  otoSonucIndex: -1,         // tüm takımlar cevaplayınca otomatik sonuç kilidi
  odaId: null,               // admin: oda kodu
  odaTakim: null,            // takım: {oda, takim}
  takimAd: "",
  takimAbone: null, odaAboneAdmin: null, odaAbone: null, cevapAbone: null,
  ayarKilidiKapali: false,   // lobiye dönünce ayarlar (konu/seviye/soru sayısı) takım bağlıyken de açılır
  oda: null,                 // canlı oda dokümanı
  takimListe: [],            // [{id, ad, bagli, puan}]
  cevaplar: {},              // "takimId_index" -> {takimId, ad, index, secilen}
  oyunSorulari: [],          // admin: seçilen sorular (cevap dahil)
  sayacInterval: null,
  sonCevapIndex: -1,
  calisma: null,             // takım: yarım kalan cevap { index, yerlesim, secili, yazi }
  sonucAnimIndex: -1,        // sonuç ekranı animasyonu hangi soru için oynatıldı
  sonucTimerlar: [],         // sonuç ekranı adım zamanlayıcıları (temizlik için)
  finalKonfeti: false,       // yarışma bitti ekranında konfeti bir kez patlar
  baglSet: null,             // o an bağlı takım id kümesi (yeni bağlanmayı yakalamak için)
  baglIlk: false,            // ilk takım snapshot'ı işlendi mi (açılışta ses çalmamak için)
  hepsiSesIndex: -1,         // "tümü cevapladı" sesi hangi soru için çalındı
  // ---- beraberlik (yedek soru) ----
  yedekSorular: [],          // turda kullanılmayan yedek sorular
  berHedef: 0,               // beraberlik hangi sıra için (1=liderlik, 2=ikincilik)
  berTakimlar: [],           // beraberlikte yarışan takım id'leri
  berSabit: {},              // sırası kesinleşmiş takımlar { id: sıra }
  berNo: 0,                  // kaçıncı yedek soru
  berSorular: [],            // sorulan yedek soru index'leri
  berOtoIndex: -1,           // (kullanılmıyor)
  yedekSoruMap: {}           // { index: soru }  yedek soruların puan hesabı için
};

/* ---------------- Ses (sinüs dalgası — Web Audio) ---------------- */
const SES = {
  ctx: null,
  _ac(){
    try {
      if (!this.ctx){ const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; this.ctx = new AC(); }
      if (this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    } catch(e){ return null; }
  },
  _ton(ac, freq, t0, sure, kazanc){
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(kazanc, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + sure);
    o.connect(g); g.connect(ac.destination);
    o.start(t0); o.stop(t0 + sure + 0.03);
  },
  _cal(notalar, kazanc){
    const ac = this._ac(); if (!ac) return;
    const now = ac.currentTime + 0.01;
    notalar.forEach(n => this._ton(ac, n.f, now + (n.t || 0), n.d || 0.15, (n.g || kazanc || 0.14)));
  },
  baglandi(){ this._cal([{f:659,t:0,d:0.12},{f:988,t:0.10,d:0.18}], 0.13); },                          // takım bağlandı: yükselen ding
  cevapGeldi(){ this._cal([{f:880,t:0,d:0.08},{f:1175,t:0.06,d:0.11}], 0.10); },                       // bir cevap geldi: kısa blip
  hepsiCevap(){ this._cal([{f:523,t:0,d:0.11},{f:659,t:0.09,d:0.11},{f:784,t:0.18,d:0.20}], 0.13); },  // tümü cevapladı: do-mi-sol
  sonuc(){ this._cal([{f:392,t:0,d:0.14},{f:587,t:0.12,d:0.24}], 0.15); },                              // sonuç ekranı açıldı
  siraDegisti(){ this._cal([{f:494,t:0,d:0.10},{f:740,t:0.08,d:0.10},{f:988,t:0.16,d:0.20}], 0.12); }   // sıralama değişti: hızlı yükseliş
};
// ilk kullanıcı hareketinde ses bağlamını aç (tarayıcı otomatik oynatma kısıtı)
["pointerdown","keydown","touchstart"].forEach(ev => window.addEventListener(ev, () => SES._ac(), { passive: true }));
// Etiket rozetine dokununca adi kucuk bir balonda goster (tablette tooltip yok).
document.addEventListener("click", function(e){
  const eski = document.querySelector(".biy-et-balon");
  if (eski) eski.remove();
  const et = e.target.closest && e.target.closest(".biy-etiket");
  if (!et) return;
  const ad = et.getAttribute("title"); if (!ad) return;
  const b = document.createElement("div");
  b.className = "biy-et-balon"; b.textContent = ad;
  const r = et.getBoundingClientRect();
  b.style.left = (r.left + r.width / 2) + "px";
  b.style.top = (r.bottom + 8) + "px";
  document.body.appendChild(b);
  setTimeout(() => { if (b.parentNode) b.remove(); }, 1800);
});


/* ---------------- Yardımcılar ---------------- */
function $(id){ return document.getElementById(id); }
function ekranGoster(id){
  document.querySelectorAll(".biy-ekran").forEach(e => e.classList.add("gizli"));
  const el = $(id); if (el) el.classList.remove("gizli");
  // çıkış tuşu yalnızca canlı oyun ekranında görünür
  const cik = $("cikisTus"); if (cik) cik.classList.toggle("gizli", id !== "ekranOyunAdmin");
}
function kacis(t){ const d = document.createElement("div"); d.textContent = t == null ? "" : String(t); return d.innerHTML; }
function rastgeleKod(uzunluk){
  const harf = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = ""; for (let i=0;i<uzunluk;i++) s += harf[Math.floor(Math.random()*harf.length)];
  return s;
}
function takimLinki(oda, takim){
  return location.origin + location.pathname + "?oda=" + encodeURIComponent(oda) + "&takim=" + encodeURIComponent(takim);
}
/* Birey/Okul modunda tek bir bağlantı herkese yeter: takım parametresi yok. */
function odaLinki(oda){
  return location.origin + location.pathname + "?oda=" + encodeURIComponent(oda);
}
/* ---- Yarışma modları ----
   takim : öğretmen takım adlarını yazar, her takım kendi karekodunu okutur (eski davranış)
   birey : tek karekod, herkes kendi adını yazar, öğretmen onaylar
   okul  : tek karekod, öğrenci adını yazar + sınıfını seçer, sınıflar ORTALAMA puanla yarışır  */
const MOD_BILGI = {
  takim: { ad: "Takım sistemi", emoji: "👥", kisi: "Takım", cog: "Takımlar",      baslik: "Takımları oluştur ve bekle" },
  birey: { ad: "Bireysel sistem", emoji: "🙋", kisi: "Katılımcı",  cog: "Katılımcılar", baslik: "Katılımcılar ve bekleme" },
  okul:  { ad: "Sınıf sistemi",  emoji: "🏫", kisi: "Sınıf", cog: "Sınıflar",      baslik: "Sınıfları oluştur ve bekle" }
};
function modAl(){ return MOD_BILGI[state.oyunModu] ? state.oyunModu : "takim"; }
function tekKarekod(){ return modAl() === "birey"; }   // yalnız birey: tek ortak karekod
function kartliMod(){ return modAl() !== "birey"; }    // takım & okul: her katılımcıya ayrı karekod
function kisiSozu(){ return (MOD_BILGI[modAl()] || MOD_BILGI.takim).kisi; }
function cogSozu(){ return (MOD_BILGI[modAl()] || MOD_BILGI.takim).cog; }

/* ---- Ozel SVG simgeleri (emoji yerine) ------------------------------- */
const SIMGELER = {
  "⏳": '<circle class="biy-hale" cx="32" cy="32" r="27" fill="url(#biyGrTuruncu)" opacity=".14"/>' +
    '<g class="biy-sv-kum" fill="none" stroke="url(#biyGrTuruncu)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">' +
      '<path d="M20 12h24M20 52h24"/><path d="M22 12v6l10 14 10-14v-6"/><path d="M22 52v-6l10-14 10 14v6"/></g>' +
    '<circle class="biy-sv-tane" cx="32" cy="33" r="2.6" fill="url(#biyGrTuruncu)"/>',
  "✅": '<circle class="biy-hale" cx="32" cy="32" r="27" fill="url(#biyGrYesil)" opacity=".18"/>' +
    '<circle cx="32" cy="32" r="21" fill="none" stroke="url(#biyGrYesil)" stroke-width="3.5" class="biy-sv-halka"/>' +
    '<path class="biy-sv-tik" d="M21 33l8 8 15-16" fill="none" stroke="url(#biyGrYesil)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>',
  "❌": '<circle class="biy-hale" cx="32" cy="32" r="27" fill="#ef4444" opacity=".14"/>' +
    '<circle cx="32" cy="32" r="21" fill="none" stroke="#ef4444" stroke-width="3.5"/>' +
    '<g class="biy-sv-carpi" stroke="#ef4444" stroke-width="4.5" stroke-linecap="round"><line x1="24" y1="24" x2="40" y2="40"/><line x1="40" y1="24" x2="24" y2="40"/></g>',
  "⚠️": '<circle class="biy-hale" cx="32" cy="32" r="27" fill="url(#biyGrTuruncu)" opacity=".16"/>' +
    '<path d="M32 12 55 52H9z" fill="none" stroke="url(#biyGrTuruncu)" stroke-width="3.5" stroke-linejoin="round"/>' +
    '<g class="biy-sv-uyari" stroke="url(#biyGrTuruncu)" stroke-width="4" stroke-linecap="round"><line x1="32" y1="27" x2="32" y2="38"/><line x1="32" y1="45" x2="32" y2="45"/></g>',
  "🎉": '<circle class="biy-hale" cx="32" cy="32" r="27" fill="url(#biyGrMor)" opacity=".16"/>' +
    '<path d="M14 52 30 20l14 14z" fill="url(#biyGrMor)" opacity=".85"/>' +
    '<g class="biy-sv-serpme" stroke-linecap="round" stroke-width="3.5">' +
      '<line x1="44" y1="14" x2="49" y2="9" stroke="#f59e0b"/><line x1="50" y1="24" x2="57" y2="23" stroke="#10b981"/>' +
      '<line x1="38" y1="9" x2="39" y2="3" stroke="#ef4444"/><line x1="52" y1="34" x2="58" y2="37" stroke="#3b82f6"/></g>',
  "🏅": '<circle class="biy-hale" cx="32" cy="32" r="27" fill="url(#biyGrTuruncu)" opacity=".16"/>' +
    '<g class="biy-sv-kurdele"><path d="M22 8l8 18-8 4-4-16z" fill="url(#biyGrMavi)"/><path d="M42 8l-8 18 8 4 4-16z" fill="url(#biyGrMor)"/></g>' +
    '<circle class="biy-sv-madalya" cx="32" cy="42" r="14" fill="url(#biyGrTuruncu)"/>' +
    '<circle cx="32" cy="42" r="9" fill="none" stroke="#fff" stroke-width="2.5" opacity=".85"/>',
  "🏁": '<circle class="biy-hale" cx="32" cy="32" r="27" fill="url(#biyGrMavi)" opacity=".14"/>' +
    '<line x1="18" y1="10" x2="18" y2="54" stroke="url(#biyGrMavi)" stroke-width="3.5" stroke-linecap="round"/>' +
    '<g class="biy-sv-bayrak"><rect x="18" y="12" width="28" height="20" fill="url(#biyGrMavi)" opacity=".25"/>' +
      '<rect x="18" y="12" width="7" height="10" fill="url(#biyGrMavi)"/><rect x="32" y="12" width="7" height="10" fill="url(#biyGrMavi)"/>' +
      '<rect x="25" y="22" width="7" height="10" fill="url(#biyGrMavi)"/><rect x="39" y="22" width="7" height="10" fill="url(#biyGrMavi)"/></g>',
  "📺": '<circle class="biy-hale" cx="32" cy="32" r="27" fill="url(#biyGrMavi)" opacity=".14"/>' +
    '<rect x="10" y="20" width="44" height="30" rx="4" fill="none" stroke="url(#biyGrMavi)" stroke-width="3.5"/>' +
    '<path d="M22 12l10 8 10-8" fill="none" stroke="url(#biyGrMavi)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<rect class="biy-sv-parlama" x="14" y="24" width="10" height="22" fill="#fff" opacity=".5"/>',
  "✋": '<circle class="biy-hale" cx="32" cy="32" r="27" fill="#ef4444" opacity=".14"/>' +
    '<g class="biy-sv-el" fill="none" stroke="#ef4444" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M24 30V14M32 30V10M40 30V14"/><path d="M18 30v10a16 16 0 0 0 16 16h2a12 12 0 0 0 12-12V24"/></g>',
  "🚪": '<circle class="biy-hale" cx="32" cy="32" r="27" fill="url(#biyGrMor)" opacity=".14"/>' +
    '<rect x="16" y="10" width="32" height="44" rx="3" fill="none" stroke="url(#biyGrMor)" stroke-width="3.5"/>' +
    '<circle class="biy-sv-kol" cx="40" cy="33" r="2.8" fill="url(#biyGrMor)"/>',
  "🏆": '<circle class="biy-hale" cx="32" cy="32" r="27" fill="url(#biyGrTuruncu)" opacity=".18"/>' +
    '<path class="biy-sv-kupa" d="M22 10h20v14a10 10 0 0 1-20 0z" fill="url(#biyGrTuruncu)"/>' +
    '<path d="M22 14h-6a6 6 0 0 0 6 6M42 14h6a6 6 0 0 1-6 6" fill="none" stroke="url(#biyGrTuruncu)" stroke-width="3" stroke-linecap="round"/>' +
    '<rect x="29" y="34" width="6" height="10" fill="url(#biyGrTuruncu)"/><rect x="20" y="44" width="24" height="6" rx="2" fill="url(#biyGrTuruncu)"/>' +
    '<g class="biy-sv-parilti" fill="#fff"><circle cx="16" cy="26" r="2"/><circle cx="49" cy="30" r="1.6"/><circle cx="45" cy="8" r="1.6"/></g>'
};
function simge(e){
  const ic = SIMGELER[e];
  if (!ic) return e;
  return '<span class="biy-anim"><svg viewBox="0 0 64 64" class="biy-svg" aria-hidden="true">' + ic + '</svg></span>';
}


/* ---- Uygunsuz isim süzgeci ----
   Öğrenci kendi ismini yazdığı için basit bir denetim gerekiyor. Aşağıdaki liste
   yalnızca ilk süzgeç; son söz her zaman öğretmende (onay + düzelt + çıkar).     */
const YASAK_TAM = ["am","aq","mk","amk","ock","oc","göt","got","sik","sok","mal","bok","döl","dol",
  "piç","pic","31","otuzbir","ibne","ipne","seks","sex","salak","aptal","hıyar","hiyar","eşek","esek",
  "gerizekali","gerizekalı","şerefsiz","serefsiz","yavşak","yavsak","oç"];
const YASAK_PARCA = ["orospu","oruspu","orspu","kahpe","pezevenk","gavat","yarrak","yarak","siktir","sikey",
  "sikik","sikim","amina","amına","amcık","amcik","anani","ananı","ananin","götver","gotver","göddd",
  "puşt","pust","kaltak","sürtük","surtuk","dallama","porno","penis","vajina","taşak","tasak","boktan",
  "sperm","mastur","pezo","kancık","kancik","fuck","shit","bitch","pussy","dick","nigg"];
function isimNormal(t){
  let s = String(t || "").toLocaleLowerCase("tr");
  s = s.replace(/[0o]/g,"o").replace(/1|!|\|/g,"i").replace(/3/g,"e").replace(/4/g,"a")
       .replace(/5|\$/g,"s").replace(/7/g,"t").replace(/@/g,"a").replace(/8/g,"b");
  s = s.replace(/[^a-zçğıöşü ]+/g," ");
  s = s.replace(/(.)\1{2,}/g,"$1$1");          // aaaa -> aa
  return s.replace(/\s+/g," ").trim();
}
function isimTemizle(t){
  return String(t || "").replace(/\s+/g," ").trim().slice(0, 18);
}
/* uygunsa "" döner, değilse kullanıcıya gösterilecek sebebi döner */
function isimSorunu(ad){
  const ham = isimTemizle(ad);
  if (ham.length < 2) return "اُكْتُب اسْمَك بِحَرْفَيْن عَلى الأَقَلّ.";
  if (!/[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(ham)) return "يَجِبُ أَنْ يَكونَ في الاسْم حُروف.";
  const n = isimNormal(ham);
  const kelimeler = n.split(" ").filter(Boolean);
  for (const k of kelimeler){ if (YASAK_TAM.indexOf(k) >= 0) return "هَذا الاسْم غَيْر مُناسِب، اُكْتُب اسْمَك الحَقيقِيّ."; }
  const bitisik = n.replace(/ /g,"");
  for (const p of YASAK_PARCA){ if (bitisik.indexOf(p) >= 0) return "هَذا الاسْم غَيْر مُناسِب، اُكْتُب اسْمَك الحَقيقِيّ."; }
  return "";
}
/* aynı isimden ikinci kişi gelirse "Ahmet (2)" yapılır */
function isimBenzersiz(ad, mevcutAdlar){
  const kucuk = a => String(a||"").toLocaleLowerCase("tr").trim();
  const set = new Set((mevcutAdlar||[]).map(kucuk));
  if (!set.has(kucuk(ad))) return ad;
  let i = 2; while (set.has(kucuk(ad + " (" + i + ")")) && i < 40) i++;
  return ad + " (" + i + ")";
}
function temizSoru(s){  // takıma gidecek hâli — DOĞRU CEVAP YOK
  const b = bicimAl(s);
  const o = { tip: s.tip, bicim: b, zorluk: s.zorluk, soru: s.soru, arapca: s.arapca || null };
  if (b === "surukle"){
    o.karisik = s.karisik || karistir(s.parcalar);
  } else if (b === "eslestir"){
    o.sollar     = s.sollar     || (s.ciftler || []).map(c => c[0]);
    o.sagKarisik = s.sagKarisik || karistir((s.ciftler || []).map(c => c[1]));
  } else if (b === "yazma"){
    o.tusKarisik = s.tusKarisik || karistir(s.tuslar);
    o.harfSayi   = String(s.cevapYazi || "").replace(/\s+/g, "").length;
  } else {
    o.secenekler = s.secenekler;
    o.arSecenek  = !!s.arSecenek;
  }
  return o;
}
function soruHazirla(s){  // biçime göre karıştırma (doğru cevap hep aynı yerde olmasın)
  const b = bicimAl(s);
  if (b === "surukle"){
    const p = s.parcalar || [];
    let k = karistir(p);
    if (p.length > 1 && k.join("|") === p.join("|")) k = k.slice().reverse();
    return Object.assign({}, s, { karisik: k });
  }
  if (b === "eslestir"){
    const c = karistir(s.ciftler || []);
    let sag = karistir(c.map(x => x[1]));
    if (c.length > 1 && sag.join("|") === c.map(x => x[1]).join("|")) sag = sag.slice().reverse();
    return Object.assign({}, s, { ciftler: c, sollar: c.map(x => x[0]), sagKarisik: sag });
  }
  if (b === "yazma"){
    return Object.assign({}, s, { tusKarisik: karistir(s.tuslar || []) });
  }
  const idx = s.secenekler.map((_, i) => i);
  for (let i = idx.length-1; i > 0; i--){ const j = Math.floor(Math.random()*(i+1)); const g = idx[i]; idx[i] = idx[j]; idx[j] = g; }
  return Object.assign({}, s, { secenekler: idx.map(i => s.secenekler[i]), dogru: idx.indexOf(s.dogru) });
}
function tsMillis(ts){
  if (!ts) return null;
  if (ts.toMillis) return ts.toMillis();
  if (ts.seconds != null) return ts.seconds*1000;
  return null;
}
function duraklatiliyorMu(){ const o = state.oda; return !!(o && o.duraklatildi); }
function kalanSaniye(){
  const o = state.oda; if (!o) return SORU_SURESI;
  const sure = o.soruSuresi || SORU_SURESI;
  // duraklatildiysa sayaç donar: kaydedilen kalan süre gösterilir
  if (o.duraklatildi) return Math.max(0, Math.round(o.duraklatKalan != null ? o.duraklatKalan : sure));
  const bas = tsMillis(o.soruBaslangic);
  if (bas == null) return sure;
  return Math.max(0, Math.ceil(sure - (o.gecenEk || 0) - (Date.now() - bas)/1000));
}
/* Durdur / Devam ikonlari (yazi yok — animasyonlu SVG) */
const _SVG_DURDUR =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
  '<circle class="biy-dr-halka" cx="12" cy="12" r="10.4" stroke-dasharray="10 6" stroke-linecap="round"/>' +
  '<g class="biy-dr-cubuk" fill="currentColor" stroke="none">' +
  '<rect x="8" y="7.4" width="2.9" height="9.2" rx="1.2"/><rect x="13.1" y="7.4" width="2.9" height="9.2" rx="1.2"/>' +
  '</g></svg>';
const _SVG_DEVAM =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
  '<circle class="biy-dr-halka" cx="12" cy="12" r="10.4" stroke-dasharray="10 6" stroke-linecap="round"/>' +
  '<path class="biy-dr-ok" fill="currentColor" stroke="none" d="M9.6 7.3l7 4.7-7 4.7z"/></svg>';
function sayacBaslat(render){
  sayacDurdur();
  state.sayacInterval = setInterval(render, 400);
}
function sayacDurdur(){ if (state.sayacInterval){ clearInterval(state.sayacInterval); state.sayacInterval = null; } }

/* ===========================================================
   BIY
   =========================================================== */
const BIY = {

  anasayfa(){ sayacDurdur(); ekranGoster("ekranAnasayfa"); BIY._menuDurum(); },

  // Geri: dosyadan çık. Bağlı cihaz varsa onay iste; çıkışta odayı kapat (cihazlar ayrılsın).
  geriDon(){
    if (state.odaId && (state.takimListe || []).some(t => t.bagli)){
      BIY._onay("Çıkmak istiyor musun?", "Bağlı cihazlar var — çıkarsan bağlantıları kopar.", "Evet, çık", function(){ BIY._geriCik(); });
      return;
    }
    BIY._geriCik();
  },
  async _geriCik(){
    if (state.odaId){
      try { await db.collection(KOLEKSIYON).doc(state.odaId).update({ durum: "bitti", sonSira: [] }); } catch(e){}
      try { if (state.odaAboneAdmin) state.odaAboneAdmin(); if (state.cevapAbone) state.cevapAbone(); if (state.takimAbone) state.takimAbone(); } catch(e){}
      BIY._temizleKayit();
    }
    /* Bu dosya 1. unite oyunlari klasorunde duruyor; geri tusu oyun listesine
       (index.html) doner. Ayni klasorde oldugu icin goreli adres yeterli.     */
    location.href = "index.html";
  },

  /* ---------- Konu seçimi ---------- */
  _aktifKonu(){ return state.konuId ? (KONULAR.find(k => k.id === state.konuId) || null) : null; },
  _aktifSorular(){ const k = BIY._aktifKonu(); return (k && k.sorular) || []; },
  _konuVurgu(){
    const sel = $("konuSecim"); if (sel){ sel.classList.toggle("secili", !!state.konuId); sel.value = state.konuId || ""; }
    const k = BIY._aktifKonu();
    const ad = $("konuSeciciAd");
    if (ad) ad.textContent = (k && k.tumUnite) ? k.ad
                           : (BIY._uniteAdi() + " · " + (k ? dersAdi(k) : "Ders seç\u2026"));
    const btn = $("konuSeciciBtn"); if (btn) btn.classList.toggle("secili", !!state.konuId);
    document.querySelectorAll("#konuSeciciListe .biy-ds-oge, #konuSeciciListe .biy-ak-tum").forEach(o => {
      const s = o.getAttribute("data-konu") === state.konuId;
      o.classList.toggle("secili", s); o.setAttribute("aria-selected", s ? "true" : "false");
    });
  },
  /* ---- ders secimi: sistemin listesi degil, kendi acilir panelimiz ---- */
  konuListeAc(){
    const btn = $("konuSeciciBtn"), l = $("konuSeciciListe");
    if (!btn || !l || btn.disabled) return;
    if (!l.hidden){ BIY.konuListeKapat(); return; }
    l.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    btn.classList.add("biy-ds-acik");
    document.addEventListener("mousedown", BIY._konuListeDis);
    document.addEventListener("keydown", BIY._konuListeTus);
    BIY._konuListeYerlestir();
    const s = l.querySelector(".biy-ds-oge.secili"); if (s) s.scrollIntoView({ block: "nearest" });
  },
  /* Liste pencereden taşmasın: hangi tarafta yer varsa oraya açılsın ve
     boyu o alana göre kısılsın; son satır hep görünür kalsın. */
  _konuListeYerlestir(){
    const btn = $("konuSeciciBtn"), l = $("konuSeciciListe");
    if (!btn || !l || l.hidden) return;
    const r = btn.getBoundingClientRect();
    const ust = r.top - 20;
    const alt = window.innerHeight - r.bottom - 20;
    const yukari = alt < 260 && ust > alt;
    l.classList.toggle("biy-ds-yukari", yukari);
    l.style.maxHeight = Math.max(200, Math.floor(yukari ? ust : alt)) + "px";
  },
  konuListeKapat(){
    const btn = $("konuSeciciBtn"), l = $("konuSeciciListe");
    if (l) l.hidden = true;
    if (btn){ btn.setAttribute("aria-expanded", "false"); btn.classList.remove("biy-ds-acik"); }
    document.removeEventListener("mousedown", BIY._konuListeDis);
    document.removeEventListener("keydown", BIY._konuListeTus);
  },
  _konuListeDis(e){ if (!e.target.closest || !e.target.closest("#konuSecici")) BIY.konuListeKapat(); },
  _konuListeTus(e){ if (e.key === "Escape" || e.key === "Esc") BIY.konuListeKapat(); },
  // tüm konulardaki soruların havuzu (elle seçim için)
  /* ---- Havuzun kapsamı: SEÇİLİ LİSTE ----
     Öğretmen bir ünitenin "tüm soruları"nı seçtiyse havuzda o ünitenin
     dersleri; tek bir ders seçtiyse yalnız o ders; "bütün üniteler"i
     seçtiyse hepsi görünür. Hiç seçim yoksa açık duran ünite esas alınır. */
  _havuzKapsam(){
    const altlar = u => KONULAR.filter(k => k.unite === u && !k.birlesik);
    const k = BIY._aktifKonu();
    if (k){
      if (k.tumUnite){
        const kap = Array.isArray(k.kapsam) ? k.kapsam : null;
        return KONULAR.filter(x => !x.birlesik && (!kap || kap.indexOf(x.unite) >= 0));
      }
      if (k.birlesik) return altlar(k.unite);
      return [k];
    }
    return altlar(state.uniteAcik || state.uniteNo || 1);
  },
  _havuzKapsamAdi(){
    const k = BIY._aktifKonu();
    if (k) return k.tumUnite ? dersAdi(k) : (k.birlesik ? BIY._uniteAdi(k.unite) : dersAdi(k));
    return BIY._uniteAdi(state.uniteAcik || state.uniteNo || 1);
  },
  _soruHavuzu(){
    const havuz = [];
    BIY._havuzKapsam().forEach(k => {
      BIY._konuSorulari(k).forEach(q => havuz.push({ key: k.id + "#" + q.id, konuId: k.id, konuAd: k.ad, soru: q }));
    });
    return havuz;
  },
  /* ---------- Ünite seçimi (konu listesinden ÖNCE gelir) ---------- */
  /* DIKKAT: "tumu" konusunun unite alani 0 — (k.unite || 1) yazilirsa 1. uniteye
     dusuyordu. Bu yuzden acikca null denetimi yapiliyor ve tumUnite disarida. */
  /* Bir konunun SUZGECTEN GECEN sorulari */
  _konuSorulari(k){ return (k && Array.isArray(k.sorular)) ? k.sorular.filter(suzgectenGecti) : []; },
  /* Süzgeçten geçmeyenler dâhil, konudaki bütün sorular. Havuz listesinde
     soluk ve seçilemez olarak gösterilirler. */
  _konuTumSorulari(k){ return (k && Array.isArray(k.sorular)) ? k.sorular.slice() : []; },
  _uniteKonulari(no){
    const u = no || state.uniteNo || 1;
    return KONULAR.filter(k => !k.tumUnite && (k.unite == null ? 1 : k.unite) === u);
  },
  _uniteSoruSayisi(no){
    const b = KONULAR.find(k => !k.tumUnite && (k.unite == null ? 1 : k.unite) === no && k.birlesik);
    return b ? BIY._konuSorulari(b).length
             : BIY._uniteKonulari(no).reduce((t, k) => t + BIY._konuSorulari(k).length, 0);
  },
  _uniteAdi(no){ const u = UNITELER.find(x => x.no === (no || state.uniteNo)); return u ? uniteBasligi(u) : ""; },
  /* ---- "Ders seç" paneli: 5 satırlık akordiyon ----
     1-4 → ünite başlıkları (büyük, sağa yaslı); açılınca o ünitenin dersleri.
     5   → bütün ünitelerin soruları (tek dokunuşla seçilir).            */
  _akordiyonHtml(){
    const ok = '<svg class="biy-ak-ok" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
             + ' stroke-width="3" stroke-linecap="round" stroke-linejoin="round">'
             + '<polyline points="6 9 12 15 18 9"/></svg>';
    const tik = '<svg class="biy-ds-tik" viewBox="0 0 24 24" aria-hidden="true" fill="none"'
              + ' stroke="currentColor" stroke-width="3.4" stroke-linecap="round"'
              + ' stroke-linejoin="round"><polyline points="4 12.5 9.5 18 20 6.5"/></svg>';
    /* Klasörden gelen ünite varsa liste ona kilitlenir: yalnız o ünitenin
       satırı görünür. 4. ünitede ek olarak «bütün üniteler» satırı da kalır. */
    const kilit = state.uniteKilit;
    const gor = gorunurUniteNolar(kilit);
    const satirlar = UNITELER.filter(u => gor.indexOf(u.no) >= 0);
    const tumKonu = kapsamTumKonu(kilit);
    let h = '<div class="biy-ak' + (kilit ? ' biy-ak-kilitli' : '') + '">';
    satirlar.forEach(u => {
      const acik = (state.uniteAcik === u.no);
      const kon = BIY._uniteKonulari(u.no);
      const icinde = kon.some(k => k.id === state.konuId);
      h += '<div class="biy-ak-satir' + (acik ? ' acik' : '') + (icinde ? ' iceriden' : '') + '" data-u="' + u.no + '">'
        + '<button type="button" class="biy-ak-bas" data-u="' + u.no + '"'
        +   ' aria-expanded="' + (acik ? 'true' : 'false') + '" title="' + kacis(u.alt) + '">'
        +   '<span class="biy-ak-ad">' + kacis(uniteBasligi(u)) + arEk(uniteAr(u)) + '</span>'
        +   '<span class="biy-ak-say">' + BIY._uniteSoruSayisi(u.no) + '</span>'
        +   ok
        + '</button>'
        + '<div class="biy-ak-govde">'
        +   kon.map((k, i) =>
              '<button type="button" role="option" style="--i:' + i + '" data-konu="' + kacis(k.id) + '"'
              + (k.pasif ? ' disabled aria-disabled="true"' : '')
              + ' class="biy-ds-oge' + (k.pasif ? ' biy-ds-pasif' : '') + (k.id === state.konuId ? ' secili' : '') + '">'
              + '<span class="biy-ds-ad2">' + kacis(dersAdi(k)) + arEk(dersAr(k)) + '</span>'
              + '<span class="biy-ds-say2">' + BIY._konuSorulari(k).length + '</span>'
              + (k.pasif ? '<span class="biy-ds-yakinda">yakında</span>' : tik)
              + '</button>').join("")
        + '</div></div>';
    });
    /* Yanlış tahmin çıkmaza sokmasın: kilitliyken diğer ünitelere geçiş */
    if (kilit && satirlar.length === 1){
      h += '<button type="button" class="biy-ak-ac" onclick="BIY.kilidiAc()">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"'
        + ' stroke-linecap="round" stroke-linejoin="round">'
        + '<rect x="4" y="10.5" width="16" height="10" rx="2.5"/>'
        + '<path d="M8 10.5V7.6a4 4 0 0 1 7.5-1.9"/></svg>'
        + '<span>Diğer üniteler</span></button>';
    }
    const t = (satirlar.length > 1) ? tumKonu : null;
    if (t){
      h += '<button type="button" class="biy-ak-bas biy-ak-tum' + (state.konuId === t.id ? ' secili' : '') + '"'
         + ' data-konu="' + t.id + '">'
         + '<span class="biy-ak-ad">' + kacis(dersAdi(t)) + arEk(dersAr(t)) + '</span>'
         + '<span class="biy-ak-say">' + BIY._konuSorulari(t).length + '</span>'
         + tik + '</button>';
    }
    return h + '</div>';
  },
  /* ---- MOD KAPISI ----------------------------------------------------
     Öğretmen dosyayı açtığında iki yol sunulur: internet gerektiren canlı
     yarışma ve sınıf içinde kâğıt + ekranla yürüyen çevrimdışı mod.      */
  _modKapisi(){
    const not = $("modUniteNot");
    if (not){
      const u = UNITELER.find(x => x.no === (state.uniteKilit || state.uniteNo));
      const gor = gorunurUniteNolar(state.uniteKilit);
      const tr = (window.CDTR && window.CDTR.unite && u) ? window.CDTR.unite[u.no] : null;
      not.textContent = (tr || (u ? u.ad + " · " + u.alt : ""))
        + (gor.length > 1 ? "  ·  " + gor.length + " ünitelik soru havuzu" : "");
    }
    ekranGoster("ekranMod");
  },
  modSec(hangi){
    /* İki mod da aynı kurulum sayfasına girer; fark yalnız son adımda. */
    if (window.COFF){ COFF.ac(hangi === "canli" ? "canli" : "cevrimdisi"); return; }
    ekranGoster("ekranAnasayfa");
  },
  modaDon(){ BIY._modKapisi(); },

  /* Ünite kilidini kaldır: bütün üniteler yeniden listelenir. */
  kilidiAc(){
    state.uniteKilit = null;
    const n = $("otoUniteNot"); if (n) n.remove();
    BIY._konulariHazirla();
  },
  /* akordiyon başlığı: aynı satıra tekrar basılırsa kapanır */
  uniteAc(no){
    if (state.uniteAcik === no){ state.uniteAcik = null; BIY._konulariHazirla(); return; }
    state.uniteAcik = no;
    if (no !== state.uniteNo) BIY.uniteSec(no); else BIY._konulariHazirla();
  },
  /* Ünite kendiliğinden seçildiğinde kısa bir bilgi şeridi göster. */
  _otoUniteUygula(no, kaynak){
    if (!(no >= 1 && no <= 4)) return;
    state.uniteNo = no; state.uniteAcik = no; state.uniteKilit = no;
    state.otoUnite = { no: no, kaynak: kaynak };
    BIY._konulariHazirla();
    BIY.konuSec("unite" + no);          // o ünitenin tüm soruları hazır seçili gelsin
    BIY._otoUniteNot();
  },
  _otoUniteNot(){
    const o = state.otoUnite; if (!o) return;
    const eski = $("otoUniteNot"); if (eski) eski.remove();
    const panel = document.querySelector("#ekranAnasayfa .biy-konu-panel"); if (!panel) return;
    const el = document.createElement("div");
    el.id = "otoUniteNot"; el.className = "biy-oto-not";
    el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"'
      + ' stroke-linecap="round" stroke-linejoin="round"><path d="M20 6.5L9.4 17.1 4.5 12.2"/></svg>'
      + '<span>' + kacis(BIY._uniteAdi(o.no)) + ' — kendiliğinden seçildi</span>'
      + '<button type="button" class="biy-oto-degis" onclick="BIY.kilidiAc()">Değiştir</button>';
    panel.insertAdjacentElement("afterend", el);
    setTimeout(() => { if (el.parentNode){ el.classList.add("biy-gec"); setTimeout(() => el.remove(), 600); } }, 5200);
  },
  uniteSec(no){
    if (!no) return;
    if (no === state.uniteNo && state.uniteAcik === no) return;
    state.uniteNo = no;
    state.uniteAcik = no;
    try { localStorage.setItem("biy_unite", String(no)); } catch(e){}
    state.konuId = null;                      // ünite değişti → konu ve havuz sıfırlanır
    const set = BIY._secSet(); if (set.size) set.clear();
    state.soruSayisi = null; state.soruSayiHavuzdan = false;
    BIY._konulariHazirla();
    BIY._soruSecSayiGuncelle();
    BIY._soruSayiSinir();
    BIY._menuDurum();
  },
  _konulariHazirla(){
    const KON = BIY._uniteKonulari();
    const sel = $("konuSecim"); if (!sel) return;
    sel.innerHTML = '<option value=""'+(state.konuId?'':' selected')+' disabled hidden>Ders seç…</option>' +
      KON.concat((gorunurUniteNolar(state.uniteKilit).length > 1 && kapsamTumKonu(state.uniteKilit))
                   ? [kapsamTumKonu(state.uniteKilit)] : [])
         .map(k => '<option value="'+k.id+'"'+(k.pasif?' disabled':'')+(k.id===state.konuId?' selected':'')+'>'+kacis(dersAdi(k))+(k.pasif?' · yakında':'')+'</option>').join("");
    if (!state.konuId) sel.value = "";
    const liste = $("konuSeciciListe");
    if (liste){
      liste.innerHTML = BIY._akordiyonHtml();
      if (!liste.dataset.baglandi){
        liste.dataset.baglandi = "1";
        liste.addEventListener("click", (e) => {
          // ünite başlığı: akordiyonu aç/kapat, panel açık kalır
          const bas = e.target.closest(".biy-ak-bas");
          if (bas){
            const kid = bas.getAttribute("data-konu");
            if (kid){ BIY.konuSec(kid); BIY.konuListeKapat(); return; }   // 5. satır
            BIY.uniteAc(+bas.getAttribute("data-u"));
            return;
          }
          const o = e.target.closest(".biy-ds-oge");
          if (!o || o.disabled) return;
          BIY.konuSec(o.getAttribute("data-konu"));
          BIY.konuListeKapat();
        });
      }
    }
    BIY._konuVurgu();
    BIY._pdfOnizleGuncelle();
  },
  /* Ders seçildikten sonra sıra "soru seç" adımında: havuz bölümü vurgulanır.
     Havuzdan seçim yapılınca ya da panel açılınca vurgu söner.            */
  _havuzVurgu(){
    const k = document.querySelector("#ekranAnasayfa .biy-soru-sec-secim");
    if (!k) return;
    const goster = !!state.konuId && BIY._secSet().size === 0 && !state.havuzVurguGorildi;
    k.classList.toggle("biy-sira-geldi", goster);
  },
  konuSec(id){
    state.konuId = id || null;
    state.havuzVurguGorildi = false;
    if (state.konuId){
      const set = BIY._secSet();
      if (set.size){ set.clear(); state.soruSayisi = null; }   // havuzdan vazgeçildi → seçimi + soru sayısını sıfırla
    }
    BIY._konuVurgu();
    BIY._soruSecSayiGuncelle();   // havuz tuşu/sayaç + pdf + sınır + menü hepsini günceller
    BIY._havuzVurgu();
  },

  /* ---------- Soru Havuzu (elle seçim) ---------- */
  _secSet(){ if (!state.secilenSet) state.secilenSet = new Set(); return state.secilenSet; },
  _soruSecSayiGuncelle(){
    const n = BIY._secSet().size;
    /* v87: seçili liste artık havuzun KAPSAMI olduğu için konu seçimi
       kaldırılmıyor; havuzdan yapılan seçim o kapsamı daraltır. */
    const b = $("soruSecSayi");
    if (b){ b.textContent = n; b.hidden = (n === 0); }   // sifirken rozet hic cikmasin
    const btn = $("soruSecBtn"); if (btn) btn.classList.toggle("biy-secili-var", n > 0);
    BIY._havuzVurgu();
    BIY._pdfOnizleGuncelle();
    BIY._soruSayiSinir();
    BIY._menuDurum();
  },
  soruSecAc(){
    if ($("soruSecBtn") && $("soruSecBtn").disabled) return;
    state.havuzVurguGorildi = true; BIY._havuzVurgu();   // panel açıldı, vurgu sönsün
    const eski = $("biySoruSec"); if (eski) eski.remove();
    state.soruSecArama = "";
    // Panelin ustundeki havuz SVG'sini basliga kucultulmus olarak klonla
    const hvIkon = (function(){ const e = document.querySelector(".biy-svg-havuz");
                                return e ? e.outerHTML : "\u{1F3AF}"; })();
    const ov = document.createElement("div"); ov.id = "biySoruSec"; ov.className = "biy-onay-ov biy-soru-sec-ov";
    ov.innerHTML =
      '<div class="biy-soru-sec-kutu">' +
        '<div class="biy-soru-sec-bas">' +
          '<h3><span class="biy-hs-bas-ikon biy-anim">' + hvIkon + '</span> Soruları seç</h3>' +
          '<span class="biy-soru-sec-say" id="soruSecSecili"></span>' +
          '<button class="biy-soru-sec-kapat" onclick="BIY.soruSecKapat()">✕</button>' +
        '</div>' +
        '<div class="biy-soru-sec-liste" id="soruSecListe"></div>' +
        '<div class="biy-soru-sec-alt">' +
          BIY._sepetHtml() +
          '<div class="biy-soru-sec-butonlar">' +
            '<button class="biy-btn biy-onay-hayir" onclick="BIY.soruSecTemizle()">Tümünü temizle</button>' +
            '<button class="biy-btn biy-btn-yesil" onclick="BIY.soruSecKapat()">Tamam</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener("click", e => { if (e.target === ov) BIY.soruSecKapat(); });
    BIY._soruSecRender();
  },
  soruSecAra(v){ state.soruSecArama = (v||"").toLowerCase(); BIY._soruSecRender(); },
  /* ---------- havuz sınırı: önceden seçilen soru sayısı ---------- */
  _havuzSinir(){ return (state.soruHedef > 0) ? state.soruHedef : 0; },
  _havuzKalan(){ const s = BIY._havuzSinir(); return s ? Math.max(0, s - BIY._secSet().size) : Infinity; },
  _havuzDoluMu(){ const s = BIY._havuzSinir(); return !!s && BIY._secSet().size >= s; },
  /* ---------- SEPET: seçilen sorular gözle görülür şekilde birikir ---------- */
  _sepetHtml(){
    return '<div class="biy-sepet" id="soruSepet">'
      + '<span class="biy-sepet-ikon" aria-hidden="true">'
        + '<svg viewBox="0 0 52 52">'
          + '<defs><clipPath id="biySepetKirp"><path d="M8 20h36l-4.5 22a4 4 0 0 1-4 3.2H16.5a4 4 0 0 1-4-3.2z"/></clipPath></defs>'
          + '<g clip-path="url(#biySepetKirp)">'
            + '<rect class="biy-sepet-dolgu" id="sepetDolgu" x="6" y="46" width="40" height="30"/>'
          + '</g>'
          + '<path class="biy-sepet-kulp" d="M18 20V15a8 8 0 0 1 16 0v5" fill="none" stroke="currentColor"'
          + ' stroke-width="3" stroke-linecap="round"/>'
          + '<path d="M8 20h36l-4.5 22a4 4 0 0 1-4 3.2H16.5a4 4 0 0 1-4-3.2z" fill="none" stroke="currentColor"'
          + ' stroke-width="3" stroke-linejoin="round"/>'
          + '<path d="M5.5 20h41" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>'
        + '</svg>'
        + '<i class="biy-sepet-dusen" id="sepetDusen"></i>'
      + '</span>'
      + '<div class="biy-sepet-bilgi">'
        + '<div class="biy-sepet-sayi"><b id="sepetSayi">0</b><span id="sepetHedef"></span></div>'
        + '<div class="biy-sepet-bar"><i id="sepetBar"></i></div>'
        + '<span class="biy-sepet-not" id="sepetNot"></span>'
      + '</div>'
    + '</div>';
  },
  _sepetGuncelle(dusenVar){
    const kap = $("soruSepet"); if (!kap) return;
    const n = BIY._secSet().size, hedef = BIY._havuzSinir();
    const oran = hedef ? Math.min(100, (n / hedef) * 100) : (n ? Math.min(100, n * 4) : 0);
    const dolu = BIY._havuzDoluMu();
    const sy = $("sepetSayi"); if (sy) sy.textContent = n;
    const hd = $("sepetHedef"); if (hd) hd.textContent = hedef ? (" / " + hedef) : "";
    const br = $("sepetBar"); if (br) br.style.width = oran + "%";
    const dg = $("sepetDolgu"); if (dg) dg.setAttribute("y", String(46 - (oran / 100) * 26));
    const nt = $("sepetNot");
    if (nt) nt.textContent = !hedef ? "" : (dolu ? "Sayı tamamlandı" : ("Daha seçebilirsin: " + (hedef - n) + " tane"));
    kap.classList.toggle("dolu", dolu);
    kap.classList.toggle("bos", n === 0);
    if (dusenVar){
      const d = $("sepetDusen");
      if (d){ d.classList.remove("biy-dus"); void d.offsetWidth; d.classList.add("biy-dus"); }
      kap.classList.remove("biy-zipla"); void kap.offsetWidth; kap.classList.add("biy-zipla");
    }
  },
  _sinirUyar(){
    const kap = $("soruSepet"); if (!kap) return;
    kap.classList.remove("biy-salla"); void kap.offsetWidth; kap.classList.add("biy-salla");
    const nt = $("sepetNot");
    if (nt){
      nt.textContent = "Belirlenen sayıya ulaştın (" + BIY._havuzSinir() + ")";
      nt.classList.add("uyari");
      setTimeout(() => { nt.classList.remove("uyari"); BIY._sepetGuncelle(); }, 1800);
    }
  },
  _kapsamSvg(){
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
         + ' stroke-linecap="round" stroke-linejoin="round"><path d="M3 6.5h18M6 12h12M9.5 17.5h5"/></svg>';
  },
  /* Sorular seçilmeden ÖNCE soru sayısı belirlenmişse uyar: havuzdan seçim
     yapılınca sayı, seçilen soru adedine dönüşecek.                       */
  _sayiUyariHtml(){
    /* Sinir bilgisi: ogretmenin ELLE sectigi sayi (soruHedef) esas alinir.
       Secim baslayinca sepet zaten "n / hedef" gosterdigi icin serit gizlenir. */
    const n = state.soruHedef;
    if (!n || BIY._secSet().size > 0) return "";
    return '<div class="biy-hs-uyari" role="alert">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"'
      + ' stroke-linecap="round" stroke-linejoin="round">'
      + '<path d="M12 3.6l9.2 16H2.8z"/><path d="M12 9.6v4.4"/><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/></svg>'
      + '<span>Soru sayısı önceden belirlendi: <b>' + n + '</b>.'
      + ' Bundan fazlasını seçemezsin.</span>'
      + '<button type="button" class="biy-hs-uyari-btn" onclick="BIY.sayiUyariKaldir()">Sınırı kaldır</button>'
      + '</div>';
  },
  sayiUyariKaldir(){
    state.soruSayisi = null; state.soruSayiHavuzdan = false; state.soruHedef = null;
    BIY._soruSayiSinir(); BIY._menuDurum();
    BIY._soruSecRender();
  },
  _soruSecRender(){
    const kap = $("soruSecListe"); if (!kap) return;
    const set = BIY._secSet();
    const ara = state.soruSecArama;
    const zorAd = { 1:"Kolay", 2:"Orta", 3:"Zor" };
    const doluMu = BIY._havuzDoluMu();
    let html = '<div class="biy-hs-kapsam">' + BIY._kapsamSvg()
             + '<span>' + kacis(BIY._havuzKapsamAdi()) + '</span></div>'
             + '<div class="biy-hs-tipler">' + Object.keys(BICIM_BILGI).map(b =>
                 '<span class="biy-hs-tip biy-hs-b-' + b + '">' + (ETIKET_BICIM[b] || "")
                 + kacis(BICIM_TR_AD[b] || "") + '</span>').join("") + '</div>'
             + BIY._sayiUyariHtml();
    const kapsam = BIY._havuzKapsam();
    /* Havuz birden çok üniteyi kapsıyorsa hangi dersin hangi üniteden geldiği
       belli olsun: araya ünite başlığı, ders satırına küçük rozet. */
    const cokUnite = [...new Set(kapsam.map(k => k.unite == null ? 1 : k.unite))].length > 1;
    let sonUnite = null;
    kapsam.forEach(k => {
      const tumu = BIY._konuSorulari(k);            // süzgeçlerden geçenler
      const hepsi = BIY._konuTumSorulari(k);        // süzgeç dışındakiler de listelenir
      if (!hepsi.length) return;
      const sorular = hepsi.filter(q => !ara || (q.soru + " " + (q.arapca||"") + " " + aramaMetni(q)).toLowerCase().indexOf(ara) >= 0);
      if (!sorular.length) return;
      const seciliSay = tumu.filter(q => set.has(k.id + "#" + q.id)).length;
      const disiSay = hepsi.length - tumu.length;
      const uNo = (k.unite == null ? 1 : k.unite);
      if (cokUnite && uNo !== sonUnite){
        sonUnite = uNo;
        const u = UNITELER.find(x => x.no === uNo);
        html += '<div class="biy-hs-unite">'
          + '<span class="biy-hs-unite-no">' + uNo + '</span>'
          + '<span class="biy-hs-unite-ad">' + kacis(uniteBasligi(u)) + arEk(uniteAr(u)) + '</span>'
          + '<span class="biy-hs-unite-say">' + BIY._uniteSoruSayisi(uNo) + ' soru</span>'
          + '</div>';
      }
      const acik = ara ? true : !!(state.soruSecAcik && state.soruSecAcik[k.id]);
      html += '<div class="biy-hs-grup'+(acik?' acik':'')+'" data-konu="'+k.id+'">' +
        '<div class="biy-hs-baslik" onclick="BIY.soruSecAkordiyon(\''+k.id+'\')">' +
        '<span class="biy-hs-ok">▸</span>' +
        (cokUnite ? '<span class="biy-hs-u-rozet" title="'+kacis(BIY._uniteAdi(uNo))+'">'+uNo+'. ünite</span>' : '')
        + '<b>'+kacis(dersAdi(k))+'</b> <span class="biy-hs-say'+(seciliSay>0?' dolu':'')+((seciliSay===tumu.length&&tumu.length)?' tam':'')+'"><b>'+seciliSay+'</b><i>/</i>'+tumu.length+'</span>' +
        (disiSay ? '<span class="biy-hs-disi-say" title="Süzgeç dışında kaldığı için seçilemeyen soru">'+disiSay+' pasif</span>' : '') +
        '<button class="biy-hs-tumu" title="Tümünü seç" aria-label="Tümünü seç" onclick="event.stopPropagation();BIY.soruSecTumu(\''+k.id+'\')">' +
          '<svg viewBox="0 0 24 24" class="biy-hs-tumu-svg" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
          '<rect x="3.2" y="3.2" width="17.6" height="17.6" rx="4.5"/><path class="biy-ea-ciz" d="M7.4 12.6l3 3 6.2-7.2"/></svg></button></div>' +
        '<div class="biy-hs-govde">';
      sorular.forEach(q => {
        const key = k.id + "#" + q.id; const sec = set.has(key);
        const dogruSik = dogruCevapMetni(q);
        const disi = !suzgectenGecti(q);            // süzgeç dışı: soluk ve seçilemez
        const kapali = disi || (!sec && doluMu);
        const ipucu = disi
          ? (!bicimSecili(q) ? (BICIM_TR_AD[bicimAl(q)]||"") + " türü süzgeçte kapalı"
                             : (ZORLUK_TR[zorlukAl(q)]||"") + " sorular süzgeçte kapalı")
          : (BICIM_TR_AD[bicimAl(q)]||"") + " · " + (ZORLUK_TR[zorlukAl(q)]||"");
        html += '<label class="biy-hs-satir biy-hs-b-'+bicimAl(q)+' biy-hs-z'+zorlukAl(q)+(sec?' secili':'')+(disi?' biy-hs-disi':'')+(kapali?' biy-hs-kapali':'')+'" data-key="'+key+'" title="'+kacis(ipucu)+'">' +
          '<input type="checkbox" '+(sec?'checked':'')+(kapali?' disabled':'')+' onchange="BIY.soruSecTik(\''+key+'\', this)">' +
          '<span class="biy-hs-zor z'+zorlukAl(q)+'">'+kacis(ZORLUK_TR[zorlukAl(q)]||"")+'</span>' +
          '<span class="biy-hs-metin">'+soruHtml(q)+(q.arapca?' <i>'+kacis(q.arapca)+'</i>':'')+
            ' <b class="biy-hs-dogru">✓ '+kacis(dogruSik)+'</b></span>' +
          (disi ? '<span class="biy-hs-disi-not">süzgeç dışı</span>' : '') +
        '</label>';
      });
      html += '</div></div>';
    });
    kap.innerHTML = html;
    if (!kap.querySelector(".biy-hs-grup"))
      kap.insertAdjacentHTML("beforeend", '<p class="biy-alt" style="text-align:center">Sonuç yok.</p>');
    BIY._soruSecSayilar();
  },
  // sayaçları (grup başlıkları + toplam + buton) satırları yeniden çizmeden güncelle
  _soruSecSayilar(dusenVar){
    const set = BIY._secSet();
    document.querySelectorAll(".biy-hs-grup").forEach(g => {
      const k = KONULAR.find(x => x.id === g.getAttribute("data-konu")); if (!k) return;
      const tumu = BIY._konuSorulari(k);
      const sec = tumu.filter(q => set.has(k.id + "#" + q.id)).length;
      const sp = g.querySelector(".biy-hs-say");
      if (sp){
        sp.innerHTML = "<b>" + sec + "</b><i>/</i>" + tumu.length;
        sp.classList.toggle("dolu", sec > 0);
        sp.classList.toggle("tam", sec === tumu.length);
      }
      // tümünü-seç: grup tam seçiliyse animasyon durur, tik yeşil kalır
      const tb = g.querySelector(".biy-hs-tumu");
      if (tb) tb.classList.toggle("tam", sec === tumu.length);
    });
    const say = $("soruSecSecili"); if (say) say.innerHTML = 'Belirlenen <b class="biy-say-rozet">' + set.size + '</b>';
    // sınır dolunca/boşalınca satırların açık-kapalı hâli değişir
    const dolu = BIY._havuzDoluMu();
    document.querySelectorAll("#soruSecListe .biy-hs-satir").forEach(r => {
      if (r.classList.contains("biy-hs-disi")){
        r.classList.add("biy-hs-kapali");
        const g = r.querySelector("input"); if (g) g.disabled = true;
        return;
      }
      const cb = r.querySelector("input"); if (!cb) return;
      const kapali = !cb.checked && dolu;
      cb.disabled = kapali; r.classList.toggle("biy-hs-kapali", kapali);
    });
    document.querySelectorAll("#soruSecListe .biy-hs-tumu").forEach(b => b.classList.toggle("biy-hs-tumu-kapali", dolu));
    // secim baslayinca sinir seridi gizlenir (sepet zaten "n / hedef" gosteriyor)
    const uyari = document.querySelector(".biy-hs-uyari");
    if (uyari) uyari.style.display = set.size ? "none" : "";
    BIY._sepetGuncelle(dusenVar);
    BIY._soruSecSayiGuncelle();
  },
  // tek satır: yeniden çizmeden aç/kapa (kaydırma korunur)
  _suzgecDisiMi(key){
    const p = String(key).split("#");
    const k = KONULAR.find(x => x.id === p[0]); if (!k) return false;
    const q = (k.sorular || []).find(x => String(x.id) === p[1]);
    return !!q && !suzgectenGecti(q);
  },
  soruSecTik(key, cb){
    if (BIY._suzgecDisiMi(key)){ if (cb) cb.checked = false; return; }
    const set = BIY._secSet();
    if (set.has(key)) set.delete(key);
    else {
      // önceden belirlenen soru sayısından fazlası seçilemez
      if (BIY._havuzDoluMu()){ if (cb) cb.checked = false; BIY._sinirUyar(); return; }
      set.add(key);
    }
    if (cb){ const row = cb.closest(".biy-hs-satir"); if (row) row.classList.toggle("secili", cb.checked); }
    BIY._soruSecSayilar(set.has(key));
  },
  // akordiyon: başlığa tıkla → aç/kapa (yeniden çizmeden, kaydırma korunur)
  soruSecAkordiyon(konuId){
    if (!state.soruSecAcik) state.soruSecAcik = {};
    state.soruSecAcik[konuId] = !state.soruSecAcik[konuId];
    const g = document.querySelector('.biy-hs-grup[data-konu="'+konuId+'"]');
    if (g) g.classList.toggle("acik", !!state.soruSecAcik[konuId]);
  },
  soruSecTumu(konuId){
    const set = BIY._secSet();
    const k = KONULAR.find(x => x.id === konuId); if (!k) return;
    const tumu = BIY._konuSorulari(k); if (!tumu.length) return;
    const hepsiSecili = tumu.every(q => set.has(konuId + "#" + q.id));
    if (hepsiSecili){
      tumu.forEach(q => set.delete(konuId + "#" + q.id));
    } else {
      // sınır varsa yalnız kalan kadarını ekle
      let kalan = BIY._havuzKalan();
      let tasti = false;
      for (const q of tumu){
        const key = konuId + "#" + q.id;
        if (set.has(key)) continue;
        if (kalan <= 0){ tasti = true; break; }
        set.add(key); kalan--;
      }
      if (tasti) setTimeout(() => BIY._sinirUyar(), 30);
    }
    BIY._soruSecRender();
  },
  soruSecTemizle(){
    BIY._secSet().clear();
    BIY._soruSecSayiGuncelle();   // once sayilar/sinir tazelensin
    BIY._soruSecRender();          // sonra liste + uyari seridi cizilsin
  },
  soruSecKapat(){ const ov = $("biySoruSec"); if (ov) ov.remove(); BIY._soruSecSayiGuncelle(); },
  /* ---------- soru tipi (biçim) filtresi ---------- */
  // aktif konunun sorularından yalnız seçili biçimdekiler
  _bicimliSorular(){
    return BIY._aktifSorular().filter(suzgectenGecti);
  },
  _bicimPanelDoldur(){
    const p = $("bicimSecPanel"); if (!p) return;
    const tik = '<span class="biy-bs-tik" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"'
      + ' stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">'
      + '<path d="M6 12.5l4 4 8-9"/></svg></span>';
    p.innerHTML =
      '<div class="biy-bs-bas">Soru türleri'
      + '<button type="button" class="biy-bs-kapat" title="Kapat" aria-label="Kapat"'
      + ' onclick="BIY.bicimKapat()">✕</button></div>'
      + Object.keys(BICIM_BILGI).map(b =>
        '<button type="button" class="biy-bs-oge biy-hs-b-'+b+(state.bicimSecim[b] ? ' secili' : '')+'" data-b="'+b+'"' +
        ' title="'+kacis(BICIM_BILGI[b].ad)+'" aria-pressed="'+(state.bicimSecim[b] ? 'true' : 'false')+'"' +
        ' onclick="BIY.bicimToggle(\''+b+'\')">' + (ETIKET_BICIM[b] || "") +
        '<span class="biy-bs-yazi"><b>'+kacis(BICIM_TR_AD[b] || "")+'</b>' +
          '<small>'+kacis(BICIM_ACIKLAMA[b] || "")+'</small>' +
          '<i class="biy-bs-ar">'+kacis(BICIM_BILGI[b].ad)+'</i></span>' + tik + '</button>'
      ).join("");
  },
  /* Zorluk süzgeci kendi düğmesinde: soru türleri ile sürenin arasında. */
  _zorlukPanelDoldur(){
    const p = $("zorlukSecPanel"); if (!p) return;
    const tik = '<span class="biy-bs-tik" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"'
      + ' stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">'
      + '<path d="M6 12.5l4 4 8-9"/></svg></span>';
    p.innerHTML =
      '<div class="biy-bs-bas">Zorluk'
      + '<button type="button" class="biy-bs-kapat" title="Kapat" aria-label="Kapat"'
      + ' onclick="BIY.zorlukKapat()">✕</button></div>'
      + [1,2,3].map(z =>
        '<button type="button" class="biy-bs-oge biy-bs-zor biy-hs-z'+z+(state.zorlukSecim[z] ? ' secili' : '')+'"' +
        ' title="'+kacis(ZORLUK_AD[z] || "")+'" aria-pressed="'+(state.zorlukSecim[z] ? 'true' : 'false')+'"' +
        ' onclick="BIY.zorlukToggle('+z+')">' + (ETIKET_ZORLUK[z] || "") +
        '<span class="biy-bs-yazi"><b>'+kacis(ZORLUK_TR[z] || "")+'</b>' +
          '<small>'+kacis(ZORLUK_ACIKLAMA[z] || "")+'</small>' +
          '<i class="biy-bs-ar">'+kacis(ZORLUK_AD[z] || "")+'</i></span>' + tik + '</button>'
      ).join("")
      + '<p class="biy-bs-not">Kapattığın zorluktaki sorular havuzda soluk görünür, seçilemez.</p>';
  },
  zorlukAcKapat(){
    const p = $("zorlukSecPanel"), b = $("zorlukSecBtn"); if (!p) return;
    if (!p.hidden) return;                 // açıkken tuşa basmak kapatmaz; ✕ ile kapanır
    BIY._ayarlariKapat("zorluk");
    BIY._zorlukPanelDoldur();
    p.hidden = false;
    BIY._paneliYerlestir("zorlukSecPanel", "zorlukSecBtn");
    if (b) b.setAttribute("aria-expanded", "true");
    setTimeout(() => document.addEventListener("mousedown", BIY._zorlukDis), 0);
  },
  zorlukKapat(){
    const p = $("zorlukSecPanel"), b = $("zorlukSecBtn");
    if (p) p.hidden = true;
    if (b) b.setAttribute("aria-expanded", "false");
    document.removeEventListener("mousedown", BIY._zorlukDis);
  },
  _zorlukDis(e){ if (!e.target.closest || !e.target.closest("#zorlukSec")) BIY.zorlukKapat(); },
  zorlukToggle(z){
    z = Number(z) || 1;
    const sec = state.zorlukSecim;
    if (sec[z] && Object.keys(sec).filter(x => sec[x]).length <= 1) return;   // en az biri açık kalsın
    sec[z] = !sec[z];
    BIY._zorlukPanelDoldur();
    /* süzgece uymayan seçimler havuzdan düşer, sayılar yeniden hesaplanır */
    const gecerli = {}; BIY._soruHavuzu().forEach(h => gecerli[h.key] = true);
    const set = BIY._secSet();
    [...set].forEach(k => { if (!gecerli[k]) set.delete(k); });
    BIY._konulariHazirla();
    if ($("soruSecListe")) BIY._soruSecRender();
    BIY._soruSecSayiGuncelle();
    BIY._soruSayiSinir();
    BIY._menuDurum();
    try { if (window.COFF && COFF.bilgiTazele) COFF.bilgiTazele(); } catch(e){}
  },
  bicimToggle(b){
    const sec = state.bicimSecim;
    // en az bir tip secili kalmali
    if (sec[b] && Object.keys(sec).filter(x => sec[x]).length <= 1) return;
    sec[b] = !sec[b];
    BIY._bicimPanelDoldur();
    /* süzgece uymayan seçimler havuzdan düşer, sayılar yeniden hesaplanır */
    const gecerli = {}; BIY._soruHavuzu().forEach(h => gecerli[h.key] = true);
    const set = BIY._secSet();
    [...set].forEach(k => { if (!gecerli[k]) set.delete(k); });
    BIY._konulariHazirla();
    if ($("soruSecListe")) BIY._soruSecRender();
    BIY._soruSecSayiGuncelle();
    BIY._soruSayiSinir();
    BIY._menuDurum();
    try { if (window.COFF && COFF.bilgiTazele) COFF.bilgiTazele(); } catch(e){}
  },
  /* Aynı anda tek bir ayar penceresi açık kalsın. */
  _ayarlariKapat(haric){
    if (haric !== "bicim") BIY.bicimKapat();
    if (haric !== "zorluk") BIY.zorlukKapat();
    if (haric !== "sure" && BIY.sureKapat) BIY.sureKapat();
    if (haric !== "sayi"){
      const a = $("sayiAkordiyon"), b = $("soruSayiEtiket");
      if (a){ a.classList.remove("acik"); if (b) b.setAttribute("aria-expanded", "false"); }
    }
  },
  bicimAcKapat(){
    const p = $("bicimSecPanel"), b = $("bicimSecBtn"); if (!p) return;
    if (!p.hidden) return;                 // açıkken tuşa basmak kapatmaz; ✕ ile kapanır
    BIY._ayarlariKapat("bicim");
    BIY._bicimPanelDoldur();
    p.hidden = false;
    BIY._bicimPanelYerlestir();
    if (b) b.setAttribute("aria-expanded", "true");
    setTimeout(() => document.addEventListener("mousedown", BIY._bicimDis), 0);
  },
  bicimKapat(){
    const p = $("bicimSecPanel"), b = $("bicimSecBtn");
    if (p) p.hidden = true;
    if (b) b.setAttribute("aria-expanded", "false");
    document.removeEventListener("mousedown", BIY._bicimDis);
  },
  _bicimDis(e){ if (!e.target.closest || !e.target.closest("#bicimSec")) BIY.bicimKapat(); },
  /* Panel hangi tarafta yer varsa oraya açılsın, sığmıyorsa kendi içinde kaysın. */
  _bicimPanelYerlestir(){ BIY._paneliYerlestir("bicimSecPanel", "bicimSecBtn"); },
  _paneliYerlestir(panelId, tusId){
    const p = $(panelId), b = $(tusId);
    if (!p || !b) return;
    const r = b.getBoundingClientRect();
    const ust = r.top - 22;
    const alt = window.innerHeight - r.bottom - 22;
    const yukari = ust > alt;
    p.classList.toggle("biy-bs-yukari", yukari);
    p.style.maxHeight = Math.max(190, Math.floor(yukari ? ust : alt)) + "px";
  },
  /* ---------- Zorluğa göre süre (yıldız akordiyonu) ---------- */
  _soruSuresi(s){
    const z = (s && s.zorluk) || 2;
    return sureKirp((state.sureler && state.sureler[z]) || SURE_VARSAYILAN[z] || SORU_SURESI);
  },
  _sureleriYukle(){
    try {
      const k = JSON.parse(localStorage.getItem("biy_sureler") || "null");
      if (k) [1,2,3].forEach(z => { if (k[z]) state.sureler[z] = sureKirp(k[z]); });
    } catch(e){}
  },
  _sureleriKaydet(){ try { localStorage.setItem("biy_sureler", JSON.stringify(state.sureler)); } catch(e){} },
  _sureSatirHtml(z){
    return '<div class="biy-sr-satir z' + z + '" data-z="' + z + '">'
      + '<span class="biy-sr-yild" title="' + kacis(ZORLUK_AD[z] || "") + '">'
      + '<span class="biy-sr-yildizlar" aria-hidden="true">'
      + Array.from({ length: z }, () =>
          '<svg viewBox="0 0 24 24" fill="currentColor"><path d="' + _YILDIZ + '"/></svg>').join("")
      + '</span></span>'
      /* v86: + ve − yer değiştirdi. Sürgü soldan sağa (ltr) çiziliyor; artık
         − sürgünün küçük ucunda (solda), + büyük ucunda (sağda) duruyor. */
      + '<button type="button" class="biy-sr-art" aria-label="Artır" onclick="BIY.sureDegistir(' + z + ',1)">+</button>'
      + '<input type="range" class="biy-sr-kaydir" min="' + SURE_MIN + '" max="' + SURE_MAX + '" step="' + SURE_ADIM + '"'
      + ' value="' + state.sureler[z] + '" aria-label="' + kacis(ZORLUK_AD[z] || "") + '"'
      + ' oninput="BIY.sureAyarla(' + z + ', this.value)">'
      + '<button type="button" class="biy-sr-eks" aria-label="Azalt" onclick="BIY.sureDegistir(' + z + ',-1)">−</button>'
      + '<span class="biy-sr-deg" id="sureDeg' + z + '">' + sureYazi(state.sureler[z]) + '</span>'
      + '</div>';
  },
  _sureAkordiyonDoldur(){
    const a = $("sureAkordiyon"); if (!a) return;
    a.innerHTML = [1,2,3].map(z => BIY._sureSatirHtml(z)).join("")
      + '<div class="biy-sr-alt">'
      + '<span class="biy-sr-not">' + sureYazi(SURE_MIN) + ' — ' + sureYazi(SURE_MAX) + '</span>'
      + '<button type="button" class="biy-sr-sifirla" title="Varsayılana dön" onclick="BIY.sureSifirla()">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'
      + '<path d="M3.5 12a8.5 8.5 0 1 1 2.6 6.1"/><polyline points="3.5 6.5 3.5 12 9 12"/></svg></button>'
      + '</div>';
    BIY._sureRozet();
  },
  sureAyarla(z, v){
    state.sureler[z] = sureKirp(v);
    const d = $("sureDeg" + z); if (d) d.textContent = sureYazi(state.sureler[z]);
    const r = document.querySelector('.biy-sr-satir[data-z="' + z + '"] .biy-sr-kaydir');
    if (r && +r.value !== state.sureler[z]) r.value = state.sureler[z];
    BIY._sureleriKaydet();
    BIY._sureRozet();
  },
  sureDegistir(z, yon){ BIY.sureAyarla(z, (state.sureler[z] || SORU_SURESI) + yon * SURE_ADIM); },
  sureSifirla(){
    [1,2,3].forEach(z => state.sureler[z] = SURE_VARSAYILAN[z]);
    BIY._sureleriKaydet();
    BIY._sureAkordiyonDoldur();
  },
  // saat düğmesinin başlığında seçili süreler görünsün
  _sureRozet(){
    const b = $("sureBtn"); if (!b) return;
    const m = "Soru süresi: ★ " + sureYazi(state.sureler[1])
            + " · ★★ " + sureYazi(state.sureler[2])
            + " · ★★★ " + sureYazi(state.sureler[3]);
    b.setAttribute("title", m);
    const t = b.querySelector("title"); if (t) t.textContent = m;
  },
  sureAcKapat(){
    const a = $("sureAkordiyon"), b = $("sureBtn"); if (!a) return;
    if (a.hidden){
      BIY._ayarlariKapat("sure");
      BIY._sureAkordiyonDoldur();
      a.hidden = false;
      if (b) b.setAttribute("aria-expanded", "true");
      setTimeout(() => document.addEventListener("mousedown", BIY._sureDis), 0);
    } else BIY.sureKapat();
  },
  sureKapat(){
    const a = $("sureAkordiyon"), b = $("sureBtn");
    if (a) a.hidden = true;
    if (b) b.setAttribute("aria-expanded", "false");
    document.removeEventListener("mousedown", BIY._sureDis);
  },
  _sureDis(e){
    if (!e.target.closest) return;
    if (!e.target.closest("#sureAkordiyon") && !e.target.closest("#sureSec")) BIY.sureKapat();
  },

  // hazir rakamlar akordiyonu: rakam SVG'sine tiklaninca acilir/kapanir
  sayiAcKapat(){
    const a = $("sayiAkordiyon"), b = $("soruSayiEtiket"); if (!a) return;
    const acilacak = !a.classList.contains("acik");
    if (acilacak) BIY._ayarlariKapat("sayi");
    a.classList.toggle("acik", acilacak);
    if (b) b.setAttribute("aria-expanded", acilacak ? "true" : "false");
  },
  // elle seçilen sorular (havuzdan) — sıralı liste
  _secilenSorular(){
    const set = BIY._secSet(); if (!set.size) return [];
    return BIY._soruHavuzu().filter(h => set.has(h.key)).map(h => h.soru);
  },
  // seçili konu+seviyedeki mevcut soruya göre soru sayısı üst sınırını ayarla
  _soruSayiSinir(){
    const havuz = BIY._secSet().size;
    const inp = $("soruSayiInput");
    const lbl = document.querySelector(".biy-sorusayi-secim .biy-seviye-label");
    // HAVUZ seçili → soru sayısı = seçilen soru sayısı (sabit); hazır rakamlar pasif, manuel alanda o sayı yazılı
    if (havuz > 0){
      state.soruSayiMax = havuz;
      state.soruSayisi = havuz;
      state.soruSayiHavuzdan = true;   // bu sayı havuzdan geldi → havuz bırakılınca sıfırlanacak
      document.querySelectorAll(".biy-sayi-btn").forEach(b => { b.disabled = true; b.classList.add("biy-pasif"); b.classList.remove("secili"); });
      if (inp){ inp.disabled = false; inp.readOnly = true; inp.max = havuz; inp.min = 1; inp.value = havuz; inp.classList.add("biy-secili"); }
      BIY._sayiDonDur();
      if (lbl) BIY._sayiEtiket(havuz, "havuz");
      return;
    }
    // havuz modundan çıkıldıysa havuz kaynaklı soru sayısını sıfırla (öğretmen yeniden seçsin)
    if (state.soruSayiHavuzdan){ state.soruSayisi = state.soruHedef || null; state.soruSayiHavuzdan = false; }
    let mevcut;
    // dijital yarışma seçilen zorluğu önceliklendirip gerekirse diğer zorluklardan tamamlar → üst sınır konunun TÜM sorusu
    if (state.konuId) mevcut = BIY._bicimliSorular().length;
    else mevcut = 50;                                                    // konu/havuz yok → sınır uygulanmasın
    const max = Math.max(1, Math.min(50, mevcut));
    state.soruSayiMax = max;
    document.querySelectorAll(".biy-sayi-btn").forEach(b => {
      const v = +b.getAttribute("data-sayi"); const dis = v > max;
      b.disabled = dis; b.classList.toggle("biy-pasif", dis);
    });
    if (inp){ inp.disabled = false; inp.readOnly = false; inp.classList.remove("biy-secili"); inp.max = max; inp.min = 1; inp.placeholder = "≤ " + max; }
    if (state.soruSayisi == null){ if (lbl) BIY._sayiEtiket(max, "sinir"); BIY._sayiDon(); }
    if (state.soruSayisi != null){ if (state.soruSayisi > max) BIY.setSoruSayisi(max); else BIY.setSoruSayisi(state.soruSayisi); }
    else { document.querySelectorAll(".biy-sayi-btn").forEach(b => b.classList.remove("secili")); if (inp) inp.value = ""; }
  },
  // soru sayisi etiketi: yazi yerine SVG rozeti — rakam sayarak degisir
  // kip: "sinir" (ust sinir) | "secili" (ogretmenin sectigi sayi) | "havuz"
  _sayiEtiket(n, kip){
    const kap = $("soruSayiEtiket"); if (!kap) return;
    const svg = kap.querySelector("svg");
    if (svg){
      svg.classList.toggle("biy-ss-havuz",  kip === "havuz");
      svg.classList.toggle("biy-ss-secili", kip === "secili");
      const metin = kip === "havuz"  ? "Soru sayısı (seçilen " + n + ")"
                  : kip === "secili" ? "Soru sayısı: " + n
                                     : "Soru sayısı (en fazla " + n + ")";
      const bas = svg.querySelector("title"); if (bas) bas.textContent = metin;
      svg.setAttribute("aria-label", metin);
    }
    BIY._sayiAnim(n);
  },
  // bosta: rakam yarim saniyede bir 10 / 20 / 25 / 50 arasinda karisik degisir
  _sayiDon(){
    if (state.sayiDonZmn) return;                 // zaten donuyor
    state.sayiDonZmn = setInterval(() => {
      if (state.soruSayisi != null){ BIY._sayiDonDur(); return; }
      const max = state.soruSayiMax || 50;
      const liste = SORU_SAYI_SECENEK.filter(v => v <= max);
      if (liste.length < 2) return;               // tek secenek kaldiysa donmeye gerek yok
      const t = $("soruSayiRakam"); if (!t) return;
      const simdi = parseInt(t.textContent, 10);
      const kalan = liste.filter(v => v !== simdi);
      const n = kalan[Math.floor(Math.random() * kalan.length)];
      BIY._sayiAnim(n, true);
    }, 500);
  },
  _sayiDonDur(){
    if (state.sayiDonZmn){ clearInterval(state.sayiDonZmn); state.sayiDonZmn = null; }
  },
  // rakami eski degerden yeni degere sayarak getir + rozeti sictir
  _sayiAnim(hedef, ani){
    const t = $("soruSayiRakam"); if (!t) return;
    hedef = Math.max(0, parseInt(hedef, 10) || 0);
    const bas = parseInt(t.textContent, 10);
    const svg = t.closest("svg");
    if (ani){
      // bosta donerken: sadece rakam cevrilsin, rozet nefes almaya devam etsin
      t.classList.remove("biy-ss-cevir");
      void t.getBoundingClientRect();            // sinifi yeniden tetiklemek icin
      t.classList.add("biy-ss-cevir");
      clearTimeout(state.sayiCevirZmn);
      state.sayiCevirZmn = setTimeout(() => t.classList.remove("biy-ss-cevir"), 430);
    } else if (svg){
      svg.classList.remove("biy-ss-atar");
      void svg.getBoundingClientRect();
      svg.classList.add("biy-ss-atar");
      clearTimeout(state.sayiAtarZmn);
      state.sayiAtarZmn = setTimeout(() => svg.classList.remove("biy-ss-atar"), 560);
    }
    // ani: rakam bir anda degissin (bostaki donme icin — yarim saniye okunakli kalir)
    if (isNaN(bas) || ani){
      if (state.sayiRaf){ cancelAnimationFrame(state.sayiRaf); state.sayiRaf = null; }
      t.textContent = hedef; return;
    }
    if (bas === hedef) return;
    if (state.sayiRaf) cancelAnimationFrame(state.sayiRaf);
    const sure = 450, t0 = (performance && performance.now) ? performance.now() : 0;
    const adim = (z) => {
      const p = Math.min(1, (z - t0) / sure);
      const e = 1 - Math.pow(1 - p, 3);          // yumusak yavaslama
      t.textContent = Math.round(bas + (hedef - bas) * e);
      if (p < 1) state.sayiRaf = requestAnimationFrame(adim);
      else { t.textContent = hedef; state.sayiRaf = null; }
    };
    state.sayiRaf = requestAnimationFrame(adim);
  },
  _pdfOnizleGuncelle(){
    const havuz = BIY._secSet().size;
    const k = BIY._aktifKonu();
    const baslik = $("pdfBaslik"); if (baslik) baslik.textContent = havuz > 0 ? "Karışık" : (k ? (k.ad || "") : "");
    const kart = $("pdfKart"), indir = $("pdfIndir");
    // PDF'ler henüz hazır değil → tüm önizleme bloğunu gizle (PDF_AKTIF=true olunca geri gelir)
    const blok = kart && kart.closest(".biy-pdf-onizleme");
    if (blok) blok.classList.toggle("gizli", !PDF_AKTIF);
    if (!PDF_AKTIF){
      if (kart){ kart.removeAttribute("href"); kart.classList.add("biy-pasif"); }
      if (indir){ indir.removeAttribute("href"); indir.classList.add("gizli"); }
      return;
    }
    const varMi = !havuz && !!(k && k.pdf);
    const url = varMi ? encodeURI(k.pdf) : "";
    if (kart){ if (varMi){ kart.href = url; kart.classList.remove("biy-pasif"); } else { kart.removeAttribute("href"); kart.classList.add("biy-pasif"); } }
    if (indir){
      if (varMi){ indir.href = url; indir.setAttribute("download", k.pdf); indir.classList.remove("gizli"); }
      else { indir.removeAttribute("href"); indir.classList.add("gizli"); }
    }
  },

  /* ---------- Sorular önizleme ---------- */
  acSorular(){ BIY.sorularSekme(state.sorularZ || 1); ekranGoster("ekranSorular"); },
  sorularSekme(z){
    state.sorularZ = z;
    document.querySelectorAll(".biy-sekme").forEach(b => b.classList.toggle("secili", +b.getAttribute("data-z") === z));
    const liste = $("sorularListe"); liste.innerHTML = "";
    const list = BIY._aktifSorular().filter(s => s.zorluk === z);
    if (!list.length){ liste.innerHTML = '<p class="biy-alt" style="text-align:center">Bu düzeyde henüz örnek yok.</p>'; return; }
    // her soru tipinden yalnızca bir örnek göster (tüm sorular değil)
    const gorulen = new Set(); const ornekler = [];
    list.forEach(s => { if (!gorulen.has(s.tip)){ gorulen.add(s.tip); ornekler.push(s); } });
    ornekler.forEach(s => liste.appendChild(BIY._soruKartEl(s, true)));
  },
  _soruKartEl(s, dogruGoster){
    const t = TIP_BILGI[s.tip] || { ad: s.tip, emoji: "❓" };
    const kart = document.createElement("div"); kart.className = "biy-soru-kart";
    const sikHtml = sikKartHtml(s, dogruGoster);
    kart.innerHTML =
      etiketHtml(s) +
      '<div class="biy-soru-metin">'+ soruHtml(s) +'</div>' +
      (s.arapca ? '<div class="biy-soru-arapca">'+ kacis(s.arapca) +'</div>' : '') +
      '<div class="biy-secenekler">'+ sikHtml +'</div>';
    return kart;
  },

  // ana menü kartları: geçerli içerik (havuz soruları veya soru içeren konu) seçiliyken aktif olur
  _menuDurum(){
    const havuz = BIY._secSet().size;
    const konuVar = (BIY._bicimliSorular().length > 0);
    const icerik = havuz > 0 || konuVar;                 // konu ya da havuzdan soru
    const sayiSecili = (state.soruSayisi != null && state.soruSayisi > 0);  // soru sayısı seçili
    const aktif = icerik && sayiSecili;
    ["kartTakim", "kartBirey", "kartOkul"].forEach(id => { const el = $(id); if (el) el.classList.toggle("biy-pasif", !aktif); });
    const not = $("menuNot"); if (not) not.classList.toggle("gizli", aktif);
    BIY._dijitalKartDurum();
  },
  // bağlı cihaz varsa Dijital Yarışma kartının çerçevesi yeşil + rozet
  _dijitalKartDurum(){
    const bagli = (state.takimListe || []).filter(t => t.bagli).length;
    const aktifOda = !!state.odaId && bagli > 0;
    // rozet yalnızca odanın açıldığı modun kartında görünür
    const kartId = { takim: "kartTakim", birey: "kartBirey", okul: "kartOkul" };
    Object.keys(kartId).forEach(m => {
      const el = $(kartId[m]); if (!el) return;
      const bu = aktifOda && modAl() === m;
      el.classList.toggle("biy-bagli-var", bu);
      const r = el.querySelector(".biy-bagli-rozet");
      if (r){ r.textContent = "● " + bagli + " cihaz bağlı"; r.classList.toggle("gizli", !bu); }
    });
  },

  /* ---------- Lobi (üç mod ortak) ---------- */
  acTakimlar(){ return BIY.acLobi("takim"); },
  acLobi(mod){
    if (!MOD_BILGI[mod]) mod = "takim";
    // başka modda açık bir oda varsa önce onay iste
    if (state.odaId && state.oyunModu !== mod){
      const eskiAd = (MOD_BILGI[state.oyunModu] || {}).ad || "Yarışma";
      BIY._onay("Sistemi değiştirelim mi?",
        "Şu sistemden açık bir oda var: " + eskiAd + ". Sistemi değiştirirsen o oda ve içindeki cihazlar bırakılır.",
        "Evet, değiştir", () => BIY._lobiAc(mod));
      return;
    }
    BIY._lobiAc(mod);
  },
  async _lobiAc(mod){
    if (state.oyunModu !== mod){        // gerçek mod değişimi → eski odayı bırak
      BIY._odaBirak();
      state.oyunModu = mod;
    }
    state.oyunModu = mod;
    ekranGoster("ekranTakimlar");
    BIY._lobiDuzen();
    if (!state.odaId){
      $("takimlarGrid").innerHTML = "";
      const b = $("baslatBtn"); if (b) b.classList.add("gizli");
      const n = $("baslatNot"); if (n) n.textContent = "";
      BIY._kontrolleriAc();
    }
    BIY._soruSayiSinir(); BIY._soruSecSayiGuncelle();
    // birey/okul: oda hemen kurulur ki ortak karekod ekranda dursun
    if (tekKarekod()){
      try { await BIY._odayiHazirla(); BIY._odaKarekodCiz(); }
      catch(e){ console.error(e); $("baslatNot").textContent = "Oda oluşturulamadı: " + (e.code || e.message); }
    }
  },
  // odayı bırak (silmez): abonelikleri kapat, ekranı temizle
  _odaBirak(){
    if (state.takimAbone){ state.takimAbone(); state.takimAbone = null; }
    if (state.odaAboneAdmin){ state.odaAboneAdmin(); state.odaAboneAdmin = null; }
    if (state.cevapAbone){ state.cevapAbone(); state.cevapAbone = null; }
    state.odaId = null; state.oda = null; state.takimListe = []; state.bekleyenListe = [];
    state.baglSet = null; state.baglIlk = false; state.cevaplar = {};
    BIY._temizleKayit();
  },
  // lobi ekranının hangi bölümleri görünecek (moda göre)
  _lobiDuzen(){
    const m = modAl(), bilgi = MOD_BILGI[m];
    const bas = $("lobiBaslik"); if (bas) bas.textContent = bilgi.emoji + " " + bilgi.baslik;
    const goster = (id, evet) => { const el = $(id); if (el) el.classList.toggle("gizli", !evet); };
    /* Takım ve Okul modu aynı akış: öğretmen ad yazar, her ada bir karekod
       çıkar. Tek ortak karekod + onay kuyruğu yalnız Birey modundadır.     */
    goster("takimYapAlan", m !== "birey");
    goster("lobiOdaAlan",  m === "birey");
    goster("lobiBekleyen", m === "birey");
    const grid = $("takimlarGrid");
    if (grid) grid.className = (m === "birey") ? "biy-kat-liste" : "biy-takimlar-grid";
    // ekleme alanının yazıları moda göre (takım adı / sınıf adı)
    const inp = $("takimAdiInput");
    if (inp) inp.placeholder = (m === "okul") ? "Sınıf adı (7/A)" : "Takım adı";
    const ekleBtn = $("takimEkleBtn");
    if (ekleBtn) ekleBtn.textContent = (m === "okul") ? "+ Sınıf ekle" : "+ Takım ekle";
  },
  // --- Kalıcılık (sayfa yenilense de oyun kaybolmasın) ---
  _kaydet(){
    try { localStorage.setItem('biy_aktif', JSON.stringify({ oda: state.odaId, sorular: state.oyunSorulari, yedek: state.yedekSorular, yedekMap: state.yedekSoruMap, seviye: state.seviye, soruSayisi: state.soruSayisi,
      ber: { hedef: state.berHedef, takimlar: state.berTakimlar, sabit: state.berSabit, no: state.berNo, sorular: state.berSorular }, ts: Date.now() })); } catch(e){}
  },
  _temizleKayit(){ try { localStorage.removeItem('biy_aktif'); } catch(e){} },
  async _devamEt(kayit){
    try {
      if (kayit.ts && (Date.now() - kayit.ts) > 12*3600*1000){ BIY._temizleKayit(); ekranGoster('ekranAnasayfa'); return; }
      const ref = db.collection(KOLEKSIYON).doc(kayit.oda);
      const snap = await ref.get();
      const dr0 = snap.exists ? snap.data().durum : null;
      // yalnızca AKTİF oyun (oyun/beraberlik) kaldığı yerden devam eder; lobi/bitti → ana sayfa
      if (dr0 !== 'oyun' && dr0 !== 'beraberlik'){ BIY._temizleKayit(); ekranGoster('ekranAnasayfa'); return; }
      state.odaId = kayit.oda;
      const od0 = snap.data() || {};
      state.oyunModu = MOD_BILGI[od0.mod] ? od0.mod : "takim";
      state.oyunSorulari = Array.isArray(kayit.sorular) ? kayit.sorular : [];
      state.yedekSorular = Array.isArray(kayit.yedek) ? kayit.yedek : [];
      state.yedekSoruMap = kayit.yedekMap || {};
      state.soruSayisi = kayit.soruSayisi || 20;
      if (kayit.ber){ state.berHedef = kayit.ber.hedef||0; state.berTakimlar = kayit.ber.takimlar||[]; state.berSabit = kayit.ber.sabit||{}; state.berNo = kayit.ber.no||0; state.berSorular = kayit.ber.sorular||[]; }
      if (state.takimAbone) state.takimAbone();
      state.takimAbone = ref.collection('takimlar').orderBy('olusturmaZamani').onSnapshot(s => BIY._takimlariCiz(s));
      BIY._adminOyunaGec();   // aktif oyuna geri dön
    } catch(e){ console.error('Devam hatası:', e); BIY._temizleKayit(); ekranGoster('ekranAnasayfa'); }
  },
  // özel onay penceresi (native confirm yerine)
  _onay(baslik, metin, evetMetin, onEvet){
    const eski = $("biyOnay"); if (eski) eski.remove();
    const ov = document.createElement("div"); ov.id = "biyOnay"; ov.className = "biy-onay-ov";
    ov.innerHTML = '<div class="biy-onay-kutu"><h3>'+kacis(baslik)+'</h3><p>'+kacis(metin)+'</p>' +
      '<div class="biy-onay-btnlar"><button class="biy-onay-hayir">Vazgeç</button><button class="biy-onay-evet">'+kacis(evetMetin)+'</button></div></div>';
    document.body.appendChild(ov);
    const kapat = () => { if (ov.parentNode) ov.remove(); };
    ov.querySelector(".biy-onay-hayir").onclick = kapat;
    ov.querySelector(".biy-onay-evet").onclick = () => { kapat(); onEvet(); };
    ov.addEventListener("click", e => { if (e.target === ov) kapat(); });
  },
  // canlı yarışmadan çıkış → lobiye dön (takım bağlantıları KORUNUR)
  yaristanCik(){
    BIY._onay("Beklemeye dönülsün mü?",
      "Yarışma durur ve beklemeye dönersin. Cihazlar bağlı kalır — dersi ya da soru sayısını değiştirip yeniden başlayabilirsin.",
      "Evet, dön", function(){ BIY.lobiyeDon(); });
  },
  // oyunu durdurup lobiye döner; oda + takım karekod bağlantıları kopmaz
  async lobiyeDon(){
    // 1) oyun dinleyicilerini kapat (takım aboneliği KORUNUR → kartlar canlı kalır)
    if (state.odaAboneAdmin){ state.odaAboneAdmin(); state.odaAboneAdmin = null; }
    if (state.cevapAbone){ state.cevapAbone(); state.cevapAbone = null; }
    sayacDurdur(); BIY._sonucTemizle();
    // 2) odayı lobiye al + eski cevapları temizle (yeni tura karışmasın), bağlantı kopmaz
    try {
      if (state.odaId){
        await BIY._cevaplariSil();
        await db.collection(KOLEKSIYON).doc(state.odaId).update({
          durum: "lobi", faz: "cevap", aktifIndex: -1, toplamSoru: 0,
          sonSira: [], berHedef: 0, berTakimlar: [], berSabit: {}, berNo: 0
        });
      }
    } catch(e){ console.error(e); }
    // 3) oyun/beraberlik state'ini sıfırla (odaId ve takımlar korunur)
    state.oyunSorulari = []; state.oda = null; state.otoSonucIndex = -1; state.sonucAnimIndex = -1; state.finalKonfeti = false;
    state.hepsiSesIndex = -1;
    state.yedekSorular = []; state.yedekSoruMap = {}; state.berHedef = 0; state.berTakimlar = []; state.berSabit = {}; state.berNo = 0; state.berSorular = [];
    state.ayarKilidiKapali = true;   // lobiye döndük → ayarlar takım bağlıyken de değiştirilebilir
    BIY._temizleKayit();
    // 4) lobi ekranına dön, ayarları aç
    ekranGoster("ekranTakimlar");
    BIY._kontrolleriAc();
    BIY._soruSayiSinir(); BIY._soruSecSayiGuncelle();
  },
  // odanın cevaplar alt-koleksiyonunu temizle (oda yeniden kullanılırken)
  _cevaplariSil(){
    if (!state.odaId) return Promise.resolve();
    return db.collection(KOLEKSIYON).doc(state.odaId).collection("cevaplar").get().then(cs => {
      if (cs.empty) return;
      const batch = db.batch(); cs.forEach(d => batch.delete(d.ref)); return batch.commit();
    }).catch(e => console.warn("cevap temizle:", e));
  },
  oyunuBitir(){
    BIY._temizleKayit();
    if (state.odaAboneAdmin) state.odaAboneAdmin();
    if (state.cevapAbone) state.cevapAbone();
    if (state.takimAbone) state.takimAbone();
    BIY._sonucTemizle();
    state.odaId = null; state.oyunSorulari = []; state.oda = null; state.otoSonucIndex = -1; state.sonucAnimIndex = -1; state.finalKonfeti = false;
    state.baglSet = null; state.baglIlk = false; state.hepsiSesIndex = -1;
    state.yedekSorular = []; state.yedekSoruMap = {}; state.berHedef = 0; state.berTakimlar = []; state.berSabit = {}; state.berNo = 0; state.berSorular = [];
    state.ayarKilidiKapali = false;
    if (state.secilenSet) state.secilenSet.clear(); BIY._soruSecSayiGuncelle();
    BIY._kontrolleriAc();
    const bB = $("baslatBtn"); if (bB) bB.classList.add("gizli");
    const bN = $("baslatNot"); if (bN) bN.textContent = "";
    BIY.anasayfa();
  },
  // takım silinince/yarış bitince kilitli tüm ayar kontrollerini yeniden aç
  _kontrolleriAc(){
    document.querySelectorAll(".biy-seviye-btn, .biy-sayi-btn, .biy-bicim-btn, .biy-bs-oge").forEach(b => { b.disabled = false; b.classList.remove("biy-pasif"); });
    ["soruSayiInput", "soruSecBtn", "konuSecim", "konuSeciciBtn"].forEach(id => { const el = $(id); if (el){ el.disabled = false; el.classList.remove("biy-pasif"); } });
    document.querySelectorAll(".biy-seviye-label").forEach(l => l.classList.remove("biy-pasif"));
  },

  async _odayiHazirla(){
    if (state.odaId) return state.odaId;
    let kod, ref, mevcut = true, deneme = 0;
    while (mevcut && deneme < 6){
      kod = rastgeleKod(4); ref = db.collection(KOLEKSIYON).doc(kod);
      const snap = await ref.get(); mevcut = snap.exists; deneme++;
    }
    await ref.set({
      durum: "lobi", faz: "cevap", aktifIndex: -1, toplamSoru: 0, soruSuresi: SORU_SURESI,
      mod: modAl(),
      olusturan: state.uid || null, olusturmaZamani: firebase.firestore.FieldValue.serverTimestamp()
    });
    state.odaId = kod;
    if (state.takimAbone) state.takimAbone();
    state.takimAbone = db.collection(KOLEKSIYON).doc(kod).collection("takimlar")
      .orderBy("olusturmaZamani").onSnapshot(snap => BIY._takimlariCiz(snap));
    BIY._kaydet();
    return kod;
  },
  async takimEkle(){
    const inp = $("takimAdiInput"); const ad = (inp.value || "").trim();
    if (!ad){ inp.focus(); return; }
    inp.value = "";
    try {
      const oda = await BIY._odayiHazirla();
      const takimId = rastgeleKod(5);
      await db.collection(KOLEKSIYON).doc(oda).collection("takimlar").doc(takimId).set({
        ad: ad, bagli: false, puan: 0, olusturmaZamani: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch(e){ console.error(e); $("baslatNot").textContent = (modAl()==="okul"?"Sınıf":"Takım") + " eklenemedi: " + (e.code || e.message); }
  },
  _takimlariCiz(snap){
    state.takimListe = []; state.bekleyenListe = [];
    snap.forEach(doc => {
      const t = doc.data();
      const k = { id: doc.id, ad: t.ad, bagli: !!t.bagli, puan: t.puan || 0, krk: t.krk || "" };
      if (t.atildi || t.red) return;                 // çıkarılan / reddedilen listede yok
      if (t.onay === false) state.bekleyenListe.push(k);   // onay bekliyor
      else state.takimListe.push(k);                        // takım modunda onay alanı hiç yoktur
    });
    let sayi = state.takimListe.length;
    let bagli = state.takimListe.filter(t => t.bagli).length;
    if (kartliMod()) BIY._takimKartlariCiz(); else BIY._katilimcilariCiz();
    BIY._ebaNotGuncelle();   // ilk katılım gelince EBA uyarısı kalkar
    // takım eklendiyse zorluk seviyesi, soru sayısı ve soru seçimi kilitlenir; hepsi silinince açılır
    // (lobiye dönüldüyse ayarKilidiKapali=true → takım bağlıyken de değiştirilebilir)
    const kilit = sayi > 0 && !state.ayarKilidiKapali;
    document.querySelectorAll(".biy-seviye-btn, .biy-sayi-btn, .biy-bicim-btn, .biy-bs-oge").forEach(b => { b.disabled = kilit; b.classList.toggle("biy-pasif", kilit); });
    const sInp = $("soruSayiInput"); if (sInp){ sInp.disabled = kilit; sInp.classList.toggle("biy-pasif", kilit); }
    const ssBtn = $("soruSecBtn"); if (ssBtn){ ssBtn.disabled = kilit; ssBtn.classList.toggle("biy-pasif", kilit); }
    const kSel = $("konuSecim"); if (kSel){ kSel.disabled = kilit; kSel.classList.toggle("biy-pasif", kilit); }
    const kBtn = $("konuSeciciBtn");
    if (kBtn){ kBtn.disabled = kilit; kBtn.classList.toggle("biy-pasif", kilit); if (kilit) BIY.konuListeKapat(); }
    const sLbl = document.querySelector(".biy-sorusayi-secim .biy-seviye-label");
    const zLbl = document.querySelector(".biy-seviye-secim .biy-seviye-label");
    if (zLbl) zLbl.classList.toggle("biy-pasif", kilit);
    if (sLbl) sLbl.classList.toggle("biy-pasif", kilit);
    if (!kilit) BIY._soruSayiSinir();   // kilit açıldıysa mevcut soruya göre üst sınırı yeniden uygula

    const baslat = $("baslatBtn");
    const d = BIY._baslatDurumu();
    if (d.olur) baslat.classList.remove("gizli"); else baslat.classList.add("gizli");
    $("baslatNot").textContent = d.not;
    // yeni bağlanan takım(lar) için ses (açılışta çalmaz)
    const simdiBagli = new Set(state.takimListe.filter(t => t.bagli).map(t => t.id));
    if (state.baglIlk && state.baglSet){
      let yeni = false; simdiBagli.forEach(id => { if (!state.baglSet.has(id)) yeni = true; });
      if (yeni) SES.baglandi();
    }
    state.baglSet = simdiBagli; state.baglIlk = true;
    BIY._dijitalKartDurum();   // ana menü kartı için bağlı cihaz göstergesini güncelle
  },
  async takimSil(takimId){
    if (!state.odaId) return;
    try { await db.collection(KOLEKSIYON).doc(state.odaId).collection("takimlar").doc(takimId).delete(); } catch(e){ console.error(e); }
  },
  kopyala(btn){
    const inp = btn.parentElement.querySelector("input");
    inp.select(); inp.setSelectionRange(0, 99999);
    try { navigator.clipboard.writeText(inp.value); btn.textContent = "✓"; setTimeout(()=>btn.textContent="Kopyala", 1200); } catch(e){ document.execCommand("copy"); }
  },

  /* ---------- YARIŞMAYI BAŞLAT (oyun döngüsü) ---------- */
  setSoruSayisi(n){
    const max = state.soruSayiMax || 50;
    n = Math.max(1, Math.min(max, parseInt(n, 10) || max));
    state.soruSayisi = n;
    state.soruSayiHavuzdan = false;
    state.soruHedef = n;              // havuzdan en fazla bu kadar soru seçilebilir
    BIY._sepetGuncelle();
    const hazir = SORU_SAYI_SECENEK.indexOf(n) >= 0;
    document.querySelectorAll(".biy-sayi-btn").forEach(b => b.classList.toggle("secili", +b.getAttribute("data-sayi") === n));
    const inp = $("soruSayiInput"); if (inp){ inp.value = hazir ? "" : n; }
    BIY._sayiDonDur();
    BIY._sayiEtiket(n, "secili");
    BIY._menuDurum();
  },
  setSoruSayisiManuel(v){
    let n = parseInt(v, 10);
    if (isNaN(n)){ return; }
    const max = state.soruSayiMax || 50;
    n = Math.max(1, Math.min(max, n));
    state.soruSayisi = n;
    state.soruSayiHavuzdan = false;
    // manuel giriş yapıldı → hazır rakamlardaki yeşil vurgu kalksın
    document.querySelectorAll(".biy-sayi-btn").forEach(b => b.classList.remove("secili"));
    const inp = $("soruSayiInput"); if (inp) inp.value = n;
    BIY._sayiDonDur();
    BIY._sayiEtiket(n, "secili");
    BIY._menuDurum();
  },

  async yarisiBaslat(){
    if (!state.odaId) return;
    const d0 = BIY._baslatDurumu();
    if (!d0.olur){ $("baslatNot").textContent = d0.not; return; }

    let secilen, yedek;
    const elle = BIY._secilenSorular();   // öğretmenin havuzdan elle seçtiği sorular
    if (elle.length){
      // MANUEL: yalnızca öğretmenin görüp seçtiği sorular sorulur
      let hv = elle.slice();
      for (let i = hv.length-1; i > 0; i--){ const j = Math.floor(Math.random()*(i+1)); const g = hv[i]; hv[i] = hv[j]; hv[j] = g; }
      secilen = hv.map(soruHazirla);
      yedek = [];   // görülmemiş yedek sorulmaz
    } else {
      const tumu = BIY._bicimliSorular().slice();   // konunun tüm soruları (yalnız seçili biçimler)
      if (!tumu.length){ $("baslatNot").textContent = "«" + (BIY._aktifKonu() ? BIY._aktifKonu().ad : "") + "» henüz soru içermiyor."; return; }
      for (let i = tumu.length-1; i > 0; i--){ const j = Math.floor(Math.random()*(i+1)); const g = tumu[i]; tumu[i] = tumu[j]; tumu[j] = g; }
      const hedefSayi = Math.max(1, Math.min(50, state.soruSayisi || TUR_SORU_SAYISI));
      secilen = tumu.slice(0, Math.min(hedefSayi, tumu.length)).map(soruHazirla);
      yedek = tumu.slice(secilen.length).map(soruHazirla);
    }
    state.oyunSorulari = secilen;
    state.yedekSorular = yedek;   // beraberlikte yedek olarak kullanılır
    state.yedekSoruMap = {};
    state.berHedef = 0; state.berTakimlar = []; state.berSabit = {}; state.berNo = 0; state.berSorular = [];
    state.ayarKilidiKapali = false;   // yeni tur başladı → normal kilit davranışı
    await BIY._cevaplariSil();         // oda yeniden kullanılıyorsa eski cevapları temizle
    try {
      await db.collection(KOLEKSIYON).doc(state.odaId).update({
        durum: "oyun", faz: "cevap", aktifIndex: 0, toplamSoru: secilen.length,
        soruSuresi: BIY._soruSuresi(secilen[0]), gecenEk: 0, duraklatildi: false, duraklatKalan: 0,
        mod: modAl(),
        soruIdSirasi: secilen.map(s => s.id),
        aktifSoru: temizSoru(secilen[0]),
        soruBaslangic: firebase.firestore.FieldValue.serverTimestamp()
      });
      BIY._kaydet();
      BIY._adminOyunaGec();
    } catch(e){ console.error(e); $("baslatNot").textContent = "Başlatılamadı: " + (e.code || e.message); }
  },

  _adminOyunaGec(){
    ekranGoster("ekranOyunAdmin");
    if (state.odaAboneAdmin) state.odaAboneAdmin();
    state.odaAboneAdmin = db.collection(KOLEKSIYON).doc(state.odaId).onSnapshot(d => {
      state.oda = d.data() || null;
      BIY._renderAdminOyun();
    });
    if (state.cevapAbone) state.cevapAbone();
    state.cevaplar = {};
    state.cevapAbone = db.collection(KOLEKSIYON).doc(state.odaId).collection("cevaplar").onSnapshot(snap => {
      state.cevaplar = {}; snap.forEach(d => state.cevaplar[d.id] = d.data());
      BIY._renderAdminOyun();
    });
  },

  _renderAdminOyun(){
    const o = state.oda, kap = $("ekranOyunAdmin");
    if (!o) return;
    if (o.durum === "bitti"){
      sayacDurdur(); BIY._sonucTemizle();
      kap.innerHTML = BIY._leaderboardHtml(true);
      if (!state.finalKonfeti){ state.finalKonfeti = true; BIY._konfetiPatlat(); }
      return;
    }
    const ber = (o.durum === "beraberlik");
    const idx = o.aktifIndex || 0;
    const soru = BIY._soruByIndex(idx);
    if (!soru){ kap.innerHTML = '<div class="biy-oyun-orta"><p class="biy-alt">Bu turun soruları bulunamadı (sayfa yenilenmiş olabilir). Yarışmayı yeniden başlat.</p><button class="biy-btn biy-btn-mavi" onclick="BIY.anasayfa()">القائِمَة الرَّئيسَة</button></div>'; return; }
    const sonuc = (o.faz === "sonuc");
    const t = TIP_BILGI[soru.tip] || { ad: soru.tip, emoji: "❓" };
    // SONUÇ EKRANI — soru ekranından tamamen ayrı (adım adım animasyonlu)
    if (sonuc){
      sayacDurdur();
      const taze = (state.sonucAnimIndex !== idx);
      kap.innerHTML = BIY._sonucEkranHtml(idx, soru, taze);
      BIY._sonucSigdirGecikmeli();
      if (taze){
        state.sonucAnimIndex = idx;
        SES.sonuc();                                  // sonuç ekranı açıldı
        BIY._sonucOynat();                            // sıralama sesi FLIP anında (_liderlikGecis) çalar
      }
      return;
    }
    // beraberlikte yalnızca beraber olan takımlar; değilse tüm takımlar
    const katilan = BIY._aktifTakimlar();
    const katilanId = {}; katilan.forEach(t => katilanId[t.id] = true);
    // cevaplar (bu index)
    const buCevaplar = {}; Object.values(state.cevaplar).forEach(c => { if (c.index === idx && katilanId[c.takimId]) buCevaplar[c.takimId] = c; });
    const cevapSayisi = Object.keys(buCevaplar).length;
    // seçenekler
    const opt = tahtaIcerikHtml(soru, !!sonuc);
    // üst bilgi + sayaç
    const kalan = kalanSaniye();
    const yuzde = Math.max(0, Math.min(100, (kalan / (o.soruSuresi || SORU_SURESI)) * 100));
    /* v90: öğretmen gözü açıp soruyu göstermiş olsa bile, YENİ SORUYA
       geçilince soru yeniden gizlenir (varsayılan davranışa döner).      */
    if (state.gizliIndex !== idx){ state.gizliIndex = idx; state.soruGizli = true; }
    const gizli = state.soruGizli;
    // göz ikonu (tur sırasının yanında): açık göz = görünür (tıkla gizle), çapraz göz = gizli (tıkla göster)
    const gozSvg = state.soruGizli
      ? '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 12 1 12a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'
      : '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    const gozBtn = '<button class="biy-gizle-svg" title="'+(state.soruGizli?'Soruyu göster':'Soruyu gizle')+'" onclick="BIY.soruGizleToggle()">'+gozSvg+'</button>';
    // durdur / devam (tek tuş) — yalnız cevap fazında anlamlı
    const duruyor = duraklatiliyorMu();
    const durBtn = '<button class="biy-durdur-svg'+(duruyor?' duruyor':'')+'" title="'
      + (duruyor ? 'Devam et' : 'Duraklat') + '" aria-label="'
      + (duruyor ? 'Devam et' : 'Duraklat') + '" onclick="BIY.duraklatToggle()">'
      + (duruyor ? _SVG_DEVAM : _SVG_DURDUR) + '</button>';

    const cips = BIY._ciplerHtml(katilan, buCevaplar);
    const hepsi = katilan.length > 0 && cevapSayisi >= katilan.length;

    const sayacHtml = '<div class="biy-sayac'+(duruyor?' biy-donuk':'')+'"><span id="sayacNum">'+kalan+'</span><small>ث</small></div>';
    const barHtml = '<div class="biy-sayac-bar'+(duruyor?' biy-donuk':'')+'"><i style="width:'+yuzde+'%"></i></div>';
    const duraklatSerit = duruyor
      ? '<div class="biy-duraklat-serit">'+_SVG_DURDUR+'<span>Yarışma duraklatıldı</span></div>' : '';
    const siraMetin = ber
      ? '⚔️ '+(o.berHedef===1?'Birinci':'İkinci')+' · Beraberlik sorusu '+o.berNo
      : 'Soru '+(idx+1)+' / '+(o.toplamSoru||state.oyunSorulari.length);

    let govde =
      '<div class="biy-oyun-ust">' +
        '<div class="biy-oyun-sira'+(ber?' biy-ber':'')+'">'+siraMetin+' '+gozBtn+durBtn+'</div>' +
        '<div class="biy-oyun-tip"></div>' +
        // soru gizliyken geri sayım üstte değil, aşağıda büyük gösterilir
        (gizli ? '' : sayacHtml) +
      '</div>' +
      (gizli ? '' : barHtml) + duraklatSerit;

    // soru gizliyken hiçbir kutu gösterilmez (sınıf durumu + geri sayım aşağıda büyük)
    if (!gizli){
      govde += etiketHtml(soru) + '<div class="biy-oyun-soru">'+ soruHtml(soru) +'</div>' +
        (soru.arapca ? '<div class="biy-oyun-arapca">'+ kacis(soru.arapca) +'</div>' : '') +
        '<div class="biy-a-optlar">'+ opt +'</div>';
    }
    // sınıfların durumu (gizliyken çok daha büyük)
    /* v96: kalabalik olunca cipler kuculur (yazi boyu CSS'te) */
    const kaydir = ((modAl() === "birey" && katilan.length > 10) ? " biy-kaydir" : "")
                 + (katilan.length > 16 ? " biy-cok biy-pek-cok" : (katilan.length > 8 ? " biy-cok" : ""));
    govde += '<div class="biy-cevap-durum'+(gizli?' biy-dev':'')+'">'+cevapSayisi+' / '+katilan.length+' cevapladı'+(hepsi?' — sonuç geliyor…':'')+'</div>' +
             '<div class="biy-cipler'+(gizli?' biy-dev':'')+kaydir+'">'+cips+'</div>';
    // gizliyken geri sayım AŞAĞIDA ve devasa
    if (gizli){
      govde += '<div class="biy-alt-sayac">'+barHtml+'<div class="biy-sayac biy-sayac-dev"><span id="sayacNum">'+kalan+'</span><small>sn</small></div></div>';
    }

    kap.innerHTML = '<div class="biy-oyun-orta">'+govde+'</div>';

    // her yeni cevapta kısa ses (kurucunun cihazında); son cevapta
    // 'tümü cevapladı' melodisi çalacağı için blip atlanır. Sayfa yenilenince
    // sayaç mevcut cevap sayısıyla başlar → eski cevaplar için çalmaz.
    if (state.cevapSesIndex !== idx){ state.cevapSesIndex = idx; state.cevapSesSayi = cevapSayisi; }
    else if (cevapSayisi > state.cevapSesSayi){
      if (!hepsi) SES.cevapGeldi();
      state.cevapSesSayi = cevapSayisi;
    }
    // tüm takımlar cevaplayınca ses (soru başına bir kez)
    if (hepsi && state.hepsiSesIndex !== idx){ state.hepsiSesIndex = idx; SES.hepsiCevap(); }
    // otomatik sonuç: tüm takımlar cevaplayınca
    if (hepsi && state.otoSonucIndex !== idx){
      state.otoSonucIndex = idx;
      setTimeout(function(){ if (state.oda && state.oda.faz === 'cevap' && (state.oda.aktifIndex||0) === idx) BIY.sonucGoster(); }, 450);
    }
    // sayaç + süre bitince otomatik sonuç
    sayacBaslat(() => {
      const k = kalanSaniye(); const el = $("sayacNum"); if (el) el.textContent = k;
      const bar = document.querySelector(".biy-sayac-bar i"); if (bar) bar.style.width = Math.max(0, Math.min(100, (k/(o.soruSuresi||SORU_SURESI))*100)) + "%";
      if (k <= 0 && !duraklatiliyorMu() && state.oda && state.oda.faz === 'cevap' && (state.oda.aktifIndex||0) === idx && state.otoSonucIndex !== idx){
        state.otoSonucIndex = idx; BIY.sonucGoster();
      }
    });
  },

  // index'e göre soru (ana tur veya yedek)
  _soruByIndex(i){ return (i >= 1000) ? (state.yedekSoruMap && state.yedekSoruMap[i]) : state.oyunSorulari[i]; },
  // bir doğru cevabın puanı: 1000/toplam taban + küçük hız bonusu (en fazla %15)
  _cevapPuani(c){
    const o = state.oda || {};
    const toplam = o.toplamSoru || state.oyunSorulari.length || state.soruSayisi || 1;
    const sure = o.soruSuresi || SORU_SURESI;
    const taban = TOPLAM_PUAN / toplam;
    let hiz = (typeof c.kalan === 'number') ? (c.kalan / sure) : 1;   // eski cevaplarda kalan yoksa tam say
    hiz = Math.max(0, Math.min(1, hiz));
    return Math.round(taban * (1 - ZAMAN_PAYI + ZAMAN_PAYI * hiz));
  },
  // belirli index'e kadar (dahil) her takımın toplam puanı (yedekler dahil)
  _puanKumul(cutoff){
    const t = {};
    Object.values(state.cevaplar).forEach(c => {
      if (c.index > cutoff) return;
      const s = BIY._soruByIndex(c.index); if (!s) return;
      if (cevapDogruMu(s, c.secilen)) t[c.takimId] = (t[c.takimId] || 0) + BIY._cevapPuani(c);
    });
    return t;
  },
  _rank(puanMap, ids){
    const r = {};
    ids.forEach(id => { const p = puanMap[id] || 0; r[id] = 1 + ids.filter(o => (puanMap[o]||0) > p).length; });
    return r;
  },
  // AYRI SONUÇ EKRANI (soru ekranından bağımsız) — adım adım animasyonlu
  // Akış: (0) doğru şık büyük → (1) sınıfların cevapları → (2) doğru şık küçülür → (3) liderlik tablosu büyür + sıra atlayanlar → (4) buton
  _sonucEkranHtml(idx, soru, taze){
    const o = state.oda;
    const ber = (o.durum === "beraberlik");
    const toplam = o.toplamSoru || state.oyunSorulari.length;
    const buCevaplar = {}; Object.values(state.cevaplar).forEach(c => { if (c.index === idx) buCevaplar[c.takimId] = c; });
    // soru + şıklar (doğru şık vurgulu)
    const optHtml = tahtaIcerikHtml(soru, true);
    // sınıfların sonucu: seçtikleri şık + doğru/yanlış (beraberlikte yalnızca beraber olanlar)
    const cevapTakimlari = BIY._aktifTakimlar();
    const satir = cevapTakimlari.map((tk,ri) => {
      const c = buCevaplar[tk.id]; const dogruMu = !!(c && cevapDogruMu(soru, c.secilen));
      const secim = c ? secimHtml(soru, c.secilen) : '<span class="biy-rev-yok">—</span>';
      const durum = c ? (dogruMu ? '✅ Doğru' : '❌ Yanlış') : '⏳ Cevapsız';
      return '<tr class="'+(c?(dogruMu?'dogru':'yanlis'):'yok')+'" style="--r:'+ri+'"><td>'+krkSvg(tk.krk, "biy-krk-mini")+kacis(tk.ad)+'</td><td class="biy-rev-sik">'+secim+'</td><td>'+durum+'</td></tr>';
    }).join("");
    // puan durumu (yedekler dahil) + sıra değişimi
    const ids = state.takimListe.map(t => t.id);
    const newP = BIY._puanKumul(idx), prevP = BIY._puanKumul(idx - 1);
    let newOrder, prevOrder;
    if (ber){
      newOrder  = BIY._pinliSira(ids, newP,  o.berTakimlar, o.berSabit, o.berHedef);
      prevOrder = BIY._pinliSira(ids, prevP, o.berTakimlar, o.berSabit, o.berHedef);
    } else {
      newOrder  = ids.slice().sort((a,b) => (newP[b]||0)-(newP[a]||0));
      prevOrder = ids.slice().sort((a,b) => (prevP[b]||0)-(prevP[a]||0));
    }
    const rankMap = arr => { const m = {}; arr.forEach((id,i) => m[id] = i+1); return m; };
    const newR = ber ? rankMap(newOrder) : BIY._rank(newP, ids);
    const prevR = ber ? rankMap(prevOrder) : BIY._rank(prevP, ids);
    const adOf  = id => { const t = state.takimListe.find(x => x.id === id) || {}; return t.ad || ""; };
    const krkOf = id => { const t = state.takimListe.find(x => x.id === id) || {}; return t.krk || ""; };
    // sonuç tablosunun ilk sütun başlığı moda göre
    const basSutun = modAl() === "birey" ? "Katılımcı" : (modAl() === "okul" ? "Sınıf" : "Takım");
    const lider = newOrder.map(id => {
      const ns = newR[id] || ids.length, ps = prevR[id] || ids.length, delta = ps - ns;
      const ok = delta > 0 ? '<span class="biy-ok biy-ok-yukari">▲</span>' : (delta < 0 ? '<span class="biy-ok biy-ok-asagi">▼</span>' : '<span class="biy-ok biy-ok-sabit"></span>');
      const cls = delta > 0 ? ' biy-lider-yukari' : (delta < 0 ? ' biy-lider-asagi' : '');
      return '<li class="biy-lider-satir'+cls+'"><span class="biy-lider-sira">'+ns+'</span>'+ok+'<span class="biy-lider-ad">'+krkSvg(krkOf(id), "biy-krk-mini")+kacis(adOf(id))+'</span><b>'+(newP[id]||0)+'</b></li>';
    }).join("");
    const degisti = ids.some(id => (prevR[id]||ids.length) !== (newR[id]||ids.length));
    const son = ber ? true : (idx + 1 >= toplam);
    const step = taze ? 0 : 2;   // yenileme olursa doğrudan son sahne (liderlik)
    const t = TIP_BILGI[soru.tip] || { ad: soru.tip, emoji: "❓" };
    const baslik = ber
      ? '⚔️ '+(o.berHedef===1?'Birinci':'İkinci')+' · Beraberlik · Soru '+o.berNo
      : '📊 Sonuç · Soru '+(idx+1)+' / '+toplam;
    /* kalabalik sinifta satirlar otomatik kuculsun (kaydirmadan sigsin) */
    const kisiSay = Math.max(cevapTakimlari.length, newOrder.length);
    const kalabalik = kisiSay > 14 ? " biy-sonuc-kalabalik biy-pek-cok"
                    : (kisiSay > 7 ? " biy-sonuc-kalabalik" : "");
    return '<div class="biy-oyun-orta biy-sonuc-ekran'+kalabalik+'" data-degisti="'+(degisti?1:0)+'" data-step="'+step+'">' +
      '<div class="biy-sonuc-baslik'+(ber?' biy-ber':'')+'">'+baslik+'</div>' +
      '<div class="biy-sonuc-sahne">' +
        // SAHNE 1: soru cümlesi + şıklar + vurgulu doğru şık
        '<div class="biy-sahne-oge oge-dogru"><div class="biy-sahne-ic">' +
          etiketHtml(soru) + '<div class="biy-sonuc-soru-cumle">'+soruHtml(soru)+'</div>' +
          (soru.arapca ? '<div class="biy-oyun-arapca">'+kacis(soru.arapca)+'</div>' : '') +
          '<div class="biy-a-optlar">'+optHtml+'</div>' +
        '</div></div>' +
        // SAHNE 2: sınıfların verdiği cevaplar (devasa)
        '<div class="biy-sahne-oge oge-reveal"><div class="biy-sahne-ic">' +
          '<div class="biy-reveal'+(cevapTakimlari.length > 8 && modAl() === "birey" ? ' biy-kaydir' : '')+'"><table class="biy-reveal-tablo"><thead><tr><th>'+basSutun+'</th><th>الإِجابَة</th><th>الحالَة</th></tr></thead><tbody>'+satir+'</tbody></table></div>' +
        '</div></div>' +
        // SAHNE 3: güncel puan durumu (devasa)
        '<div class="biy-sahne-oge oge-lider"><div class="biy-sahne-ic">' +
          '<div class="biy-sonuc-lider"><h4>🏆 Sonuçlar</h4><ol class="biy-lider-ol'+(newOrder.length>10?' biy-kaydir':'')+'">'+lider+'</ol></div>' +
        '</div></div>' +
      '</div>' +
      // aşağıda üç ilerleme çizgisi — tıklayınca ilgili sayfaya geçer
      '<div class="biy-sonuc-nokta">' +
        '<button class="biy-nokta" data-adim="0" onclick="BIY.sonucAdim(0)" title="Soru ve doğru cevap"><span class="biy-nk-ikon"><svg viewBox="0 0 24 24" class="biy-nk-svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="M8.2 12.4l2.6 2.6 5-5.8"/></svg></span><i class="biy-nk-cizgi"></i></button>' +
        '<button class="biy-nokta" data-adim="1" onclick="BIY.sonucAdim(1)" title="Katılımcı cevapları"><span class="biy-nk-ikon"><svg viewBox="0 0 24 24" class="biy-nk-svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.6" cy="6" r="1.5"/><path d="M10 6h8.4"/><circle cx="5.6" cy="12" r="1.5"/><path d="M10 12h8.4"/><circle cx="5.6" cy="18" r="1.5"/><path d="M10 18h8.4"/></svg></span><i class="biy-nk-cizgi"></i></button>' +
        '<button class="biy-nokta" data-adim="2" onclick="BIY.sonucAdim(2)" title="Sonuçlar"><span class="biy-nk-ikon"><svg viewBox="0 0 24 24" class="biy-nk-svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="13" width="4.6" height="7.4" rx="1.2"/><rect x="9.7" y="8.4" width="4.6" height="12" rx="1.2"/><rect x="15.4" y="15" width="4.6" height="5.4" rx="1.2"/></svg></span><i class="biy-nk-cizgi"></i></button>' +
      '</div>' +
      '<div class="biy-oyun-kontrol"><button class="biy-btn biy-btn-buyuk" onclick="BIY.sonrakiSoru()">'+
        (ber ? ((BIY._beraberlikCozuldu() || state.berNo >= state.yedekSorular.length) ? '🏁 Sıralamayı onayla' : 'Sonraki beraberlik sorusu ›')
             : (son ? '🏁 Yarışmayı bitir' : 'Sonraki soru ›')) +
      '</button></div>' +
    '</div>';
  },
  /* Sonuç sahnesi kalan yüksekliğe sığmıyorsa oransal küçült (masaüstü/tahta).
     Böylece kalabalık sınıfta satırlar yarım kesilmez, kaydırmaya gerek kalmaz. */
  _sonucSigdir(){
    if (window.innerWidth < 900) return;
    const ekr = document.querySelector("#ekranOyunAdmin .biy-sonuc-ekran"); if (!ekr) return;
    const sec = [".oge-dogru", ".oge-reveal", ".oge-lider"][+(ekr.getAttribute("data-step") || 0)] || ".oge-lider";
    const oge = ekr.querySelector(sec); if (!oge) return;
    const ic = oge.querySelector(".biy-sahne-ic"); if (!ic) return;
    ic.style.zoom = "";
    if (!oge.clientHeight) return;
    /* yakinsayana kadar birkac tur: zoom uygulanip yeniden olculur */
    let z = 1;
    for (let i = 0; i < 6; i++){
      const bos = oge.clientHeight, fazla = oge.scrollHeight - bos;
      if (fazla <= 1) break;
      z = Math.max(0.34, z * (bos / (bos + fazla)) * 0.99);
      ic.style.zoom = z.toFixed(3);
    }
  },
  _sonucSigdirGecikmeli(){
    [60, 420, 900].forEach(ms => setTimeout(() => BIY._sonucSigdir(), ms));
  },
  // ilerleme çizgisine basınca ilgili sonuç sayfasına geç (otomatik akışı durdur)
  sonucAdim(n){
    BIY._sonucTemizle();
    const e = document.querySelector(".biy-sonuc-ekran"); if (e) e.setAttribute("data-step", String(n));
    BIY._sonucSigdirGecikmeli();
  },
  // sonuç ekranı sahne akışı: her öğe devasa gösterilir; yenisi gelince önceki yukarı kayıp kaybolur
  _sonucOynat(){
    BIY._sonucTemizle();
    const el0 = document.querySelector(".biy-sonuc-ekran");
    const degisti = el0 && el0.getAttribute("data-degisti") === "1";
    const set = (n) => { const e = document.querySelector(".biy-sonuc-ekran"); if (e) e.setAttribute("data-step", String(n)); BIY._sonucSigdirGecikmeli(); };
    state.sonucTimerlar.push(setTimeout(() => set(1), 7000));   // sahne 2: sınıf cevapları (soru+şıklar daha uzun beklesin)
    state.sonucTimerlar.push(setTimeout(() => set(2), 10500));  // sahne 3: liderlik + buton
    if (degisti) state.sonucTimerlar.push(setTimeout(() => SES.siraDegisti(), 10700));
  },
  _sonucTemizle(){ (state.sonucTimerlar || []).forEach(t => clearTimeout(t)); state.sonucTimerlar = []; },

  _siraliTakimlar(){
    return state.takimListe.slice().sort((a,b) => (b.puan||0) - (a.puan||0));
  },
  _miniLiderHtml(){
    return '<h4>Sonuçlar</h4><ol class="biy-lider-ol">' +
      BIY._siraliTakimlar().map(t => '<li><span>'+kacis(t.ad)+'</span><b>'+(t.puan||0)+'</b></li>').join("") + '</ol>';
  },
  _leaderboardHtml(final){
    const o = state.oda || {};
    const P = BIY._puanKumul(1e12);   // yedekler dahil toplam puanlar
    const puanOf = t => (P[t.id] != null ? P[t.id] : (t.puan || 0));
    let sirali;
    if (Array.isArray(o.sonSira) && o.sonSira.length){
      sirali = o.sonSira.map(id => state.takimListe.find(t => t.id === id)).filter(Boolean);
      state.takimListe.forEach(t => { if (sirali.indexOf(t) < 0) sirali.push(t); });
    } else {
      sirali = state.takimListe.slice().sort((a,b) => puanOf(b) - puanOf(a));
    }
    const madalya = ["🥇","🥈","🥉"];
    return '<div class="biy-oyun-orta biy-final">' +
      '<div class="biy-logo">'+simge("🏆")+'</div><h1>اِنْتَهَت المُسابَقَة!</h1>' +
      '<ol class="biy-final-ol'+(sirali.length>10?' biy-kaydir':'')+'">' +
        sirali.map((t,i) => '<li class="'+(i<3?'podyum':'')+(i===0?' birinci':'')+'" style="--i:'+i+'"><span class="biy-final-sira">'+(madalya[i]||(i+1))+'</span><span class="biy-final-ad">'+kacis(t.ad)+'</span><b>'+puanOf(t)+'</b></li>').join("") +
      '</ol>' +
      '<div class="biy-final-butonlar">' +
        '<button class="biy-btn biy-btn-yesil" onclick="BIY.lobiyeDon()">🔄 Beklemeye dön (' + cogSozu() + ' bağlı kalır)</button>' +
        '<button class="biy-btn biy-btn-mavi" onclick="BIY.oyunuBitir()">Bitir &amp; menü</button>' +
      '</div>' +
    '</div>';
  },
  // yarışma bitti — konfeti patlaması (harici kütüphane yok)
  _konfetiPatlat(){
    const renkler = ["#F1C40F","#EF5350","#27AE60","#3498DB","#9B59B6","#FF7AC6","#F39C12","#20C997","#FFFFFF"];
    const kap = document.createElement("div");
    kap.className = "biy-konfeti-kap";
    let h = "";
    const N = 160;
    for (let i = 0; i < N; i++){
      const sol = (Math.random()*100).toFixed(2);
      const renk = renkler[(Math.random()*renkler.length)|0];
      const gecikme = (Math.random()*0.9).toFixed(2);
      const sure = (2.6 + Math.random()*2.4).toFixed(2);
      const don = ((Math.random()*900 - 450)|0);
      const en = 6 + (Math.random()*9|0);
      const yuvarlak = Math.random() < 0.35;
      const boy = yuvarlak ? en : Math.max(4, (en*0.5)|0);
      const sx = ((Math.random()*46 - 23)|0);
      h += '<i style="left:'+sol+'%;background:'+renk+';width:'+en+'px;height:'+boy+'px;border-radius:'+(yuvarlak?'50%':'2px')+
           ';animation-delay:'+gecikme+'s;animation-duration:'+sure+'s;--don:'+don+'deg;--sx:'+sx+'px"></i>';
    }
    kap.innerHTML = h;
    const hedef = document.getElementById("ekranOyunAdmin") || document.body;
    hedef.appendChild(kap);
    setTimeout(function(){ if (kap.parentNode) kap.parentNode.removeChild(kap); }, 8000);
  },

  soruGizleToggle(){ state.soruGizli = !state.soruGizli; BIY._renderAdminOyun(); },

  /* ---------- DURDUR / DEVAM ----------
     Duraklatınca kalan saniye oda belgesine yazılır ve sayaç donar; devam
     edince soruBaslangic yenilenir, "gecenEk" ile geçmiş süre korunur.
     soruSuresi hiç değişmediği için hız bonusu bozulmaz.               */
  async duraklatToggle(){
    const o = state.oda; if (!o || !state.odaId) return;
    if (o.faz !== "cevap") return;                       // sonuç ekranında anlamsız
    const sure = o.soruSuresi || SORU_SURESI;
    try {
      if (o.duraklatildi){
        const kalan = Math.max(0, Math.round(o.duraklatKalan != null ? o.duraklatKalan : sure));
        await db.collection(KOLEKSIYON).doc(state.odaId).update({
          duraklatildi: false,
          duraklatKalan: 0,
          gecenEk: Math.max(0, sure - kalan),
          soruBaslangic: firebase.firestore.FieldValue.serverTimestamp()
        });
      } else {
        await db.collection(KOLEKSIYON).doc(state.odaId).update({
          duraklatildi: true,
          duraklatKalan: kalanSaniye()
        });
      }
      try { SES.cevapGeldi(); } catch(e){}
    } catch(e){ console.error(e); }
  },

  async sonucGoster(){
    if (!state.odaId) return;
    try {
      await BIY._puanlariGuncelle();
      await db.collection(KOLEKSIYON).doc(state.odaId).update({ faz: "sonuc" });
    } catch(e){ console.error(e); }
  },
  _puanlariGuncelle(){
    // her takımın TOPLAM puanını tüm cevaplardan hesapla (yedekler dahil, idempotent)
    const toplam = BIY._puanKumul(1e12);
    const batch = db.batch();
    state.takimListe.forEach(t => {
      const ref = db.collection(KOLEKSIYON).doc(state.odaId).collection("takimlar").doc(t.id);
      batch.update(ref, { puan: toplam[t.id] || 0 });
    });
    return batch.commit();
  },
  async sonrakiSoru(){
    if (!state.odaId || !state.oda) return;
    BIY._sonucTemizle();
    // beraberlik turundaysak: çözüldüyse bitir, değilse sonraki yedek soru
    if (state.oda.durum === "beraberlik"){ return BIY._yedekVeyaBitir(); }
    const next = (state.oda.aktifIndex || 0) + 1;
    try {
      if (next >= (state.oda.toplamSoru || state.oyunSorulari.length)){
        await BIY._bitirVeyaBeraberlik();   // beraberlik varsa yedek soruya geç, yoksa bitir
      } else {
        await db.collection(KOLEKSIYON).doc(state.odaId).update({
          aktifIndex: next, faz: "cevap",
          aktifSoru: temizSoru(state.oyunSorulari[next]),
          soruSuresi: BIY._soruSuresi(state.oyunSorulari[next]),
          gecenEk: 0, duraklatildi: false, duraklatKalan: 0,
          soruBaslangic: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    } catch(e){ console.error(e); }
  },

  /* ---------- BERABERLİK (yedek soru — aynı tasarım, puanlar toplama eklenir) ---------- */
  _aktifTakimlar(){
    const o = state.oda;
    if (o && o.durum === "beraberlik" && Array.isArray(o.berTakimlar)) return state.takimListe.filter(t => o.berTakimlar.indexOf(t.id) >= 0);
    return state.takimListe;
  },
  // sadece liderlik(1) veya ikincilik(2) için beraberlik var mı?
  _beraberlikDurumu(puanMap, ids){
    const pts = id => puanMap[id] || 0;
    if (ids.length < 2) return { hedef: 0 };
    const maxP = Math.max.apply(null, ids.map(pts));
    const topGroup = ids.filter(id => pts(id) === maxP);
    let hedef = 0, tied = [];
    if (topGroup.length > 1){ hedef = 1; tied = topGroup; }
    else {
      const rest = ids.filter(id => pts(id) !== maxP);
      if (rest.length){
        const secondP = Math.max.apply(null, rest.map(pts));
        const secondGroup = ids.filter(id => pts(id) === secondP);
        if (secondGroup.length > 1){ hedef = 2; tied = secondGroup; }
      }
    }
    if (!hedef) return { hedef: 0 };
    const sabit = {};
    ids.forEach(id => { if (tied.indexOf(id) >= 0) return; sabit[id] = 1 + ids.filter(o => pts(o) > pts(id)).length; });
    return { hedef, tied, sabit };
  },
  // pinli sıralama: sabitler kendi sırasında, beraber olanlar toplam puana göre hedef sıralarını doldurur
  _pinliSira(ids, pMap, tied, sabit, hedef){
    const total = id => pMap[id] || 0;
    const to = (tied||[]).slice().sort((a,b) => total(b) - total(a));
    const arr = new Array(ids.length).fill(null);
    to.forEach((id,i) => { arr[hedef - 1 + i] = id; });
    Object.keys(sabit||{}).forEach(id => { const r = sabit[id]; if (r>=1 && r<=arr.length) arr[r-1] = id; });
    const placed = new Set(arr.filter(Boolean)); let b = 0;
    ids.forEach(id => { if (!placed.has(id)){ while (arr[b]) b++; arr[b] = id; } });
    return arr;
  },
  // beraber olanlar artık farklı toplam puana sahipse çözülmüştür
  _beraberlikCozuldu(){
    const P = BIY._puanKumul(1e12);
    const vals = (state.berTakimlar||[]).map(id => P[id] || 0);
    return new Set(vals).size === vals.length;
  },
  async _bitirVeyaBeraberlik(){
    try { await BIY._puanlariGuncelle(); } catch(e){}
    const ids = state.takimListe.map(t => t.id);
    // Yedek soruyla beraberlik bozma takım ve okul modunda anlamlı (az sayıda
    // yarışmacı); birey modunda katılımcı çok, tam eşitlik nadir → doğrudan bitir.
    if (modAl() === "birey"){ await db.collection(KOLEKSIYON).doc(state.odaId).update({ durum: "bitti", sonSira: [] }); return; }
    const d = BIY._beraberlikDurumu(BIY._puanKumul(1e12), ids);
    if (!d.hedef){ await db.collection(KOLEKSIYON).doc(state.odaId).update({ durum: "bitti", sonSira: [] }); return; }
    state.berHedef = d.hedef; state.berTakimlar = d.tied; state.berSabit = d.sabit; state.berNo = 0; state.berSorular = [];
    await BIY._yedekSoruSor();
  },
  async _yedekSoruSor(){
    const q = state.yedekSorular[state.berNo];
    if (!q){ return BIY._beraberlikBitir(); }   // yedek soru kalmadı → mevcut sırayla bitir
    state.berNo += 1;
    const index = 1000 + state.berNo;
    state.yedekSoruMap[index] = q;             // puan hesabına dahil
    state.berSorular.push(index);
    state.otoSonucIndex = -1; state.sonucAnimIndex = -1; state.hepsiSesIndex = -1;
    BIY._kaydet();
    try {
      await db.collection(KOLEKSIYON).doc(state.odaId).update({
        durum: "beraberlik", berHedef: state.berHedef, berTakimlar: state.berTakimlar, berSabit: state.berSabit, berNo: state.berNo,
        aktifIndex: index, faz: "cevap", aktifSoru: temizSoru(q),
        soruSuresi: BIY._soruSuresi(q), gecenEk: 0, duraklatildi: false, duraklatKalan: 0,
        soruBaslangic: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch(e){ console.error(e); }
  },
  // yedek soru sonucundan sonra: çözüldüyse bitir, yedek kaldıysa devam
  async _yedekVeyaBitir(){
    if (BIY._beraberlikCozuldu() || state.berNo >= state.yedekSorular.length) return BIY._beraberlikBitir();
    return BIY._yedekSoruSor();
  },
  async _beraberlikBitir(){
    try { await BIY._puanlariGuncelle(); } catch(e){}
    const ids = state.takimListe.map(t => t.id);
    const sonSira = BIY._pinliSira(ids, BIY._puanKumul(1e12), state.berTakimlar, state.berSabit, state.berHedef);
    try { await db.collection(KOLEKSIYON).doc(state.odaId).update({ durum: "bitti", sonSira: sonSira }); } catch(e){ console.error(e); }
  },

  /* ---------- TAKIM MODU ---------- */
  async takimBagla(oda, takim){
    ekranGoster("ekranTakim");
    const takimRef = db.collection(KOLEKSIYON).doc(oda).collection("takimlar").doc(takim);
    try {
      const snap = await takimRef.get();
      if (!snap.exists){ BIY._takimIcerik('❌','لَمْ يوجَد الفَريق','الرّابِط غَيْر صالِح أَو حُذِف الفَريق.'); return; }
      state.takimAd = snap.data().ad || "Takım";
      state.takimKrk = snap.data().krk || "";
      BIY._krkIzle(oda);                     // alinan avatarlari canli izle
      // yenileme sonrası: bu soruyu zaten cevapladıysa hatırla
      try { const kc = JSON.parse(localStorage.getItem('biy_cevap') || 'null'); if (kc && kc.oda === oda && kc.takim === takim) state.sonCevapIndex = kc.index; } catch(e){}
      await takimRef.update({ bagli: true, sonGorulme: firebase.firestore.FieldValue.serverTimestamp() });
      if (state.takimNabiz) clearInterval(state.takimNabiz);
      state.takimNabiz = setInterval(() => { takimRef.update({ sonGorulme: firebase.firestore.FieldValue.serverTimestamp() }).catch(()=>{}); }, 20000);
      window.addEventListener("pagehide", () => { takimRef.update({ bagli: false }).catch(()=>{}); });

      if (state.odaAbone) state.odaAbone();
      state.odaAbone = db.collection(KOLEKSIYON).doc(oda).onSnapshot(d => { state.oda = d.data() || null; BIY._renderTakim(); });
    } catch(e){ console.error(e); BIY._takimIcerik('⚠️','تَعَذَّر الاتِّصال','تَحَقَّقْ مِن الإِنْتَرْنِت وَالرّابِط.'); }
  },
  /* =================================================================
     KARAKTER SECIMI — herkes bir avatar alir, ikincisi ayni avatari
     alamaz. Kilit Firestore'da odalar/{oda}/karakterler/{avatar}
     belgesiyle tutulur; yazim islem (transaction) icinde yapildigi icin
     iki cihaz ayni anda bassa bile yalnizca biri kazanir.
     ================================================================= */
  _krkIzle(oda){
    if (state.krkAbone){ state.krkAbone(); state.krkAbone = null; }
    state.krkAbone = db.collection(KOLEKSIYON).doc(oda).collection("karakterler")
      .onSnapshot(s => {
        const m = {}; s.forEach(d => { m[d.id] = (d.data() || {}).takim || ""; });
        state.krkKapali = m;
        BIY._krkTazele();
      }, e => console.warn("karakter dinleme:", e));
  },
  _krkBenim(){ return (state.odaTakim && state.odaTakim.takim) || state.katilimId || ""; },
  _krkModu(){
    return (state.oda && state.oda.mod) || state.oyunModu ||
           (state.odaTakim && state.odaTakim.mod) || "birey";
  },
  _krkIzgaraHtml(){
    const mod = BIY._krkModu(), benim = BIY._krkBenim(), kapali = state.krkKapali || {};
    return '<div class="biy-krk-izgara">' + krkSeti(mod).map(k => {
      const sahip = kapali[k.i];
      const kilit = !!sahip && sahip !== benim;
      const secili = state.krkSecili === k.i;
      return '<button type="button" class="biy-krk-btn' + (kilit ? ' kapali' : '') +
        (secili ? ' secili' : '') + '"' + (kilit ? ' disabled aria-disabled="true"' : '') +
        ' title="' + k.a + '" onclick="BIY.krkSec(&quot;' + k.i + '&quot;)">' +
        '<span class="biy-krk-resim">' + k.s + '</span>' +
        '<span class="biy-krk-ad">' + k.a + '</span>' +
        (kilit ? '<span class="biy-krk-kilit" aria-hidden="true">✕</span>' : '') +
        (secili ? '<span class="biy-krk-tik" aria-hidden="true">✓</span>' : '') +
      '</button>';
    }).join("") + '</div>';
  },
  _krkTazele(){
    const a = $("katilKrkAlan"); if (a) a.innerHTML = BIY._krkIzgaraHtml();
    const b = $("takimKrkAlan");
    if (b){
      b.innerHTML = BIY._krkIzgaraHtml();
      const btn = $("takimKrkBtn"); if (btn) btn.disabled = !state.krkSecili;
    }
  },
  krkSec(id){
    const kapali = state.krkKapali || {};
    const sahip = kapali[id];
    if (sahip && sahip !== BIY._krkBenim()) return;   // baskasi kapmis
    state.krkSecili = (state.krkSecili === id) ? "" : id;
    BIY._krkTazele();
  },
  // avatari kilitle — baskasinin adina yazilmissa hata firlatir
  async _krkKap(oda, takimId, krk){
    const ref = db.collection(KOLEKSIYON).doc(oda).collection("karakterler").doc(krk);
    await db.runTransaction(async tx => {
      const d = await tx.get(ref);
      if (d.exists && (d.data() || {}).takim !== takimId) throw new Error("KAPILDI");
      tx.set(ref, { takim: takimId, zaman: firebase.firestore.FieldValue.serverTimestamp() });
    });
  },
  // takim/okul cihazi: lobide arma secme ekrani
  _krkSecEkrani(){
    if ($("takimKrkAlan")){ BIY._krkTazele(); return; }   // acik ekrani bozma
    const mod = BIY._krkModu();
    const baslik = mod === "okul" ? "اِخْتَرْ شِعار صَفِّك" : "اِخْتَرْ شِعار فَريقِك";
    $("takimIcerik").className = "biy-orta";
    $("takimIcerik").innerHTML =
      '<div class="biy-kart biy-krk-kart">' +
        '<h1>' + baslik + '</h1>' +
        '<p class="biy-alt">' + kacis(state.takimAd || "") + '</p>' +
        '<div id="takimKrkAlan"></div>' +
        '<p id="takimKrkNot" class="biy-not"></p>' +
        '<button id="takimKrkBtn" class="biy-btn biy-btn-yesil" disabled onclick="BIY.krkOnayla()">تَأْكيد</button>' +
      '</div>';
    BIY._krkTazele();
  },
  async krkOnayla(){
    const oda = state.odaTakim && state.odaTakim.oda;
    const takim = state.odaTakim && state.odaTakim.takim;
    if (!oda || !takim || !state.krkSecili) return;
    const btn = $("takimKrkBtn"); if (btn) btn.disabled = true;
    const not = $("takimKrkNot");
    if (not){ not.classList.remove("biy-not-hata"); not.textContent = "جار الحَجْز…"; }
    try {
      await BIY._krkKap(oda, takim, state.krkSecili);
      await db.collection(KOLEKSIYON).doc(oda).collection("takimlar").doc(takim)
              .update({ krk: state.krkSecili });
      state.takimKrk = state.krkSecili;
      BIY._renderTakim();
    } catch(e){
      state.krkSecili = ""; BIY._krkTazele();
      if (not){ not.classList.add("biy-not-hata"); not.textContent = "هَذا الشِّعار مَحْجوز. اِخْتَرْ غَيْرَه."; }
    }
  },
  _takimIcerik(emoji, baslik, metin, ekstra){
    $("takimIcerik").className = "biy-orta";
    $("takimIcerik").innerHTML =
      '<div class="biy-kart">' +
        '<div class="biy-logo">'+simge(emoji)+'</div>' +
        '<h1>'+kacis(baslik)+'</h1>' +
        '<p class="biy-alt">'+kacis(metin)+'</p>' + (ekstra || "") +
      '</div>';
  },
  _renderTakim(){
    /* Öğretmen bu cihazı çıkardıysa oda belgesinden gecikmeli gelen bir
       snapshot "Bağlandın!" ekranını geri getirmesin — bayrak kalıcıdır. */
    if (state.atildiMi) return;
    const o = state.oda; if (!o){ return; }
    if (o.durum === "lobi" || o.aktifIndex === -1){
      // yeni tura hazırlık: önceki turun cevap takibini sıfırla (oda yeniden kullanılıyor olabilir)
      state.sonCevapIndex = -1; try { localStorage.removeItem('biy_cevap'); } catch(e){}
      // avatar secilmediyse once o: herkes bir karakter alir, ikincisi alamaz
      if (!state.takimKrk){ BIY._krkSecEkrani(); sayacDurdur(); return; }
      BIY._takimIcerik('✅', state.takimAd, 'تَمّ الاتِّصال! في انْتِظار بَدْء المُعَلِّم.',
        '<div class="biy-krk-benim">'+krkSvg(state.takimKrk, "biy-krk-buyuk")+'<span>'+kacis(krkAd(state.takimKrk))+'</span></div>' +
        '<div class="biy-bekle-nokta"><span></span><span></span><span></span></div>');
      sayacDurdur(); return;
    }
    if (o.durum === "bitti"){
      // beraberlik sonrası kesin sıralama varsa kendi sıramı göster
      const ss = Array.isArray(o.sonSira) ? o.sonSira : null;
      if (ss){
        const r = ss.indexOf(state.odaTakim.takim) + 1;
        if (r === 1) BIY._takimIcerik('🎉','أَحْسَنْتَ!', 'المَرْكَز الأَوَّل! 🥇');
        else if (r > 0) BIY._takimIcerik('🏅', 'المَرْكَز ' + r, 'أَنْهَيْت المُسابَقَة في المَرْكَز ' + r + '.');
        else BIY._takimIcerik('🏁','اِنْتَهَت المُسابَقَة!', 'التَّرْتيب عَلى الشّاشَة.');
      } else {
        BIY._takimIcerik('🏁','اِنْتَهَت المُسابَقَة!', 'التَّرْتيب عَلى شاشَة المُعَلِّم.');
      }
      sayacDurdur(); return;
    }
    if (o.durum === "beraberlik"){
      const amTied = (o.berTakimlar||[]).indexOf(state.odaTakim.takim) >= 0;
      if (!amTied){
        const rank = (o.berSabit||{})[state.odaTakim.takim];
        if (rank === 1) BIY._takimIcerik('🎉','أَحْسَنْتَ!', 'المَرْكَز الأَوَّل! 🥇');
        else if (rank) BIY._takimIcerik('🏅', 'المَرْكَز ' + rank, 'أَنْهَيْت المُسابَقَة في المَرْكَز ' + rank + '.');
        else BIY._takimIcerik('⏳','تَعادُل!', 'الآخَرون في سُؤال التَّعادُل…');
        sayacDurdur(); return;
      }
      if (o.faz === "sonuc"){ BIY._takimIcerik('📺','الإِجابات عَلى الشّاشَة!', 'في انْتِظار سُؤال التَّعادُل التّالي…'); sayacDurdur(); return; }
      // beraberlikte olan takım → aşağıdaki cevap akışıyla yedek soruyu cevaplar
    }
    // oyun
    const idx = o.aktifIndex, s = o.aktifSoru;
    if (!s){ BIY._takimIcerik('⏳','جار التَّحْضير…',''); return; }
    if (o.faz === "sonuc"){
      BIY._takimIcerik('📺','الإِجابات عَلى الشّاشَة!', 'في انْتِظار السُّؤال التّالي…');
      sayacDurdur(); return;
    }
    // cevap fazı
    // ---- cevap fazı: biçime göre etkileşimli alan ----
    const cevapVerildi = (state.sonCevapIndex === idx);
    const t  = TIP_BILGI[s.tip] || { ad: s.tip, emoji: "❓" };
    const bb = BICIM_BILGI[bicimAl(s)] || { ad: "", emoji: "" };
    const kalan = kalanSaniye();
    const duruyor = duraklatiliyorMu();
    const kilit = cevapVerildi || kalan <= 0 || duruyor;
    BIY._calismaHazirla(idx, s);
    const alt = cevapVerildi
      ? '<div class="biy-t-alindi">✅ وَصَلَتْ إِجابَتُك</div>'
      : (kalan<=0 ? '<div class="biy-t-alindi biy-gec">⌛ اِنْتَهى الوَقْت</div>'
                  : '<div class="biy-t-ipucu">'+BIY._ipucuSimge(s)+BIY._ipucuMetni(s)+'</div>');
    const perde = (duruyor && !cevapVerildi)
      ? '<div class="biy-t-duraklat">'+_SVG_DURDUR+'<span>تَوَقُّف مُؤَقَّت — اِنْتَظِر المُعَلِّم</span></div>' : '';
    $("takimIcerik").className = "biy-oyun-orta";
    $("takimIcerik").innerHTML =
      /* v95: isim · rozetler · sayaç tek satırda (yapışkan şerit) */
      '<div class="biy-t-serit">' +
        '<span class="biy-t-kimlik">'+(state.takimKrk ? krkSvg(state.takimKrk, "biy-krk-mini") : '<span class="biy-t-kimlik-nokta"></span>')+'<span class="biy-t-kimlik-ad">'+kacis(state.takimAd)+'</span></span>' +
        etiketHtml(s) +
        '<span class="biy-t-sayac" id="sayacNum">'+kalan+'</span>' +
      '</div>' +
      '<div class="biy-oyun-soru">'+soruHtml(s)+'</div>' +
      (s.arapca ? '<div class="biy-oyun-arapca">'+kacis(s.arapca)+'</div>' : '') +
      BIY._takimAlanHtml(s, kilit) + perde + alt;
    if (duruyor){ const kap = $("biyCalisma"); if (kap) kap.classList.add("duraklatildi");
                  const oo = document.querySelector(".biy-t-optlar"); if (oo) oo.classList.add("duraklatildi"); }
    BIY._dragKur();
    sayacBaslat(() => {
      const k = kalanSaniye(); const el = $("sayacNum"); if (el) el.textContent = k;
      if (k <= 0 && !duraklatiliyorMu()){
        document.querySelectorAll(".biy-t-opt, .biy-t-parca, .biy-t-tus, .biy-t-gonder")
          .forEach(b => b.setAttribute("disabled",""));
        const kap = $("biyCalisma"); if (kap) kap.classList.add("kilitli");
        const ip = document.querySelector(".biy-t-ipucu");
        if (ip){ ip.className = "biy-t-alindi biy-gec"; ip.textContent = "⌛ Süre bitti"; }
      }
    });
  },

  /* ---------- takım tarafı: çalışma durumu ---------- */
  // Yarım kalan cevap (yerleştirilen parçalar / yazılan harfler) state içinde
  // tutulur ki her _renderTakim çağrısında aynen geri kurulabilsin.
  _calismaHazirla(idx, s){
    if (!state.calisma || state.calisma.index !== idx){
      const b = bicimAl(s);
      let n = 0;
      if (b === "surukle")       n = (s.karisik || []).length;
      else if (b === "eslestir") n = (s.sollar  || []).length;
      state.calisma = { index: idx, yerlesim: new Array(n).fill(null), secili: null, hedefSlot: null, yazi: "" };
    }
    return state.calisma;
  },
  _takimKilit(){
    const o = state.oda;
    if (!o || o.faz !== "cevap") return true;
    if (o.duraklatildi) return true;            // duraklatıldıysa cevap alınmaz
    if (state.sonCevapIndex === o.aktifIndex) return true;
    return kalanSaniye() <= 0;
  },
  /* "basılı tut ve sürükle" hareketini gösteren küçük animasyon */
  _ipucuSimge(s){
    const b = bicimAl(s);
    if (b !== "surukle" && b !== "eslestir") return "";
    return '<span class="biy-t-el" aria-hidden="true">'
      + '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.9"'
      + ' stroke-linecap="round" stroke-linejoin="round">'
      + '<rect class="biy-el-kart" x="2.5" y="9" width="12" height="9" rx="2.5"/>'
      + '<g class="biy-el-parmak">'
      + '<path d="M17 21.5v-8a1.9 1.9 0 0 1 3.8 0v4.2"/>'
      + '<path d="M20.8 15.4a1.7 1.7 0 0 1 3.4 0v2.3"/>'
      + '<path d="M24.2 16.4a1.7 1.7 0 0 1 3.4 0v5.4a6 6 0 0 1-6 6h-2.4a5 5 0 0 1-3.6-1.6l-2.9-3.4a1.8 1.8 0 0 1 2.6-2.4l1.7 1.6"/>'
      + '<circle class="biy-el-halka" cx="21.5" cy="12.5" r="4.2" stroke-dasharray="3 3"/>'
      + '</g></svg></span>';
  },
  _ipucuMetni(s){
    const b = bicimAl(s);
    if (b === "surukle")  return "اُنْقُرْ عَلى الكَلِمَة لِتَنْزِل · أَوْ اِضْغَطْ مَعَ الاِسْتِمْرار ثُمَّ اسْحَبْها";
    if (b === "eslestir") return "اُنْقُرْ عَلى البِطاقَة لِتَنْزِل · أَوْ اِضْغَطْ مَعَ الاِسْتِمْرار ثُمَّ اسْحَبْها";
    if (b === "yazma")    return "اُكْتُب الكَلِمَة بِالحُروف";
    return "اِخْتَرْ إِجابَةً";
  },
  _gonderHtml(kilit, tam){
    return '<div class="biy-t-gonder-sar"><button class="biy-t-gonder" ' +
           ((kilit || !tam) ? 'disabled' : '') +
           ' onclick="BIY.cevapGonder()">إِرْسال ✔</button></div>';
  },

  /* ---------- takım tarafı: biçime göre cevap alanı ---------- */
  _takimAlanHtml(s, kilit){
    const b = bicimAl(s);
    const c = state.calisma;

    if (b === "surukle"){
      const p = s.karisik || [];
      const son = p.length - 1;
      const slot = p.map((_, k) => {
        const v = c.yerlesim[k], dolu = (v != null);
        const hedefli = (!dolu && c.hedefSlot === k);
        return '<div class="biy-t-slot'+(dolu?' dolu':'')+(hedefli?' hedefli':'')+(dolu&&arMi(p[v])?' ar':'')+'" data-drop="slot:'+k+'"' +
               (dolu ? ' data-drag="slot:'+k+'"' : '') +
               ' onclick="BIY.slotTikla('+k+')">' +
               // Numara yuva dolunca da kalir: cumledeki sira bu rozetten okunur.
               '<span class="biy-t-slot-no'+(dolu?' dolu':'')+'">'+(k+1)+'</span>' +
               (dolu ? BIY._kaydirOkHtml(k, -1, k === 0) +
                       '<span class="biy-t-slot-metin">'+kacis(p[v])+'</span>' +
                       BIY._kaydirOkHtml(k, 1, k === son)
                     : '') + '</div>';
      }).join("");
      const havuz = p.map((x, i) => c.yerlesim.indexOf(i) >= 0 ? '' :
        '<div class="biy-t-parca'+(c.secili===i?' secili':'')+(arMi(x)?' ar':'')+'" data-drag="havuz:'+i+'" onclick="BIY.parcaTikla('+i+')">'+BIY._tutamakHtml()+'<span class="biy-t-parca-metin">'+kacis(x)+'</span></div>'
      ).join("");
      const tam = p.length > 0 && c.yerlesim.every(v => v != null);
      return '<div class="biy-t-calisma" id="biyCalisma">' +
               '<div class="biy-t-slotlar" dir="rtl">'+slot+'</div>' +
               '<div class="biy-t-havuz" data-drop="havuz" dir="rtl">' +
                 (havuz || '<span class="biy-t-bos">تَمَّ تَرْتيب الكُلّ ✔</span>') +
               '</div>' +
             '</div>' + BIY._gonderHtml(kilit, tam);
    }

    if (b === "eslestir"){
      const sol = s.sollar || [], sag = s.sagKarisik || [];
      const satir = sol.map((x, k) => {
        const v = c.yerlesim[k], dolu = (v != null);
        return '<div class="biy-t-cift-satir">' +
                 '<div class="biy-t-sol'+(arMi(x)?' ar':'')+'">'+kacis(x)+'</div>' +
                 '<div class="biy-t-ok">→</div>' +
                 '<div class="biy-t-slot'+(dolu?' dolu':'')+((!dolu && c.hedefSlot===k)?' hedefli':'')+(dolu&&arMi(sag[v])?' ar':'')+'" data-drop="slot:'+k+'"' +
                 (dolu ? ' data-drag="slot:'+k+'"' : '') +
                 ' onclick="BIY.slotTikla('+k+')">' +
                 (dolu ? kacis(sag[v]) : '<span class="biy-t-slot-no">?</span>') + '</div>' +
               '</div>';
      }).join("");
      const havuz = sag.map((x, i) => c.yerlesim.indexOf(i) >= 0 ? '' :
        '<div class="biy-t-parca'+(c.secili===i?' secili':'')+(arMi(x)?' ar':'')+'" data-drag="havuz:'+i+'" onclick="BIY.parcaTikla('+i+')">'+BIY._tutamakHtml()+'<span class="biy-t-parca-metin">'+kacis(x)+'</span></div>'
      ).join("");
      const tam = sol.length > 0 && c.yerlesim.every(v => v != null);
      return '<div class="biy-t-calisma" id="biyCalisma">' +
               '<div class="biy-t-ciftler">'+satir+'</div>' +
               '<div class="biy-t-havuz" data-drop="havuz">' +
                 (havuz || '<span class="biy-t-bos">تَمَّ وَضْع الكُلّ ✔</span>') +
               '</div>' +
             '</div>' + BIY._gonderHtml(kilit, tam);
    }

    if (b === "yazma"){
      const tus = (s.tusKarisik || []).map((h, i) =>
        '<button class="biy-t-tus" '+(kilit?'disabled':'')+' onclick="BIY.tusBas('+i+')">'+kacis(h)+'</button>'
      ).join("");
      const hedef = s.harfSayi || 0;
      return '<div class="biy-t-yazma" id="biyCalisma">' +
               '<div class="biy-t-yazekran" dir="rtl">' +
                 (c.yazi ? kacis(c.yazi) : '<span class="biy-t-bos">…</span>') + '</div>' +
               (hedef ? '<div class="biy-t-sayi">'+c.yazi.length+' / '+hedef+' harf</div>' : '') +
               '<div class="biy-t-klavye" dir="rtl">'+tus +
                 '<button class="biy-t-tus sil" '+(kilit?'disabled':'')+' onclick="BIY.tusSil()">⌫</button>' +
               '</div>' +
             '</div>' + BIY._gonderHtml(kilit, c.yazi.length > 0);
    }

    // varsayılan: klasik test
    const opt = (s.secenekler || []).map((sec, i) =>
      '<button class="biy-t-opt'+(arMi(sec)?' ar':' biy-ltr')+'" style="--c:'+SIK_RENK[i % SIK_RENK.length]+'" ' +
      (kilit?'disabled':'')+' onclick="BIY.cevapla('+i+')">' +
      '<span class="biy-a-harf">'+String.fromCharCode(65+i)+'</span><span>'+kacis(sec)+'</span></button>'
    ).join("");
    return '<div class="biy-t-optlar">'+opt+'</div>';
  },

  /* ---------- dokunarak yerleştirme ----------
     Mobilde sürükleme kapalı; her şey tek dokunuşla yapılır:
       · havuzdaki kelimeye dokun  → hedeflenen yuvaya, yoksa ilk boş yuvaya iner
       · dolu yuvaya dokun         → kelime havuza döner, o yuva hedef olur
       · boş yuvaya dokun          → o yuva hedeflenir (sıradaki kelime oraya iner)
       · yuvadaki oklar            → komşu yuvayla yer değiştirir                */
  /* dokunmatikte "buradan tutup sürükleyebilirsin" işareti */
  _tutamakHtml(){
    return '<span class="biy-t-tutamak" aria-hidden="true">'
      + '<svg viewBox="0 0 12 18" fill="currentColor">'
      + '<circle cx="3.4" cy="3.2" r="1.5"/><circle cx="8.6" cy="3.2" r="1.5"/>'
      + '<circle cx="3.4" cy="9"   r="1.5"/><circle cx="8.6" cy="9"   r="1.5"/>'
      + '<circle cx="3.4" cy="14.8" r="1.5"/><circle cx="8.6" cy="14.8" r="1.5"/>'
      + '</svg></span>';
  },
  _kaydirOkHtml(k, yon, kapali){
    // yon -1 = başa doğru (RTL'de sağa), +1 = sona doğru
    const d = (yon < 0) ? "M9 5l7 7-7 7" : "M15 5l-7 7 7 7";
    return '<button type="button" class="biy-t-kaydir-ok"' + (kapali ? ' disabled' : '') +
      ' aria-label="' + (yon < 0 ? 'إِلى الأَمام' : 'إِلى الخَلْف') + '"' +
      ' onclick="event.stopPropagation();BIY.slotKaydir(' + k + ',' + yon + ')">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"' +
      ' stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg></button>';
  },
  slotKaydir(k, yon){
    if (BIY._takimKilit()) return;
    const c = state.calisma; if (!c) return;
    const h = k + yon;
    if (h < 0 || h >= c.yerlesim.length) return;
    const g = c.yerlesim[h]; c.yerlesim[h] = c.yerlesim[k]; c.yerlesim[k] = g;
    c.secili = null; c.hedefSlot = null;
    try { SES.siraDegisti(); } catch(e){}
    BIY._renderTakim();
  },
  parcaTikla(i){
    if (BIY._takimKilit()) return;
    const c = state.calisma; if (!c) return;
    // hedeflenmiş boş yuva varsa oraya, yoksa ilk boş yuvaya
    let k = (c.hedefSlot != null && c.yerlesim[c.hedefSlot] == null) ? c.hedefSlot : c.yerlesim.indexOf(null);
    if (k < 0){
      // boş yuva kalmadı → parçayı seç, kullanıcı bir yuvaya dokunup değiştirsin
      c.secili = (c.secili === i) ? null : i;
    } else {
      const onceki = c.yerlesim.indexOf(i);
      if (onceki >= 0) c.yerlesim[onceki] = null;
      c.yerlesim[k] = i;
      c.secili = null; c.hedefSlot = null;
      try { SES.cevapGeldi(); } catch(e){}
    }
    BIY._renderTakim();
  },
  slotTikla(k){
    if (BIY._takimKilit()) return;
    const c = state.calisma; if (!c) return;
    if (c.secili != null){
      const onceki = c.yerlesim.indexOf(c.secili);
      if (onceki >= 0) c.yerlesim[onceki] = null;
      c.yerlesim[k] = c.secili;
      c.secili = null; c.hedefSlot = null;
    } else if (c.yerlesim[k] != null){
      c.yerlesim[k] = null;                    // havuza geri gönder
      c.hedefSlot = k;                         // aynı yuva hedefte kalsın
    } else {
      c.hedefSlot = (c.hedefSlot === k) ? null : k;
    }
    BIY._renderTakim();
  },
  tusBas(i){
    if (BIY._takimKilit()) return;
    const s = state.oda && state.oda.aktifSoru; if (!s) return;
    const c = state.calisma; if (!c) return;
    const h = (s.tusKarisik || [])[i];
    if (h == null || c.yazi.length >= 24) return;
    c.yazi += h;
    BIY._renderTakim();
  },
  tusSil(){
    if (BIY._takimKilit()) return;
    const c = state.calisma; if (!c || !c.yazi) return;
    c.yazi = c.yazi.slice(0, -1);
    BIY._renderTakim();
  },
  _tasi(kaynak, hedef){
    const c = state.calisma; if (!c || !kaynak || !hedef) return;
    const kp = kaynak.split(":"), hp = hedef.split(":");
    if (kp[0] === "havuz"){
      const i = +kp[1];
      if (hp[0] !== "slot") return;
      const k = +hp[1];
      const onceki = c.yerlesim.indexOf(i);
      if (onceki >= 0) c.yerlesim[onceki] = null;
      c.yerlesim[k] = i;
    } else if (kp[0] === "slot"){
      const k1 = +kp[1];
      if (hp[0] === "havuz"){ c.yerlesim[k1] = null; }
      else if (hp[0] === "slot"){
        const k2 = +hp[1];
        const g = c.yerlesim[k2]; c.yerlesim[k2] = c.yerlesim[k1]; c.yerlesim[k1] = g;
      }
    }
    c.secili = null; c.hedefSlot = null;
  },

  /* ---------- sürükleme: fare/kalem hemen, parmak "basılı tut" ile ----------
     Telefonda parmağın kutuya değer değmez sürükleme başlarsa sayfa hiç
     kaydırılamıyordu. Artık: parmağı 180 ms sabit tutarsan parça "kalkar"
     (görsel işaret) ve sürüklenir; hemen kaydırırsan sayfa normal kayar.
     Tek dokunuşla yerleştirme de aynen çalışmaya devam eder.            */
  _dragKur(){
    const kap = $("biyCalisma");
    if (!kap || kap._dragli) return;
    kap._dragli = true;
    const BEKLE = 180;                 // basılı tutma süresi (ms)
    const KAYMA = 12;                  // bu kadar kayarsa "sayfayı kaydırıyor" sayılır
    let bas = null, hayalet = null, tasindi = false, hazir = false, sayac = null;

    const sayacDur = () => { if (sayac){ clearTimeout(sayac); sayac = null; } };
    const temizle = () => {
      sayacDur();
      if (hayalet && hayalet.parentNode) hayalet.parentNode.removeChild(hayalet);
      hayalet = null; hazir = false;
      kap.querySelectorAll(".hedef").forEach(e => e.classList.remove("hedef"));
      kap.querySelectorAll(".suruk").forEach(e => e.classList.remove("suruk"));
      kap.querySelectorAll(".biy-t-hazir").forEach(e => e.classList.remove("biy-t-hazir"));
      document.body.classList.remove("biy-suruklerken");
    };
    const dropBul = (x, y) => {
      const el = document.elementFromPoint(x, y);
      return (el && el.closest) ? el.closest("[data-drop]") : null;
    };
    // parmak ekranın altına/üstüne yaklaşınca sayfayı kendimiz kaydırırız
    const kenarKaydir = (y) => {
      const h = window.innerHeight, pay = 90;
      if (y < pay) window.scrollBy(0, -Math.ceil((pay - y) / 6));
      else if (y > h - pay) window.scrollBy(0, Math.ceil((y - (h - pay)) / 6));
    };

    // Sürükleme bittiğinde tarayıcının ürettiği "click" olayını yut ki
    // parça hem taşınıp hem de tıklanmış sayılmasın.
    kap.addEventListener("click", function(e){
      if (kap._yut){ e.stopPropagation(); e.preventDefault(); kap._yut = false; }
    }, true);

    // Sürükleme hazırsa sayfanın kaymasını engelle (passive OLMAYAN dinleyici).
    kap.addEventListener("touchmove", function(e){
      if (bas && hazir) e.preventDefault();
    }, { passive: false });

    kap.addEventListener("pointerdown", function(e){
      kap._yut = false;
      if (BIY._takimKilit()) return;
      const el = (e.target && e.target.closest) ? e.target.closest("[data-drag]") : null;
      if (!el) return;
      bas = { el: el, x: e.clientX, y: e.clientY, id: el.getAttribute("data-drag"), pid: e.pointerId };
      tasindi = false;
      if (e.pointerType === "touch"){
        hazir = false;
        sayac = setTimeout(function(){
          if (!bas) return;
          hazir = true;
          bas.el.classList.add("biy-t-hazir");
          try { bas.el.setPointerCapture(bas.pid); } catch(err){}
          try { if (navigator.vibrate) navigator.vibrate(12); } catch(err){}
          try { SES.cevapGeldi(); } catch(err){}
          document.body.classList.add("biy-suruklerken");
        }, BEKLE);
      } else {
        hazir = true;
        try { el.setPointerCapture(e.pointerId); } catch(err){}
      }
    });

    kap.addEventListener("pointermove", function(e){
      if (!bas) return;
      const dx = e.clientX - bas.x, dy = e.clientY - bas.y;
      if (!hazir){
        // basılı tutma tamamlanmadan parmak kaydıysa → sayfa kaysın
        if (Math.abs(dx) + Math.abs(dy) > KAYMA){ sayacDur(); bas = null; temizle(); }
        return;
      }
      if (!tasindi && (Math.abs(dx) + Math.abs(dy)) < 6) return;
      if (!tasindi){
        tasindi = true;
        hayalet = bas.el.cloneNode(true);
        hayalet.removeAttribute("data-drag");
        hayalet.removeAttribute("data-drop");
        hayalet.className = bas.el.className.replace("secili", "").replace("biy-t-hazir", "") + " biy-t-hayalet";
        hayalet.style.width = bas.el.offsetWidth + "px";
        document.body.appendChild(hayalet);
        bas.el.classList.add("suruk");
      }
      e.preventDefault();
      hayalet.style.left = e.clientX + "px";
      hayalet.style.top  = e.clientY + "px";
      kap.querySelectorAll(".hedef").forEach(x => x.classList.remove("hedef"));
      const hd = dropBul(e.clientX, e.clientY);
      if (hd) hd.classList.add("hedef");
      kenarKaydir(e.clientY);
    });

    kap.addEventListener("pointerup", function(e){
      if (!bas) return;
      const b = bas; bas = null;
      if (!tasindi){ temizle(); return; }     // taşınmadıysa normal tıklama olsun
      const hd = dropBul(e.clientX, e.clientY);
      temizle();
      kap._yut = true;
      if (hd){ BIY._tasi(b.id, hd.getAttribute("data-drop")); try { SES.siraDegisti(); } catch(err){} }
      BIY._renderTakim();
    });

    kap.addEventListener("pointercancel", function(){ bas = null; temizle(); });
  },

  /* ---------- cevabı gönder ---------- */
  cevapGonder(){
    if (BIY._takimKilit()) return;
    const o = state.oda; if (!o) return;
    const s = o.aktifSoru; if (!s) return;
    const c = state.calisma; if (!c) return;
    const b = bicimAl(s);
    let secilen = null;
    if (b === "surukle"){
      if (!c.yerlesim.length || c.yerlesim.some(v => v == null)) return;
      secilen = c.yerlesim.map(v => (s.karisik || [])[v]);
    } else if (b === "eslestir"){
      if (!c.yerlesim.length || c.yerlesim.some(v => v == null)) return;
      secilen = c.yerlesim.map(v => (s.sagKarisik || [])[v]);
    } else if (b === "yazma"){
      if (!c.yazi) return;
      secilen = c.yazi;
    } else {
      return;
    }
    BIY._cevapYolla(secilen);
  },
  cevapla(optIdx){ BIY._cevapYolla(optIdx); },
  async _cevapYolla(secilen){
    const o = state.oda; if (!o || o.faz !== "cevap") return;
    if (kalanSaniye() <= 0) return;
    const idx = o.aktifIndex;
    if (state.sonCevapIndex === idx) return;
    state.sonCevapIndex = idx;
    try {
      await db.collection(KOLEKSIYON).doc(state.odaTakim.oda).collection("cevaplar").doc(state.odaTakim.takim + "_" + idx).set({
        takimId: state.odaTakim.takim, ad: state.takimAd, index: idx, secilen: secilen,
        kalan: kalanSaniye(),   // hız bonusu için kalan saniye
        zaman: firebase.firestore.FieldValue.serverTimestamp()
      });
      try { localStorage.setItem('biy_cevap', JSON.stringify({ oda: state.odaTakim.oda, takim: state.odaTakim.takim, index: idx })); } catch(e){}
    } catch(e){ console.error(e); state.sonCevapIndex = -1; }
    BIY._renderTakim();
  },

  /* ===================================================================
     MOD ALTYAPISI — Takım / Birey / Okul
     Üç mod da aynı Firestore yapısını kullanır: her katılımcı (ister takım,
     ister tek öğrenci) "takimlar" alt koleksiyonunda bir belgedir. Böylece
     puanlama, sonuç ekranı ve sıralama kodu üç modda da aynı çalışır.
     Birey modunda belgeye ek olarak  onay(bool) · red · atildi  alanları
     yazılır; takım/okul modunda öğretmen adları kendi yazdığı için onay yok.
     =================================================================== */

  // Başlat düğmesi görünsün mü, altındaki not ne yazsın (moda göre)
  _baslatDurumu(){
    const m = modAl();
    const sayi  = state.takimListe.length;
    const bagli = state.takimListe.filter(t => t.bagli).length;
    const bek   = state.bekleyenListe.length;
    const bekNot = bek ? " · " + bek + " onay bekliyor" : "";
    // Takım ve Okul: her ada bir karekod → hepsi bağlanınca başlar (aynı mantık)
    if (m !== "birey"){
      const c = cogSozu();                        // "Takımlar" | "Sınıflar"
      if (sayi === 0) return { olur:false, not:"" };
      if (sayi < 2)   return { olur:false, not: c + ": " + sayi + " · en az iki tane gerekir" };
      if (bagli < sayi) return { olur:false, not: c + ": " + sayi + " · bağlanan " + bagli + " · beklenen " + (sayi-bagli) };
      return { olur:true, not: "✓ " + c + ": " + sayi + " · başlayabilirsin" };
    }
    if (sayi < 2) return { olur:false, not: "Katılımcı: " + sayi + " · en az iki tane gerekir" + bekNot };
    return { olur:true, not: "✓ Katılımcı: " + sayi + " · başlayabilirsin" + bekNot };
  },

  /* ---------- TAKIM & OKUL lobisi: her takıma/sınıfa ayrı karekod ---------- */
  /* Karekod ekranındaki EBA uyarısı: karekodu okutan ilk kişi/takım
     göründüğü anda kaybolur, kimse yokken yeniden görünür. */
  _ebaNotGuncelle(){
    const el = $("ebaNot"); if (!el) return;
    const giren = (state.bekleyenListe || []).length > 0
               || (state.takimListe || []).some(t => t.bagli);
    el.classList.toggle("gizli", !!giren);
  },
  _takimKartlariCiz(){
    const grid = $("takimlarGrid"); if (!grid) return;
    grid.innerHTML = "";
    state.takimListe.forEach(t => {
      const link = takimLinki(state.odaId, t.id); const qrId = "qr_" + t.id;
      const kart = document.createElement("div");
      kart.className = "biy-takim-kart " + (t.bagli ? "biy-kart-bagli" : "biy-kart-bekliyor");
      kart.innerHTML =
        '<button class="biy-sil" title="Sil" onclick="BIY.takimSil(&quot;'+t.id+'&quot;)">✕</button>' +
        '<h3>'+ krkSvg(t.krk, "biy-krk-kart-ikon") + kacis(t.ad) +'</h3>' +
        '<div class="biy-takim-durum '+(t.bagli?"biy-bagli":"biy-bekliyor")+'">'+(t.bagli?"● Bağlı":"○ Bekliyor")+'</div>' +
        '<div class="biy-qr" id="'+qrId+'"></div>' +
        '<div class="biy-takim-link"><input readonly value="'+ kacis(link) +'"><button class="biy-kopya" onclick="BIY.kopyala(this)">Kopyala</button></div>';
      grid.appendChild(kart);
      try { const box = $(qrId); if (box && window.QRCode){ box.innerHTML=""; new QRCode(box, { text: link, width: 170, height: 170, correctLevel: QRCode.CorrectLevel.M }); } }
      catch(err){ console.warn("QR:", err); }
    });
  },

  /* ---------- BİREY lobisi: tek ortak karekod ---------- */
  _odaKarekodCiz(){
    const kap = $("lobiOdaAlan"); if (!kap || !state.odaId) return;
    const link = odaLinki(state.odaId);
    const ipucu = "Herkes bu karekodu okutup adını yazar; sen onayladıktan sonra listeye girerler.";
    kap.innerHTML =
      '<div class="biy-oda-kart">' +
        '<div class="biy-oda-sol">' +
          '<span class="biy-oda-etiket">Oda kodu</span>' +
          '<span class="biy-oda-kod">'+ kacis(state.odaId) +'</span>' +
          '<div class="biy-takim-link"><input readonly value="'+ kacis(link) +'"><button class="biy-kopya" onclick="BIY.kopyala(this)">Kopyala</button></div>' +
          '<p class="biy-oda-ipucu">'+ ipucu +'</p>' +
        '</div>' +
        '<div class="biy-qr biy-oda-qr" id="odaQrKutu"></div>' +
      '</div>';
    try {
      const box = $("odaQrKutu");
      if (box && window.QRCode){ box.innerHTML = ""; new QRCode(box, { text: link, width: 230, height: 230, correctLevel: QRCode.CorrectLevel.M }); }
    } catch(err){ console.warn("QR:", err); }
  },

  _katilimcilariCiz(){
    // --- onay bekleyenler kuyruğu ---
    const bek = $("lobiBekleyen");
    if (bek){
      const b = state.bekleyenListe;
      bek.innerHTML = !b.length
        ? '<div class="biy-bek-bos">⏳ Bekleyen yok — karekodu okutan burada görünür.</div>'
        : '<div class="biy-bek-ust"><h3>⏳ Onay bekleyenler ('+b.length+')</h3>' +
            (b.length > 1 ? '<button class="biy-btn biy-btn-yesil biy-btn-mini" onclick="BIY.hepsiniOnayla()">Tümünü onayla</button>' : '') +
          '</div>' +
          '<div class="biy-bek-liste">' + b.map(k =>
            '<div class="biy-bek-kart">' +
              '<button class="biy-bek-ad" title="Adı düzelt" onclick="BIY.katilimciAdDegistir(&quot;'+k.id+'&quot;)">'+krkSvg(k.krk, "biy-krk-mini")+kacis(k.ad)+'</button>' +
              '<span class="biy-bek-btnlar">' +
                '<button class="biy-onay-ok" title="Onayla" onclick="BIY.katilimciOnayla(&quot;'+k.id+'&quot;)">✓</button>' +
                '<button class="biy-onay-red" title="Reddet" onclick="BIY.katilimciReddet(&quot;'+k.id+'&quot;)">✕</button>' +
              '</span>' +
            '</div>').join("") +
          '</div>';
    }
    // --- onaylanan katılımcılar ---
    const grid = $("takimlarGrid"); if (!grid) return;
    const L = state.takimListe;
    if (!L.length){
      grid.innerHTML = '<div class="biy-kat-bos">Henüz katılımcı yok.</div>';
      return;
    }
    grid.innerHTML =
      '<div class="biy-kat-ust"><span>👥 Katılımcılar ('+L.length+')</span>' +
        '<span class="biy-kat-ipucu">Adı düzeltmek için dokun · ✕ çıkarmak için</span></div>' +
      '<div class="biy-kat-satirlar'+(L.length > 12 ? ' biy-kaydir' : '')+'">' +
        L.map(k =>
          '<div class="biy-kat-satir '+(k.bagli ? 'bagli' : 'kopuk')+'">' +
            '<span class="biy-kat-nokta" title="'+(k.bagli?'Bağlı':'Bağlı değil')+'"></span>' +
            '<button class="biy-kat-ad" title="Adı düzelt" onclick="BIY.katilimciAdDegistir(&quot;'+k.id+'&quot;)">'+krkSvg(k.krk, "biy-krk-mini")+kacis(k.ad)+'</button>' +
            '<button class="biy-kat-at" title="Yarışmadan çıkar" onclick="BIY.katilimciAt(&quot;'+k.id+'&quot;)">✕</button>' +
          '</div>').join("") +
      '</div>';
  },

  /* ---------- öğretmen müdahalesi: onay / ret / düzelt / çıkar ---------- */
  _katilimciRef(id){ return db.collection(KOLEKSIYON).doc(state.odaId).collection("takimlar").doc(id); },
  async katilimciOnayla(id){
    try { await BIY._katilimciRef(id).update({ onay: true }); SES.baglandi(); }
    catch(e){ console.error(e); }
  },
  async hepsiniOnayla(){
    const b = state.bekleyenListe.slice(); if (!b.length) return;
    try {
      const batch = db.batch();
      b.forEach(k => batch.update(BIY._katilimciRef(k.id), { onay: true }));
      await batch.commit(); SES.baglandi();
    } catch(e){ console.error(e); }
  },
  katilimciReddet(id){
    const k = state.bekleyenListe.find(x => x.id === id) || {};
    BIY._onay("Katılımı reddedelim mi?", "«" + (k.ad||"") + "» listeye giremeyecek. Yeni bir adla tekrar deneyebilir.",
      "Reddet", async () => { try { await BIY._katilimciRef(id).update({ red: true }); } catch(e){ console.error(e); } });
  },
  katilimciAt(id){
    const k = state.takimListe.find(x => x.id === id) || {};
    BIY._onay("Yarışmadan çıkaralım mı?", "«" + (k.ad||"") + "» listeden çıkacak ve cihazında bir bildirim görünecek.",
      "Çıkar", async () => { try { await BIY._katilimciRef(id).update({ atildi: true, bagli: false }); } catch(e){ console.error(e); } });
  },
  katilimciAdDegistir(id){
    const k = state.takimListe.find(x => x.id === id) || state.bekleyenListe.find(x => x.id === id);
    if (!k) return;
    BIY._metinSor("Adı düzelt", k.ad, "Kaydet", async (yeni) => {
      const ad = isimTemizle(yeni);
      if (ad.length < 2) return;
      try { await BIY._katilimciRef(id).update({ ad: ad }); } catch(e){ console.error(e); }
    });
  },
  // küçük metin sorma penceresi (_onay kardeşi)
  _metinSor(baslik, mevcut, evetMetin, onEvet){
    const eski = $("biyOnay"); if (eski) eski.remove();
    const ov = document.createElement("div"); ov.id = "biyOnay"; ov.className = "biy-onay-ov";
    ov.innerHTML = '<div class="biy-onay-kutu"><h3>'+kacis(baslik)+'</h3>' +
      '<input id="biyMetinInput" class="biy-onay-input" type="text" maxlength="18" value="'+kacis(mevcut||"")+'">' +
      '<div class="biy-onay-btnlar"><button class="biy-onay-hayir">Vazgeç</button><button class="biy-onay-evet">'+kacis(evetMetin)+'</button></div></div>';
    document.body.appendChild(ov);
    const kapat = () => { if (ov.parentNode) ov.remove(); };
    const inp = ov.querySelector("#biyMetinInput");
    const tamam = () => { const v = inp.value; kapat(); if (onEvet) onEvet(v); };
    ov.querySelector(".biy-onay-hayir").onclick = kapat;
    ov.querySelector(".biy-onay-evet").onclick = tamam;
    inp.addEventListener("keydown", e => { if (e.key === "Enter") tamam(); if (e.key === "Escape") kapat(); });
    ov.addEventListener("click", e => { if (e.target === ov) kapat(); });
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  },

  // tahtadaki "kim cevapladı" şeridi
  _ciplerHtml(katilan, buCevaplar){
    return katilan.map(tk => {
      const ok = !!buCevaplar[tk.id];
      // avatar isimden once: soru gizliyken uzaktan bakan bunu tanir
      return '<span class="biy-cip '+(ok?'ok':'')+'">' + krkSvg(tk.krk, "biy-krk-cip") +
        (ok ? '<span class="biy-cip-tik">✓</span> ' : '') + kacis(tk.ad) + '</span>';
    }).join("");
  },

  /* ===================================================================
     ÖĞRENCİ TARAFI — tek karekodla katılım (yalnız birey modu)
     =================================================================== */
  async katilimAkisi(oda){
    state.odaTakim = { oda: oda, takim: null };
    ekranGoster("ekranKatil");
    try {
      const snap = await db.collection(KOLEKSIYON).doc(oda).get();
      if (!snap.exists){ BIY._katilNot("لَمْ توجَد الغُرْفَة. اِمْسَح الرَّمْز مِنْ جَديد أَو اسْأَلْ مُعَلِّمَك.", true); return; }
      const o = snap.data() || {};
      state.oyunModu = "birey";   // ortak karekod bağlantısı yalnız birey odalarında üretilir
      BIY._krkIzle(oda);          // hangi karakterler kapılmış, canlı izlenir
      // daha önce katıldıysa aynı kayda dön
      let kayit = null; try { kayit = JSON.parse(localStorage.getItem("biy_katilim") || "null"); } catch(e){}
      if (kayit && kayit.oda === oda && kayit.takim){
        const kd = await db.collection(KOLEKSIYON).doc(oda).collection("takimlar").doc(kayit.takim).get();
        if (kd.exists){ BIY._katilimIzle(oda, kayit.takim); return; }
        try { localStorage.removeItem("biy_katilim"); } catch(e){}
      }
      BIY._katilFormu();
    } catch(e){
      console.error(e);
      BIY._katilNot("تَعَذَّر الاتِّصال. تَحَقَّقْ مِن الإِنْتَرْنِت.", true);
    }
  },
  _katilFormu(){
    ekranGoster("ekranKatil");
    const kart = $("katilKart"); if (kart) kart.classList.remove("gizli");
    const bekle = $("katilBekle"); if (bekle) bekle.classList.add("gizli");
    const not = $("katilNot"); if (not) not.textContent = "";
    const inp = $("katilAdInput"); if (inp){ inp.value = ""; setTimeout(() => inp.focus(), 60); }
    state.krkSecili = "";
    BIY._krkTazele();
  },
  _katilNot(metin, hata){
    const not = $("katilNot");
    if (not){ not.textContent = metin || ""; not.classList.toggle("biy-not-hata", !!hata); }
  },
  async katilGonder(){
    const oda = state.odaTakim && state.odaTakim.oda; if (!oda) return;
    const inp = $("katilAdInput"); const ham = inp ? inp.value : "";
    const sorun = isimSorunu(ham);
    if (sorun){ BIY._katilNot(sorun, true); if (inp) inp.focus(); return; }
    if (!state.krkSecili){ BIY._katilNot("اِخْتَرْ شَخْصِيَّتَك أَوَّلًا.", true); return; }
    let ad = isimTemizle(ham);
    BIY._katilNot("جار الإِرْسال…", false);
    try {
      // aynı isim varsa numaralandır
      const hepsi = await db.collection(KOLEKSIYON).doc(oda).collection("takimlar").get();
      const adlar = []; hepsi.forEach(d => { const t = d.data(); if (!t.atildi && !t.red) adlar.push(t.ad); });
      ad = isimBenzersiz(ad, adlar);
      const id = rastgeleKod(5);
      // once avatari kilitle: kaybedersek kayit hic olusmasin
      try { await BIY._krkKap(oda, id, state.krkSecili); }
      catch(err){
        state.krkSecili = ""; BIY._krkTazele();
        BIY._katilNot("هَذِه الشَّخْصِيَّة مَحْجوزَة. اِخْتَرْ غَيْرَها.", true); return;
      }
      await db.collection(KOLEKSIYON).doc(oda).collection("takimlar").doc(id).set({
        ad: ad, onay: false, bagli: true, puan: 0, krk: state.krkSecili,
        olusturmaZamani: firebase.firestore.FieldValue.serverTimestamp()
      });
      try { localStorage.setItem("biy_katilim", JSON.stringify({ oda: oda, takim: id })); } catch(e){}
      BIY._katilimIzle(oda, id);
    } catch(e){
      console.error(e);
      BIY._katilNot("تَعَذَّرَت المُشارَكَة: " + (e.code || e.message), true);
    }
  },
  // kendi kaydını dinle: onay / ret / çıkarılma
  _katilimIzle(oda, id){
    state.katilimId = id; state.odaTakim = { oda: oda, takim: id }; state.katilBagli = false;
    if (state.katilimAbone) state.katilimAbone();
    const ref = db.collection(KOLEKSIYON).doc(oda).collection("takimlar").doc(id);
    state.katilimAbone = ref.onSnapshot(d => {
      if (!d.exists){ try { localStorage.removeItem("biy_katilim"); } catch(e){} BIY._katilFormu(); return; }
      const t = d.data() || {};
      state.takimAd = t.ad || "Katılımcı";
      state.takimKrk = t.krk || "";
      if (t.atildi){
        state.atildiMi = true;
        if (state.takimNabiz){ clearInterval(state.takimNabiz); state.takimNabiz = null; }
        if (state.katilimAbone){ state.katilimAbone(); state.katilimAbone = null; }
        if (state.odaAbone){ state.odaAbone(); state.odaAbone = null; }
        try { localStorage.removeItem("biy_katilim"); } catch(e){}
        sayacDurdur(); ekranGoster("ekranTakim");
        BIY._takimIcerik("🚪", "تَمَّ إِخْراجُك مِن المُسابَقَة", "أَخْرَجَك المُعَلِّم مِن القائِمَة.");
        return;
      }
      if (t.red){
        try { localStorage.removeItem("biy_katilim"); } catch(e){}
        BIY._katilBeklemeEkrani("✋", "لَمْ يُقْبَل الاسْم", "حاوِلْ مَرَّةً أُخْرى بِاسْمِك الحَقيقِيّ.",
          '<button class="biy-btn biy-btn-yesil" onclick="BIY.katilYeniden()">شارِكْ بِاسْم جَديد</button>');
        return;
      }
      if (t.onay !== true){
        BIY._katilBeklemeEkrani("⏳", kacis(t.ad || ""), "في انْتِظار مُوافَقَة المُعَلِّم…",
          '<div class="biy-bekle-nokta"><span></span><span></span><span></span></div>');
        return;
      }
      // onaylandı → normal takım akışına geç (bir kez)
      if (!state.katilBagli){
        state.katilBagli = true;
        BIY.takimBagla(oda, id);
      }
    }, err => { console.error(err); BIY._katilNot("اِنْقَطَع الاتِّصال: " + (err.code || err.message), true); });
  },
  _katilBeklemeEkrani(emoji, baslik, metin, ekstra){
    ekranGoster("ekranKatil");
    const kart = $("katilKart"); if (kart) kart.classList.add("gizli");
    const bekle = $("katilBekle");
    if (bekle){
      bekle.classList.remove("gizli");
      bekle.innerHTML = '<div class="biy-kart biy-orta"><div class="biy-logo">'+simge(emoji)+'</div>' +
        '<h1>'+baslik+'</h1><p class="biy-alt">'+kacis(metin)+'</p>' + (ekstra || "") + '</div>';
    }
  },
  katilYeniden(){
    if (state.katilimAbone){ state.katilimAbone(); state.katilimAbone = null; }
    state.katilimId = null; state.katilBagli = false; state.atildiMi = false;
    BIY._katilFormu();
  }
};
/* Kayan listelerin alt kenarina yumusak solma: icerik tasiyorsa isaretle. */
function kayarIsaretle(){
  document.querySelectorAll(".biy-bek-liste, .biy-kat-satirlar, .biy-takimlar-grid").forEach(e => {
    e.classList.toggle("biy-kayar", e.scrollHeight - e.clientHeight > 6);
  });
}
window.addEventListener("resize", kayarIsaretle);
setInterval(kayarIsaretle, 900);

window.BIY = BIY;
// canlı yarışmada sekme kapatma/yenileme kazasına karşı uyarı
window.addEventListener("beforeunload", function(e){
  if (state.mod === "admin" && state.oda && (state.oda.durum === "oyun" || state.oda.durum === "beraberlik")){
    e.preventDefault(); e.returnValue = "";
  }
});

/* ===========================================================
   Başlangıç / mod yönlendirme
   =========================================================== */
(function baslat(){
  const p = new URLSearchParams(location.search);
  const oda = p.get("oda"), takim = p.get("takim");

  /* Tek karekodlu modlarda (birey/okul) baglanti yalnizca ?oda= tasir; ogrenci
     kendi adini yazar ve ogretmen onayini bekler. Takim modunda ise her takimin
     kendi karekodu vardir, bu yuzden ?takim= de bulunur.                     */
  if (oda && !takim){
    state.mod = "takim";
    BIY.katilimAkisi(oda);
    return;
  }

  if (oda && takim){
    state.mod = "takim"; state.odaTakim = { oda, takim };
    ekranGoster("ekranTakim");
    // takım listesi (final için) hafif dinleme
    db.collection(KOLEKSIYON).doc(oda).collection("takimlar").onSnapshot(snap => {
      state.takimListe = []; snap.forEach(d => { const t = d.data(); state.takimListe.push({ id: d.id, ad: t.ad, puan: t.puan||0, bagli: !!t.bagli }); });
    }, () => {});
    // Öğrenci tarafında hesap/giriş yok: karekoddaki oda+takım bilgisi yeterli.
    BIY.takimBagla(oda, takim);
    return;
  }

  /* Sade adres (?oda= yok) ile açan kişi öğretmendir: giriş kapısı, hesap ve
     rol denetimi kaldırıldı. Bu dosya bir okul sitesinin parçası değil; tek
     başına çalışan bir sınıf aracı. Öğrenciler zaten karekod/bağlantıyla
     doğrudan takım ekranına düştüğü için bu panele hiç uğramazlar.        */
  state.mod = "admin";
  ekranGoster("ekranYukleniyor");
  try {
    /* ---- ÜNİTE: bu dosya dört ünite klasöründe ortak kullanılabilir ----
       Önce adres/klasör/bağlantı işaretlerine bakılır; hiçbiri yoksa daha
       önce seçilen ünite hatırlanır. Sonra (varsa) index'in başlığı okunur. */
    const otoU = uniteAlgila();
    if (otoU){ state.uniteNo = otoU.no; state.uniteAcik = otoU.no; state.uniteKilit = otoU.no; state.otoUnite = otoU; }
    else { try { const u = +localStorage.getItem("biy_unite"); if (u >= 1 && u <= 4) state.uniteNo = u; } catch(e){} }
    BIY._sureleriYukle(); BIY._sureRozet();
    BIY._konulariHazirla();
    if (otoU){
      BIY.konuSec("unite" + otoU.no);
      setTimeout(() => BIY._otoUniteNot(), 60);
    }
    /* index sayfasının BAŞLIĞI en güvenilir kaynak: adres parametresi yoksa
       klasörden gelen tahmini de düzeltebilir. Öğretmen bir şey seçtiyse
       (havuz ya da başka ders) hiç karışmaz.                              */
    if (!otoU || otoU.kaynak !== "adres"){
      uniteBasliktanAlgila().then(no => {
        if (!no) return;
        if (BIY._secSet().size) return;                       // havuzdan seçim yapılmış
        if (state.konuId && state.konuId !== ("unite" + state.uniteNo)) return;  // ders seçilmiş
        if (state.uniteNo === no && state.otoUnite) return;   // zaten doğru
        BIY._otoUniteUygula(no, "başlık");
      }).catch(() => {});
    }
    BIY._soruSayiSinir();
    BIY._menuDurum();
    // sayfa yenilenmişse aktif odaya/oyuna dön
    let kayit = null; try { kayit = JSON.parse(localStorage.getItem('biy_aktif') || 'null'); } catch(e){}
    if (kayit && kayit.oda){ BIY._devamEt(kayit); }
    else BIY._modKapisi();
  } catch(err){
    console.error("[BIY] Açılış hatası:", err);
    const not = $("girisRolNot");
    if (not) not.textContent = String(err && err.message ? err.message : err);
    ekranGoster("ekranGirisKapisi");
  }
})();
