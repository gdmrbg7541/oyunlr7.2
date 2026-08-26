/* ==========================================================================
   ÇEVRİMDIŞI MOD — sınıfta internetsiz yarışma
   --------------------------------------------------------------------------
   Üç iş yapar:
     1) Tur planı: yarışma biçimi (kişi · takım · sınıf), katılımcı listesi,
        ünite/ders seçimi, soru biçimi süzgeci ve soru sayısı.
     2) Yürütme: tam ekran soru sunumu, geri sayan sayaç, cevabı göster,
        yanında elle işlenen puan tablosu.
     3) Kâğıt: soru kitapçığı ve takım yarışma kartı doğrudan .pdf olarak iner.

   Veri katmanı bilgiyarismasi.js'ten aynen kullanılır (KONULAR, soruHazirla,
   BIY._konuSorulari …). Firebase'e hiç dokunulmaz.
   ========================================================================== */
(function(){
"use strict";

const TAKIM_RENK = [
  { ad:"الفَريقُ الأَخْضَر",  tr:"Yeşil",   renk:"#16A085" },
  { ad:"الفَريقُ الأَزْرَق",  tr:"Mavi",    renk:"#42A5F5" },
  { ad:"الفَريقُ الأَحْمَر",  tr:"Kırmızı", renk:"#EF5350" },
  { ad:"الفَريقُ الأَصْفَر",  tr:"Sarı",    renk:"#F39C12" },
  { ad:"الفَريقُ البَنَفْسَجِيّ", tr:"Mor", renk:"#7E57C2" },
  { ad:"الفَريقُ الرَّمادِيّ", tr:"Gri",    renk:"#78909C" },
  { ad:"الفَريقُ البُرْتُقالِيّ", tr:"Turuncu", renk:"#FB8C00" },
  { ad:"الفَريقُ الوَرْدِيّ",   tr:"Pembe",   renk:"#EC407A" },
  { ad:"الفَريقُ الفَيْروزِيّ", tr:"Turkuaz", renk:"#00ACC1" },
  { ad:"الفَريقُ الكُحْلِيّ",   tr:"Lacivert",renk:"#3949AB" },
  { ad:"الفَريقُ البُنِّيّ",    tr:"Kahve",   renk:"#8D6E63" },
  { ad:"الفَريقُ الزَّيْتونِيّ", tr:"Zeytin",  renk:"#7CB342" }
];

/* Arapça rakamlar: adlandırılmış renkler bitince takımlar numaralanır. */
const AR_RAKAM = ["٠","١","٢","٣","٤","٥","٦","٧","٨","٩"];
const arRakam = n => String(n).split("").map(c => AR_RAKAM[+c] !== undefined ? AR_RAKAM[+c] : c).join("");

/* i. takımın adı ve rengi. Listedeki renkler bittiğinde renk tekerleğinden
   eşit aralıklı yeni bir ton üretilir; böylece takım sayısında üst sınır
   yoktur, sadece sınıftaki öğrenci sayısı kadar takım kurulabilir. */
function takimBilgi(i){
  const t = TAKIM_RENK[i];
  if (t) return { ad:t.ad, tr:t.tr + " takım", renk:t.renk };
  const ton = (i * 47) % 360;
  return { ad:"الفَريقُ " + arRakam(i + 1), tr:(i + 1) + ". takım",
           renk:"hsl(" + ton + " 55% 46%)" };
}

/* Sınıfta kaç öğrenci varsa en fazla o kadar takım kurulabilir. */
function enFazlaTakim(){ return Math.max(2, gecerliNolar().length || 2); }
const BICIM_AD = { test:"اِخْتِيار", surukle:"تَرْتيب", eslestir:"وَصْل", yazma:"كِتابَة" };
const BICIM_TR = { test:"Çoktan seçmeli", surukle:"Sıralama", eslestir:"Eşleştirme", yazma:"Yazma" };
const HARF = ["A","B","C","D","E","F"];

/* Yarışma biçimi iki tarafta aynı kavram, farklı ad taşır. */
const BICIM_ES   = { kisi:"birey", takim:"takim", sinif:"okul"  };
const BICIM_TERS = { birey:"kisi", takim:"takim", okul:"sinif" };

const D = {
  bicim: "takim",              // kisi | takim | sinif  (canlı taraftaki birey|takim|okul karşılığı)
  bas: 1, son: 24, yok: "", takimSayi: 4,
  sinifAdlari: "",             // sınıf sisteminde yarışan sınıflar (öğretmen yazar)
  tasinan: null,               // takımlar arasında taşınan sıra numarası
  anlAdim: 0, anlatimGoruldu: false,   // "nasıl işler" akış anlatımı
  katilim: [],                 // {id, ad, alt, renk, puan}
  sorular: [],
  aktif: 0, cevapAcik: false, sayacKalan: 0, sayacId: null, sure: 30,
  sureEk: 0,                   // o soruya elle eklenen ek saniye (+15)
  turImza: "",                 // hazırlanan soru setinin ait olduğu seçimler
  yanAcik: false, gsId: null, gsT: null, pkT: null, bitti: false,
  turPuan: {},                 // { soruSırası: { katılımcıId: "d" | "y" } }
  siralamaAcik: false,         // sorular arasındaki tam ekran sıralama
  mod: "cevrimdisi",           // cevrimdisi | canli — tek kurulum, iki çıkış
  adim: 1,                     // adımlar() dizisindeki sıra
  turnuva: null,               // eşleşmeli kupa şeması (bkz. turnuvaKur)
  mac: null                    // turnuvada oynanan maç: {ti, mi, yarisan, sorular, sonuc}
};

/* Ders, soru biçimi süzgeci ve soru sayısı iki modda ORTAK: tek kaynak `state`.
   Böylece çevrimdışı kurulumda seçtiğin ders canlı tarafta da seçili gelir. */
Object.defineProperties(D, {
  konuId: {
    enumerable: true,
    get(){ return state.konuId || null; },
    set(v){ state.konuId = v || null; }
  },
  bicimSecim: {
    enumerable: true,
    get(){ return state.bicimSecim; }
  },
  soruSayisi: {
    enumerable: true,
    get(){ return state.soruSayisi || 10; },
    set(v){ state.soruSayisi = Math.max(1, Math.min(50, parseInt(v, 10) || 10)); }
  }
});

const kacisi = s => String(s == null ? "" : s)
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const arMi = t => /[؀-ۿ]/.test(String(t || ""));
/* Harekeleri, tırnakları ve boşlukları atarak karşılaştırma anahtarı üretir. */
const sadeAr = t => String(t || "")
  .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
  .replace(/[«»"'"".,؟?!:\s]/g, "");
/* Sorulan kelime zaten soru cümlesinin içinde geçiyorsa ayrıca yazma. */
function arapcaSatiri(s){
  const a = s && s.arapca;
  if (!a) return "";
  const k = sadeAr(a);
  if (k && sadeAr(s.soru).indexOf(k) >= 0) return "";
  return a;
}
const el = id => document.getElementById(id);
/* Çevrimdışıda seçilenleri canlı ekrana taşı: ders, soru sayısı ve — oda
   açık değilse — yarışma biçimi. Oda açıksa biçime dokunmayız; canlı taraf
   kendi "odayı bırakıyorsun" onayını göstersin. */
function canliyaAktar(){
  try {
    if (!state.odaId) state.oyunModu = BICIM_ES[D.bicim] || "takim";
    const k = konuBul(D.konuId);
    if (k && k.unite && state.uniteNo !== k.unite && BIY.uniteSec) BIY.uniteSec(k.unite);
    /* Ders zaten ortak durumda; yeniden seçmek havuz seçimini boşuna riske
       atıyordu. Yalnız gerçekten farklıysa dokunuyoruz. */
    if (k && BIY.konuSec && state.konuId !== k.id) BIY.konuSec(k.id);
    /* Çevrimdışıda seçilen yarışma biçiminin karşılığı olan kart işaretlensin. */
    const kart = { birey:"kartBirey", takim:"kartTakim", okul:"kartOkul" };
    Object.keys(kart).forEach(m => {
      const e = el(kart[m]);
      if (e) e.classList.toggle("cdw-esles", m === (BICIM_ES[D.bicim] || "takim"));
    });
  } catch(e){ console.warn("[CD] canlıya aktarım:", e); }
}

/* Canlı tarafta seçilenleri çevrimdışı kuruluma al. Ders/soru sayısı/biçim
   süzgeci zaten ortak; burada yalnız yarışma biçimini geri çeviriyoruz. */
function canlidanAl(){
  /* Biçim artık ortak adımda seçiliyor. Yalnız canlı tarafta açık bir oda
     varsa mod orada sabitlenmiştir; o zaman onu esas alırız. */
  if (!state.odaId) return;
  const yeni = BICIM_TERS[state.oyunModu];
  if (yeni && yeni !== D.bicim){ D.bicim = yeni; D.katilim = []; }
}

/* ---------- puanlama kuralı ----------
   "Hangi dersten soru gelsin?" sayfasındaki Puanlama süzgecinden gelir:
   ya her doğru aynı puan, ya da sorunun zorluk yıldızına göre. Yanlışa eksi
   puan ayrı bir anahtarla açılır. */
function puanAyar(){
  const p = (typeof state !== "undefined" && state.puanlama) || null;
  return p || { yon:"sabit", dogru:1, kolay:1, orta:2, zor:3, yanlisAc:false, yanlis:1 };
}
function soruPuani(s){
  const p = puanAyar();
  if (p.yon !== "zorluk") return Math.max(1, p.dogru || 1);
  const z = (s && (s.zorluk === 2 || s.zorluk === 3)) ? s.zorluk : 1;
  return Math.max(1, (z === 3 ? p.zor : z === 2 ? p.orta : p.kolay) || 1);
}
function yanlisPuani(){ const p = puanAyar(); return p.yanlisAc ? Math.max(1, p.yanlis || 1) : 0; }
function puanOzetTr(){
  const p = puanAyar();
  const bas = (p.yon === "zorluk")
    ? "zorluğa göre " + p.kolay + " / " + p.orta + " / " + p.zor + " puan"
    : "her doğru " + Math.max(1, p.dogru || 1) + " puan";
  return bas + (p.yanlisAc ? ", yanlış −" + Math.max(1, p.yanlis || 1) : "");
}

/* Süre artık zorluğa göre: 4. adımdaki yıldız akordiyonunda elle ayarlanır. */
function soruSuresi(s){
  try { if (BIY._soruSuresi) return BIY._soruSuresi(s); } catch(e){}
  return D.sure;
}
/* Öğretmen +15 sn eklediğinde ilerleme çubuğu da uzasın: toplam süre
   sorunun kendi süresi + o soruya eklenen ek süredir. */
function toplamSure(s){ return (soruSuresi(s) || 1) + (D.sureEk || 0); }
function sureOzet(){
  try {
    const y = z => (state.sureler && state.sureler[z]) || D.sure;
    return "★ " + y(1) + " · ★★ " + y(2) + " · ★★★ " + y(3) + " sn";
  } catch(e){ return D.sure + " sn"; }
}

/* Kısa ve yumuşak kaydırma — tarayıcının smooth davranışı bazı kaplamalarda
   çalışmadığı için elle yapıyoruz. */
function yumusakKaydir(kap, hedef, sure){
  const bas = kap.scrollTop;
  const fark = hedef - bas;
  if (Math.abs(fark) < 2) return;
  const t0 = performance.now();
  const adim = (t) => {
    const o = Math.min(1, (t - t0) / sure);
    const y = o < .5 ? 4*o*o*o : 1 - Math.pow(-2*o + 2, 3) / 2;   // ease-in-out
    kap.scrollTop = bas + fark * y;
    if (o < 1) requestAnimationFrame(adim);
  };
  requestAnimationFrame(adim);
}

/* ---------- sesler ----------
   Canlı taraftaki SES modülünü kullanıyoruz; yoksa sessizce geçiyoruz. */
function sesCal(notalar, kazanc){
  try { if (typeof SES !== "undefined" && SES._cal) SES._cal(notalar, kazanc); } catch(e){}
}
/* son saniyelerin tik sesi — kalan azaldıkça tizleşir */
function sesTik(kalan){
  const f = 740 + (5 - Math.min(5, kalan)) * 90;
  sesCal([{ f: f, t: 0, d: 0.10 }], 0.20);
}
/* süre bitti: iki kademeli alçalan uyarı */
function sesSureBitti(){
  sesCal([{ f: 620, t: 0, d: 0.20 }, { f: 415, t: 0.16, d: 0.34 }], 0.22);
}
/* başlangıç geri sayımı */
function sesBaslaTik(n){
  if (n > 0) sesCal([{ f: 620 + (3 - n) * 110, t: 0, d: 0.12 }], 0.20);
  else sesCal([{ f: 784, t: 0, d: 0.12 }, { f: 1047, t: 0.10, d: 0.26 }], 0.22);
}

let _sunumUyariId = null;
function uyarSunum(mesaj){
  const k = el("cdSunum"); if (!k) return;
  let u = k.querySelector(".cd-sunum-uyari");
  if (!u){ u = document.createElement("div"); u.className = "cd-sunum-uyari"; k.appendChild(u); }
  u.textContent = mesaj;
  u.classList.add("gorun");
  clearTimeout(_sunumUyariId);
  _sunumUyariId = setTimeout(() => u.classList.remove("gorun"), 2600);
}

let _uyariId = null;
function uyar(mesaj){
  const u = el("cdUyari"); if (!u) return;
  u.textContent = mesaj; u.classList.add("gorun");
  clearTimeout(_uyariId);
  _uyariId = setTimeout(() => u.classList.remove("gorun"), 3200);
}
function karis(a){ const d=a.slice(); for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];} return d; }

/* ---------- veri katmanı köprüsü ---------- */
function konular(){
  const gor = (typeof gorunurUniteNolar === "function")
    ? gorunurUniteNolar(state.uniteKilit) : [1,2,3,4];
  return KONULAR.filter(k => k.unite && gor.indexOf(k.unite) >= 0);
}
function uniteler(){
  const gor = (typeof gorunurUniteNolar === "function")
    ? gorunurUniteNolar(state.uniteKilit) : [1,2,3,4];
  return UNITELER.filter(u => gor.indexOf(u.no) >= 0);
}
function konuBul(id){ return KONULAR.find(k => k.id === id) || null; }
function konuSorulari(k){
  if (!k || !Array.isArray(k.sorular)) return [];
  /* Tek kaynak canlı taraf: tür ve zorluk süzgeçleri orada tutuluyor. */
  try { if (BIY._konuSorulari) return BIY._konuSorulari(k); } catch(e){}
  return k.sorular.filter(q => D.bicimSecim[(q && q.bicim) || "test"] !== false);
}
/* Açık zorlukların Türkçe özeti (3. adımdaki bilgi satırı için). */
function zorlukOzet(){
  const z = (typeof state !== "undefined" && state.zorlukSecim) || null;
  if (!z) return "";
  const ad = { 1:"kolay", 2:"orta", 3:"zor" };
  const acik = [1,2,3].filter(x => z[x] !== false);
  if (acik.length === 3) return "";
  return acik.map(x => ad[x]).join(" + ");
}
function seciliSorular(){
  const k = konuBul(D.konuId);
  return k ? konuSorulari(k) : [];
}
/* Yarışmaya ve çıktıya gidecek havuz: öğretmen "Soruları seç"ten elle
   seçim yaptıysa yalnız o sorular, yapmadıysa dersin bütün havuzu. */
function yarismaHavuzu(){
  try {
    if (BIY._secSet && BIY._secSet().size && BIY._secilenSorular){
      const s = BIY._secilenSorular();
      if (s && s.length) return s;
    }
  } catch(e){}
  return seciliSorular();
}
/* Kaç soru sorulacak: soru sayısı süzgecindeki değer esastır. */
function hedefSoru(){ return Math.max(1, Math.min(50, D.soruSayisi)); }
function havuzSecili(){
  try { return (BIY._secSet && BIY._secSet().size) || 0; } catch(e){ return 0; }
}
/* Soru setini kurar: havuz (elle seçim varsa o), hedef sayı kadarı. */
function setKur(){
  const havuz = yarismaHavuzu();
  if (!havuz.length) return false;
  const n = hedefSoru();
  D.sorular = karis(havuz).slice(0, Math.min(n, havuz.length)).map(soruHazirla);
  D.turImza = turImza();
  D.aktif = 0; D.cevapAcik = false; D.turPuan = {}; D.siralamaAcik = false; D.bitti = false;
  D.katilim.forEach(k => k.puan = 0);
  return true;
}

/* Yazılan sınıf adlarını listeye çevir: virgül, noktalı virgül veya satır. */
function sinifAdlari(){
  return String(D.sinifAdlari || "")
    .split(/[,;\n]+/).map(s => s.trim()).filter(Boolean).slice(0, 24);
}

/* ---------- katılımcı listesi ---------- */
function listeKur(){
  const yok = new Set(String(D.yok || "").split(/[^0-9]+/).filter(Boolean).map(Number));
  const nolar = [];
  for (let i = Math.max(1, D.bas); i <= Math.max(D.bas, D.son); i++) if (!yok.has(i)) nolar.push(i);

  if (D.bicim === "kisi"){
    D.katilim = nolar.map(n => ({ id:"k"+n, ad:String(n), tr:String(n)+". sıra", alt:"", renk:"#1F3864", puan:0 }));
  } else if (D.bicim === "takim"){
    const n = Math.max(2, Math.min(Math.max(2, nolar.length || 2), D.takimSayi));
    const k = karis(nolar);
    const kutu = Array.from({length:n}, () => []);
    k.forEach((no,i) => kutu[i % n].push(no));
    D.katilim = kutu.map((uy,i) => {
      const t = takimBilgi(i);
      return { id:"t"+i, ad:t.ad, tr:t.tr, alt:uy.sort((a,b)=>a-b).join(" · "),
               renk:t.renk, puan:0, uyeler:uy };
    });
  } else {
    /* Sınıf sisteminde birden çok sınıf yarışabilir: 7-A, 7-B, 7-C … */
    const adlar = sinifAdlari();
    D.katilim = adlar.map((ad, i) => {
      const t = takimBilgi(i);
      return { id:"s"+i, ad:ad, tr:ad, alt:"", renk:t.renk, puan:0 };
    });
  }
}

/* ---------- kurulum ekranı ---------- */

/* ---------- Türkçe karşılıklar (öğretmen ekranı tamamen Türkçe olsun) ---------- */
const UNITE_TR = {
  1: "1. Ünite · Bugün ne yaptın?",
  2: "2. Ünite · Alışveriş vakti",
  3: "3. Ünite · Nereye gidiyoruz?",
  4: "4. Ünite · Şehrim ve ülkem"
};
const DERS_TR = {
  unite1:"Ünitenin tamamı",      gunluk:"Günlük düzen",        yemek:"Yiyecek ve içecek",
  saat:"Saatler",                gunler:"Haftanın günleri",    namaz:"Namaz vakitleri",
  zamir:"Zamir ve fiil",
  unite2:"Ünitenin tamamı",      market:"Market ürünleri",     sebze:"Sebzeler",
  meyve:"Meyveler",              aded:"Sayılar ve fiyat",      mukayese:"Karşılaştırma",
  unite3:"Ünitenin tamamı",      vasita:"Ulaşım araçları",     mekan:"Mekânlar",
  yon:"Yön ve trafik",           mukayese3:"Araçları karşılaştırma", sefer:"Yolculuk cümleleri",
  unite4:"Ünitenin tamamı",      sehir:"Şehirler",             konum:"Şehirlerin konumu",
  meshur:"Neyiyle meşhur",       saat4:"Saat (buçuk ve çeyrek)", sifat:"Sıfatlar ve çoğul",
  tumu:"Bütün üniteler",         tum12:"İlk iki ünitenin tamamı"
};
const uniteTr = u => UNITE_TR[u.no] || u.ad;
const dersTr  = k => DERS_TR[k.id] || k.ad;

/* ---------- SVG çizimleri (düz, renkli, büyük) ---------- */
const CIZ = {};

CIZ.kisi = `<svg viewBox="0 0 140 110" class="cdw-cizim" aria-hidden="true">
  <ellipse cx="70" cy="99" rx="46" ry="7" fill="#E8EEF6"/>
  <rect x="30" y="66" width="80" height="26" rx="5" fill="#F5C99B"/>
  <rect x="30" y="66" width="80" height="7" rx="3.5" fill="#E0A96D"/>
  <rect x="38" y="92" width="7" height="8" fill="#C98A55"/><rect x="95" y="92" width="7" height="8" fill="#C98A55"/>
  <path d="M52 66 v-14 a18 18 0 0 1 36 0 v14 Z" fill="#42A5F5"/>
  <circle cx="70" cy="34" r="15" fill="#F7D2B0"/>
  <path d="M55 32 a15 15 0 0 1 30 0 q-15 -9 -30 0 Z" fill="#3E2A20"/>
  <circle cx="64.5" cy="35" r="1.9" fill="#3E2A20"/><circle cx="75.5" cy="35" r="1.9" fill="#3E2A20"/>
  <path d="M65 41 q5 4 10 0" stroke="#C97B5A" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M88 60 l14 -22" stroke="#F7D2B0" stroke-width="8" stroke-linecap="round"/>
  <circle cx="103" cy="35" r="5.5" fill="#F7D2B0"/>
  <rect x="44" y="70" width="30" height="20" rx="2" fill="#fff" stroke="#C7D3E0" stroke-width="1.6"/>
  <path d="M49 76 h20 M49 81 h20 M49 86 h12" stroke="#C7D3E0" stroke-width="1.8" stroke-linecap="round"/>
</svg>`;

CIZ.takim = `<svg viewBox="0 0 140 110" class="cdw-cizim" aria-hidden="true">
  <ellipse cx="70" cy="99" rx="56" ry="7" fill="#E8EEF6"/>
  <g>
    <path d="M18 92 v-22 a14 14 0 0 1 28 0 v22 Z" fill="#16A085"/>
    <circle cx="32" cy="52" r="12" fill="#F7D2B0"/>
    <path d="M20 50 a12 12 0 0 1 24 0 q-12 -7 -24 0 Z" fill="#5A3B2E"/>
    <circle cx="27.5" cy="53" r="1.6" fill="#3E2A20"/><circle cx="36.5" cy="53" r="1.6" fill="#3E2A20"/>
  </g>
  <g>
    <path d="M94 92 v-22 a14 14 0 0 1 28 0 v22 Z" fill="#EF5350"/>
    <circle cx="108" cy="52" r="12" fill="#EFC49A"/>
    <path d="M96 50 a12 12 0 0 1 24 0 q-12 -7 -24 0 Z" fill="#2F2A26"/>
    <circle cx="103.5" cy="53" r="1.6" fill="#3E2A20"/><circle cx="112.5" cy="53" r="1.6" fill="#3E2A20"/>
  </g>
  <g>
    <path d="M52 94 v-26 a16 16 0 0 1 32 0 v26 Z" fill="#42A5F5"/>
    <circle cx="68" cy="46" r="14" fill="#FADFC4"/>
    <path d="M54 44 a14 14 0 0 1 28 0 q-14 -8 -28 0 Z" fill="#4A3226"/>
    <circle cx="62.5" cy="47" r="1.8" fill="#3E2A20"/><circle cx="73.5" cy="47" r="1.8" fill="#3E2A20"/>
    <path d="M63 54 q5 4 10 0" stroke="#C97B5A" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  </g>
  <path d="M28 30 v-14 l14 5 -14 5" fill="#16A085" stroke="#0E6E5C" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M112 30 v-14 l-14 5 14 5" fill="#EF5350" stroke="#C0392B" stroke-width="1.4" stroke-linejoin="round"/>
</svg>`;

CIZ.sinif = `<svg viewBox="0 0 140 110" class="cdw-cizim" aria-hidden="true">
  <rect x="24" y="10" width="92" height="34" rx="4" fill="#2E7D6B"/>
  <rect x="24" y="10" width="92" height="34" rx="4" fill="none" stroke="#1E5A4C" stroke-width="2.6"/>
  <path d="M34 22 h40 M34 30 h56 M34 38 h28" stroke="#BFE8DD" stroke-width="2.6" stroke-linecap="round"/>
  <ellipse cx="70" cy="101" rx="60" ry="6" fill="#E8EEF6"/>
  <g>
    <path d="M14 88 v-14 a9 9 0 0 1 18 0 v14 Z" fill="#F39C12"/><circle cx="23" cy="65" r="8" fill="#F7D2B0"/>
    <path d="M42 88 v-14 a9 9 0 0 1 18 0 v14 Z" fill="#42A5F5"/><circle cx="51" cy="65" r="8" fill="#EFC49A"/>
    <path d="M80 88 v-14 a9 9 0 0 1 18 0 v14 Z" fill="#EF5350"/><circle cx="89" cy="65" r="8" fill="#FADFC4"/>
    <path d="M108 88 v-14 a9 9 0 0 1 18 0 v14 Z" fill="#7E57C2"/><circle cx="117" cy="65" r="8" fill="#F7D2B0"/>
  </g>
  <g>
    <path d="M30 100 v-9 a8 8 0 0 1 16 0 v9 Z" fill="#16A085"/><circle cx="38" cy="83" r="7" fill="#EFC49A"/>
    <path d="M64 100 v-9 a8 8 0 0 1 16 0 v9 Z" fill="#26C6DA"/><circle cx="72" cy="83" r="7" fill="#F7D2B0"/>
    <path d="M96 100 v-9 a8 8 0 0 1 16 0 v9 Z" fill="#EC7063"/><circle cx="104" cy="83" r="7" fill="#FADFC4"/>
  </g>
</svg>`;

CIZ.liste = `<svg viewBox="0 0 140 110" class="cdw-cizim" aria-hidden="true">
  <rect x="30" y="10" width="80" height="94" rx="8" fill="#fff" stroke="#C7D3E0" stroke-width="2.6"/>
  <rect x="56" y="4" width="28" height="13" rx="4" fill="#8C97A3"/>
  <g>
    <circle cx="46" cy="36" r="7" fill="#16A085"/><text x="46" y="39.5" text-anchor="middle" font-size="8.5" fill="#fff" font-family="sans-serif" font-weight="700">1</text>
    <rect x="59" y="32" width="42" height="7" rx="3.5" fill="#DCE6F0"/>
  </g>
  <g>
    <circle cx="46" cy="55" r="7" fill="#42A5F5"/><text x="46" y="58.5" text-anchor="middle" font-size="8.5" fill="#fff" font-family="sans-serif" font-weight="700">2</text>
    <rect x="59" y="51" width="42" height="7" rx="3.5" fill="#DCE6F0"/>
  </g>
  <g>
    <circle cx="46" cy="74" r="7" fill="#EF5350"/><text x="46" y="77.5" text-anchor="middle" font-size="8.5" fill="#fff" font-family="sans-serif" font-weight="700">3</text>
    <rect x="59" y="70" width="42" height="7" rx="3.5" fill="#DCE6F0"/>
  </g>
  <g opacity=".45">
    <circle cx="46" cy="92" r="7" fill="#8C97A3"/>
    <rect x="59" y="88" width="30" height="7" rx="3.5" fill="#E4EBF2"/>
  </g>
</svg>`;

CIZ.kitap = `<svg viewBox="0 0 140 110" class="cdw-cizim" aria-hidden="true">
  <ellipse cx="70" cy="99" rx="52" ry="6" fill="#E8EEF6"/>
  <path d="M70 26 q-22 -12 -46 -6 v62 q24 -6 46 6 Z" fill="#fff" stroke="#C7D3E0" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M70 26 q22 -12 46 -6 v62 q-24 -6 -46 6 Z" fill="#F7FAFD" stroke="#C7D3E0" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M70 26 v62" stroke="#8C97A3" stroke-width="2.6"/>
  <path d="M34 36 h26 M34 46 h26 M34 56 h20 M80 36 h26 M80 46 h26 M80 56 h20"
        stroke="#DCE6F0" stroke-width="3" stroke-linecap="round"/>
  <path d="M92 12 v26 l-9 -7 -9 7 V12 Z" fill="#F39C12" stroke="#D68910" stroke-width="1.6" stroke-linejoin="round"/>
</svg>`;

CIZ.soru = `<svg viewBox="0 0 140 110" class="cdw-cizim" aria-hidden="true">
  <rect x="22" y="14" width="96" height="82" rx="9" fill="#fff" stroke="#C7D3E0" stroke-width="2.6"/>
  <rect x="22" y="14" width="96" height="18" rx="9" fill="#1F3864"/><rect x="22" y="25" width="96" height="7" fill="#1F3864"/>
  <circle cx="34" cy="23" r="4" fill="#FFC94A"/>
  <rect x="46" y="20" width="46" height="6" rx="3" fill="#5A7BA8"/>
  <g>
    <circle cx="38" cy="49" r="7.5" fill="#16A085"/><text x="38" y="52.5" text-anchor="middle" font-size="8.5" fill="#fff" font-family="sans-serif" font-weight="700">A</text>
    <rect x="51" y="45" width="54" height="8" rx="4" fill="#DCE6F0"/>
  </g>
  <g>
    <circle cx="38" cy="68" r="7.5" fill="#C7D3E0"/><text x="38" y="71.5" text-anchor="middle" font-size="8.5" fill="#fff" font-family="sans-serif" font-weight="700">B</text>
    <rect x="51" y="64" width="44" height="8" rx="4" fill="#E9F0F7"/>
  </g>
  <g>
    <circle cx="38" cy="86" r="7.5" fill="#C7D3E0"/><text x="38" y="89.5" text-anchor="middle" font-size="8.5" fill="#fff" font-family="sans-serif" font-weight="700">C</text>
    <rect x="51" y="82" width="50" height="8" rx="4" fill="#E9F0F7"/>
  </g>
</svg>`;

CIZ.perde = `<svg viewBox="0 0 140 110" class="cdw-cizim" aria-hidden="true">
  <rect x="16" y="6" width="108" height="8" rx="4" fill="#8C97A3"/>
  <rect x="20" y="14" width="100" height="62" rx="3" fill="#1F3864"/>
  <rect x="24" y="18" width="92" height="54" rx="2" fill="#2C4C82"/>
  <text x="70" y="58" text-anchor="middle" font-size="42" fill="#FFC94A" font-family="sans-serif" font-weight="800">?</text>
  <circle cx="41" cy="66" r="5.5" fill="#16A085"/><circle cx="57" cy="66" r="5.5" fill="#42A5F5"/>
  <circle cx="83" cy="66" r="5.5" fill="#EF5350"/><circle cx="99" cy="66" r="5.5" fill="#F39C12"/>
  <path d="M70 76 v10" stroke="#8C97A3" stroke-width="3"/>
  <path d="M52 100 h36 l-8 -14 h-20 Z" fill="#B9C6D4"/>
  <ellipse cx="70" cy="101" rx="34" ry="5" fill="#E8EEF6"/>
</svg>`;

CIZ.yazici = `<svg viewBox="0 0 140 110" class="cdw-cizim" aria-hidden="true">
  <rect x="40" y="4" width="60" height="34" rx="3" fill="#fff" stroke="#C7D3E0" stroke-width="2.4"/>
  <path d="M48 14 h30 M48 22 h44 M48 30 h24" stroke="#DCE6F0" stroke-width="3" stroke-linecap="round"/>
  <rect x="26" y="38" width="88" height="38" rx="7" fill="#5A7BA8"/>
  <rect x="26" y="38" width="88" height="10" rx="5" fill="#3E5D8C"/>
  <circle cx="100" cy="58" r="4.5" fill="#7CE7A8"/>
  <rect x="34" y="54" width="30" height="6" rx="3" fill="#8FA9CC"/>
  <rect x="40" y="72" width="60" height="34" rx="3" fill="#fff" stroke="#C7D3E0" stroke-width="2.4"/>
  <path d="M48 82 h44 M48 90 h44 M48 98 h28" stroke="#DCE6F0" stroke-width="3" stroke-linecap="round"/>
  <circle cx="86" cy="92" r="10" fill="#16A085"/>
  <path d="M81 92 l4 4 7 -8" stroke="#fff" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

CIZ.karekod = `<svg viewBox="0 0 140 110" class="cdw-cizim" aria-hidden="true">
  <ellipse cx="70" cy="101" rx="46" ry="6" fill="#E8EEF6"/>
  <rect x="42" y="8" width="56" height="80" rx="9" fill="#fff" stroke="#C7D3E0" stroke-width="2.6"/>
  <rect x="48" y="18" width="44" height="58" rx="4" fill="#F7FAFD"/>
  <g fill="#1F3864">
    <path d="M53 23 h11 v11 h-11 Z" fill="none" stroke="#1F3864" stroke-width="2.4"/>
    <rect x="57" y="27" width="3" height="3"/>
    <path d="M76 23 h11 v11 h-11 Z" fill="none" stroke="#1F3864" stroke-width="2.4"/>
    <rect x="80" y="27" width="3" height="3"/>
    <path d="M53 46 h11 v11 h-11 Z" fill="none" stroke="#1F3864" stroke-width="2.4"/>
    <rect x="57" y="50" width="3" height="3"/>
    <rect x="76" y="46" width="4" height="4"/><rect x="83" y="46" width="4" height="4"/>
    <rect x="76" y="53" width="4" height="4"/><rect x="83" y="60" width="4" height="4"/>
    <rect x="69" y="60" width="4" height="4"/><rect x="76" y="67" width="4" height="4"/>
    <rect x="55" y="63" width="4" height="4"/><rect x="62" y="68" width="4" height="4"/>
  </g>
  <rect x="60" y="80" width="20" height="3.4" rx="1.7" fill="#DCE6F0"/>
  <g stroke="#16A085" stroke-width="2.8" fill="none" stroke-linecap="round">
    <path d="M22 40 q-7 15 0 30"/><path d="M13 32 q-11 23 0 46"/>
    <path d="M118 40 q7 15 0 30"/><path d="M127 32 q11 23 0 46"/>
  </g>
</svg>`;

CIZ.defter = `<svg viewBox="0 0 140 110" class="cdw-cizim" aria-hidden="true">
  <ellipse cx="70" cy="101" rx="50" ry="6" fill="#E8EEF6"/>
  <rect x="28" y="14" width="74" height="84" rx="6" fill="#fff" stroke="#C7D3E0" stroke-width="2.4"/>
  <rect x="28" y="14" width="13" height="84" rx="6" fill="#EAF1FA"/>
  <g fill="#8C97A3">
    <circle cx="34.5" cy="26" r="2.6"/><circle cx="34.5" cy="42" r="2.6"/>
    <circle cx="34.5" cy="58" r="2.6"/><circle cx="34.5" cy="74" r="2.6"/>
  </g>
  <path d="M50 30 h44 M50 42 h44 M50 54 h30" stroke="#DCE6F0" stroke-width="3" stroke-linecap="round"/>
  <g>
    <circle cx="56" cy="70" r="7.5" fill="#16A085"/>
    <path d="M52.5 70 l2.6 2.8 4.6 -5.4" stroke="#fff" stroke-width="2.2" fill="none"
          stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M69 70 h25" stroke="#DCE6F0" stroke-width="3" stroke-linecap="round"/>
  </g>
  <g transform="rotate(30 108 58)">
    <rect x="102" y="20" width="11" height="50" rx="2" fill="#F39C12"/>
    <rect x="102" y="20" width="11" height="9" rx="2" fill="#E67E22"/>
    <path d="M102 70 h11 l-5.5 11 Z" fill="#F7D2B0"/>
    <path d="M104.5 76.5 h6 l-3 6 Z" fill="#3E2A20"/>
  </g>
</svg>`;

CIZ.kart = `<svg viewBox="0 0 140 110" class="cdw-cizim" aria-hidden="true">
  <rect x="26" y="8" width="76" height="94" rx="7" fill="#fff" stroke="#C7D3E0" stroke-width="2.6"/>
  <rect x="26" y="8" width="76" height="16" rx="7" fill="#16A085"/><rect x="26" y="17" width="76" height="7" fill="#16A085"/>
  <g stroke="#C7D3E0" stroke-width="1.8">
    <rect x="34" y="32" width="12" height="12" rx="2.5" fill="#F7FAFD"/>
    <rect x="34" y="50" width="12" height="12" rx="2.5" fill="#F7FAFD"/>
    <rect x="34" y="68" width="12" height="12" rx="2.5" fill="#F7FAFD"/>
    <rect x="34" y="86" width="12" height="12" rx="2.5" fill="#F7FAFD"/>
  </g>
  <rect x="52" y="35" width="42" height="6" rx="3" fill="#DCE6F0"/>
  <rect x="52" y="53" width="34" height="6" rx="3" fill="#DCE6F0"/>
  <rect x="52" y="71" width="40" height="6" rx="3" fill="#DCE6F0"/>
  <rect x="52" y="89" width="28" height="6" rx="3" fill="#DCE6F0"/>
  <path d="M36 37 l3 3 6 -7" stroke="#16A085" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M36 55 l3 3 6 -7" stroke="#16A085" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <g transform="rotate(28 106 62)">
    <rect x="100" y="24" width="11" height="52" rx="2" fill="#F39C12"/>
    <rect x="100" y="24" width="11" height="9" rx="2" fill="#E67E22"/>
    <path d="M100 76 h11 l-5.5 11 Z" fill="#F7D2B0"/>
    <path d="M102.5 82.5 h6 l-3 6 Z" fill="#3E2A20"/>
  </g>
</svg>`;

/* ---------- özgün seçim panelleri ----------
   Ders seçici, soru havuzu, soru sayısı, biçim süzgeci ve zorluğa göre süre
   ayarı canlı ekranda zaten var. Yeniden yazmak yerine gerçek düğümleri
   kuruluma taşıyoruz: bütün davranış (arama, sepet, elle süre) aynen çalışır. */
const PANEL = {};
function panelleriBul(){
  if (PANEL.bulundu) return;
  PANEL.ders = document.querySelector("#ekranAnasayfa .biy-konu-panel");
  PANEL.ayar = document.querySelector("#ekranAnasayfa .biy-sorusayi-secim");
  PANEL.sure = document.getElementById("sureAkordiyon");
  PANEL.bulundu = true;
}
function panelYerlestir(){
  panelleriBul();
  const koy = (yuva, dugum) => {
    const y = document.getElementById(yuva);
    if (y && dugum && dugum.parentNode !== y) y.appendChild(dugum);
  };
  koy("cdPanelDers", PANEL.ders);
  koy("cdPanelAyar", PANEL.ayar);
  /* Süre akordiyonu kendi düğmesinin içine girsin: öbür süzgeçler gibi
     sayfanın üstüne açılır, sayfayı aşağı doğru uzatmaz. */
  koy("sureSec", PANEL.sure);
}

/* ---------- büyük mod anahtarı (1. adımda) ---------- */
/* Geri sayım sahnesi: iki öğrenci defterlerinin başında bekler, "Başla!"
   deyince öne eğilip yazmaya başlar. Katmanlar ayrı çiziliyor: önce gövdeler,
   sonra sıra, sonra defterler, en önde kalem tutan kollar. */
/* Gövde + baş: iki sahnede de aynı karakter. `alt` gövdenin bittiği yer;
   oturan öğrencide sıranın arkasında kesilir, ayaktakinde bacaklar eklenir. */
function gsKisi(govde, sac, ten, alt, ayakta){
  return `${ayakta ? `
    <rect x="-17" y="${alt - 4}" width="13" height="${ayakta}" rx="5" fill="#37474F"/>
    <rect x="4"  y="${alt - 4}" width="13" height="${ayakta}" rx="5" fill="#37474F"/>
    <rect x="-21" y="${alt + ayakta - 9}" width="19" height="10" rx="4.5" fill="#263238"/>
    <rect x="2"   y="${alt + ayakta - 9}" width="19" height="10" rx="4.5" fill="#263238"/>` : ""}
    <path d="M-27 ${alt} v-${alt - 96} a27 27 0 0 1 54 0 v${alt - 96} Z" fill="${govde}"/>
    ${ayakta ? "" : `<path d="M-27 116 h54" stroke="rgba(0,0,0,.08)" stroke-width="2.2"/>`}
    <g class="cd-gs-bas">
      <circle cx="0" cy="56" r="23" fill="${ten}"/>
      <path d="M-23 55 a23 23 0 0 1 46 0 q-23 -15 -46 0 Z" fill="${sac}"/>
      <circle class="cd-gs-goz" cx="-8" cy="58" r="2.5" fill="#3E2A20"/>
      <circle class="cd-gs-goz" cx="8" cy="58" r="2.5" fill="#3E2A20"/>
      <path d="M-6 67 q6 5 12 0" stroke="#C97B5A" stroke-width="2" fill="none" stroke-linecap="round"/>
    </g>`;
}

function gsGovde(x, ayna, govde, sac, ten, gec){
  return `<g transform="translate(${x},0)${ayna ? " scale(-1,1)" : ""}">
    <g class="cd-gs-ogr" style="--gec:${gec}s">
      <rect x="27" y="80" width="9" height="60" rx="4" fill="#CBD5E1"/>
      <rect x="18" y="46" width="16" height="42" rx="7" fill="#DCE3EB"/>
      ${gsKisi(govde, sac, ten, 134)}
    </g>
  </g>`;
}
function gsDefter(x, ayna, gec){
  return `<g transform="translate(${x},0)${ayna ? " scale(-1,1)" : ""}" style="--gec:${gec}s">
    <g transform="rotate(-5 -16 118)">
      <rect x="-54" y="102" width="74" height="30" rx="3" fill="#fff" stroke="#C7D3E0" stroke-width="1.8"/>
      <path d="M-49 102 v30" stroke="#B7C4D3" stroke-width="1.6"/>
      <g stroke="#5B9BD5" stroke-width="2.4" stroke-linecap="round" fill="none">
        <path class="cd-gs-yazi" d="M-43 112 h50"/>
        <path class="cd-gs-yazi cd-gs-y2" d="M-43 122 h36"/>
      </g>
    </g>
  </g>`;
}
function gsKol(x, ayna, ten, gec){
  return `<g transform="translate(${x},0)${ayna ? " scale(-1,1)" : ""}" style="--gec:${gec}s">
    <g class="cd-gs-kol">
      <path d="M22 98 L-4 116" stroke="${ten}" stroke-width="11.5" stroke-linecap="round"/>
      <circle cx="-7" cy="115" r="6.6" fill="${ten}"/>
      <path d="M-3 111 l13 -24" stroke="#F6C445" stroke-width="5.2" stroke-linecap="round"/>
      <path d="M-6.5 118 l4 -8" stroke="#5D4037" stroke-width="5.2" stroke-linecap="round"/>
    </g>
  </g>`;
}

CIZ.yazanlar = `<svg viewBox="0 0 460 196" class="cd-gs-sahne" aria-hidden="true">
  <ellipse cx="230" cy="184" rx="190" ry="9" fill="rgba(31,56,100,.07)"/>
  ${gsGovde(150, false, "#42A5F5", "#3E2A20", "#F7D2B0", 0)}
  ${gsGovde(310, true,  "#EF5350", "#4E342E", "#F5C99B", 0.18)}
  <rect x="42" y="134" width="376" height="12" rx="4" fill="#E0A96D"/>
  <rect x="42" y="134" width="376" height="4.5" rx="2" fill="#F2C892"/>
  <rect x="66" y="146" width="10" height="32" rx="3" fill="#C98A55"/>
  <rect x="384" y="146" width="10" height="32" rx="3" fill="#C98A55"/>
  ${gsDefter(150, false, 0)}
  ${gsDefter(310, true,  0.18)}
  ${gsKol(150, false, "#F7D2B0", 0)}
  ${gsKol(310, true,  "#F5C99B", 0.18)}
</svg>`;

/* Defterleri kaldırma: cevap açılınca önce öğrenciler yazdıklarını havaya
   kaldırır, öğretmen tek bakışta kimin ne yazdığını görür. */
function kdOgrenci(x, ayna, govde, sac, ten, gec){
  return `<g transform="translate(${x},0)${ayna ? " scale(-1,1)" : ""}">
    <g class="cd-gs-ogr" style="--gec:${gec}s">
      <rect x="27" y="80" width="9" height="60" rx="4" fill="#CBD5E1"/>
      <rect x="18" y="46" width="16" height="42" rx="7" fill="#DCE3EB"/>
      ${gsKisi(govde, sac, ten, 134)}
      <g class="cd-kd-tut">
        <path d="M-19 102 L-28 14" stroke="${ten}" stroke-width="11" stroke-linecap="round"/>
        <path d="M19 102 L28 14" stroke="${ten}" stroke-width="11" stroke-linecap="round"/>
        <circle cx="-29" cy="11" r="6.4" fill="${ten}"/>
        <circle cx="29" cy="11" r="6.4" fill="${ten}"/>
        <g transform="rotate(-3)">
          <rect x="-41" y="-28" width="82" height="39" rx="3.5" fill="#fff"
                stroke="#C7D3E0" stroke-width="1.9"/>
          <path d="M-35.5 -28 v39" stroke="#B7C4D3" stroke-width="1.7"/>
          <g stroke="#5B9BD5" stroke-width="2.5" stroke-linecap="round" fill="none">
            <path d="M-29 -17 h58"/><path d="M-29 -6 h44"/><path d="M-29 5 h51"/>
          </g>
        </g>
      </g>
    </g>
  </g>`;
}

CIZ.kaldiranlar = `<svg viewBox="0 0 460 250" class="cd-kd-ciz" aria-hidden="true">
  <g transform="translate(0,56)">
    <ellipse cx="230" cy="184" rx="190" ry="9" fill="rgba(31,56,100,.07)"/>
    ${kdOgrenci(150, false, "#42A5F5", "#3E2A20", "#F7D2B0", 0)}
    ${kdOgrenci(310, true,  "#EF5350", "#4E342E", "#F5C99B", 0.14)}
    <rect x="42" y="134" width="376" height="12" rx="4" fill="#E0A96D"/>
    <rect x="42" y="134" width="376" height="4.5" rx="2" fill="#F2C892"/>
    <rect x="66" y="146" width="10" height="32" rx="3" fill="#C98A55"/>
    <rect x="384" y="146" width="10" height="32" rx="3" fill="#C98A55"/>
  </g>
</svg>`;

/* Pankart: aynı iki öğrenci, bu kez aralarında bir bez tutuyor. Cevap
   gösterilince bez yukarıdan aşağı açılır ve doğru cevap üzerinde belirir. */
function pkOgrenci(x, ayna, govde, sac, ten, gec){
  return `<g transform="translate(${x},0)${ayna ? " scale(-1,1)" : ""}">
    <g class="cd-gs-ogr" style="--gec:${gec}s">
      ${gsKisi(govde, sac, ten, 176, 62)}
      <g class="cd-pk-kol">
        <path d="M20 104 L58 74" stroke="${ten}" stroke-width="12" stroke-linecap="round"/>
        <circle cx="60" cy="72" r="7" fill="${ten}"/>
      </g>
    </g>
  </g>`;
}

CIZ.pankart = `<svg viewBox="0 0 640 260" class="cd-pk-ciz" aria-hidden="true">
  <ellipse cx="320" cy="240" rx="266" ry="8" fill="rgba(31,56,100,.08)"/>
  ${pkOgrenci(76, false, "#42A5F5", "#3E2A20", "#F7D2B0", 0)}
  ${pkOgrenci(564, true, "#EF5350", "#4E342E", "#F5C99B", 0.1)}
  <rect x="132" y="24" width="9" height="142" rx="4" fill="#B7854A"/>
  <rect x="499" y="24" width="9" height="142" rx="4" fill="#B7854A"/>
  <circle cx="136.5" cy="22" r="6.5" fill="#D69E2E"/>
  <circle cx="503.5" cy="22" r="6.5" fill="#D69E2E"/>
  <g class="cd-pk-bez">
    <path d="M136 34 h368 v124 q-46 14 -92 0 t-92 0 -92 0 -92 0 Z"
          fill="#FFFBF0" stroke="#E9D9B4" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M136 34 h368 v13 h-368 Z" fill="#16A085" opacity=".14"/>
  </g>
</svg>`;

/* 2. adımın üç aşaması: numaraları yaz → gelmeyenleri çıkar → takımlar kurulsun */
CIZ.adimNo = `<svg viewBox="0 0 72 56" class="cdw-la-ciz" aria-hidden="true">
  <rect x="6" y="5" width="60" height="46" rx="7" fill="#fff" stroke="#C7D3E0" stroke-width="2.4"/>
  <path d="M17 5 v46" stroke="#E4EBF2" stroke-width="2.2"/>
  ${[0,1,2].map(i => `
    <circle cx="11.5" cy="${16 + i*13}" r="2.4" fill="#5B9BD5"/>
    <rect x="23" y="${12 + i*13}" width="${34 - i*7}" height="7" rx="3.5" fill="#DCE6F3"/>`).join("")}
</svg>`;

CIZ.adimYok = `<svg viewBox="0 0 72 56" class="cdw-la-ciz" aria-hidden="true">
  <rect x="6" y="5" width="60" height="46" rx="7" fill="#fff" stroke="#C7D3E0" stroke-width="2.4"/>
  <rect x="15" y="12" width="42" height="7" rx="3.5" fill="#DCE6F3"/>
  <g>
    <rect x="15" y="25" width="42" height="7" rx="3.5" fill="#F6D5D2"/>
    <path d="M13 28.5 h46" stroke="#EF5350" stroke-width="2.6" stroke-linecap="round"/>
  </g>
  <g>
    <rect x="15" y="38" width="30" height="7" rx="3.5" fill="#F6D5D2"/>
    <path d="M13 41.5 h34" stroke="#EF5350" stroke-width="2.6" stroke-linecap="round"/>
  </g>
</svg>`;

CIZ.adimTakim = `<svg viewBox="0 0 72 56" class="cdw-la-ciz" aria-hidden="true">
  ${[["#16A085",5],["#42A5F5",26],["#EF5350",47]].map(([c,x]) => `
    <rect x="${x}" y="10" width="20" height="36" rx="5" fill="#fff" stroke="${c}" stroke-width="2.4"/>
    <rect x="${+x+4}" y="15" width="12" height="5" rx="2.5" fill="${c}"/>
    <circle cx="${+x+7}" cy="28" r="3" fill="${c}" opacity=".55"/>
    <circle cx="${+x+14}" cy="28" r="3" fill="${c}" opacity=".55"/>
    <circle cx="${+x+7}" cy="37" r="3" fill="${c}" opacity=".55"/>
    <circle cx="${+x+14}" cy="37" r="3" fill="${c}" opacity=".55"/>`).join("")}
</svg>`;

/* Anlatım perdesi 2: tahtada soru ve işleyen süre */
CIZ.tahta = `<svg viewBox="0 0 300 190" class="cd-anl-ciz" aria-hidden="true">
  <rect x="18" y="12" width="264" height="140" rx="10" fill="#1F3864"/>
  <rect x="26" y="20" width="248" height="124" rx="7" fill="#2A4A7C"/>
  <rect x="120" y="152" width="60" height="9" rx="3" fill="#B7854A"/>
  <rect x="96" y="161" width="108" height="7" rx="3.5" fill="#8C6239"/>
  <rect x="52" y="38" width="196" height="13" rx="6.5" fill="#7FC7B6" opacity=".9"/>
  <rect x="78" y="58" width="144" height="9" rx="4.5" fill="#5A7EB5"/>
  ${[0,1].map(i => [0,1].map(j => `
    <rect x="${58 + j*98}" y="${84 + i*26}" width="86" height="18" rx="6"
          fill="#3A5C93" stroke="#5A7EB5" stroke-width="1.6"/>`).join("")).join("")}
  <g class="cd-anl-sure">
    <rect x="52" y="128" width="196" height="7" rx="3.5" fill="#16304F"/>
    <rect class="cd-anl-sure-dolgu" x="52" y="128" width="196" height="7" rx="3.5" fill="#EF5350"/>
  </g>
</svg>`;

/* Anlatım perdesi 4: puan satırı */
CIZ.puanSatir = `<svg viewBox="0 0 300 120" class="cd-anl-ciz" aria-hidden="true">
  ${[["#16A085",8],["#42A5F5",44],["#EF5350",80]].map(([c,y],i) => `
    <g class="cd-anl-pn" style="--gec:${i*0.28}s">
      <rect x="14" y="${y}" width="272" height="28" rx="9" fill="#fff"
            stroke="#E4EBF2" stroke-width="2"/>
      <rect x="14" y="${y}" width="6" height="28" rx="3" fill="${c}"/>
      <circle cx="36" cy="${+y+14}" r="8" fill="${c}"/>
      <rect x="52" y="${+y+9}" width="88" height="10" rx="5" fill="#DCE6F3"/>
      <g class="cd-anl-tik">
        <circle cx="248" cy="${+y+14}" r="11" fill="#16A085"/>
        <path d="M243 ${+y+14} l3.6 3.6 7-7.6" stroke="#fff" stroke-width="2.6"
              fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
    </g>`).join("")}
</svg>`;

CIZ.kupa = `<svg viewBox="0 0 140 110" class="cdw-cizim" aria-hidden="true">
  <ellipse cx="70" cy="101" rx="40" ry="6" fill="#E8EEF6"/>
  <rect x="50" y="90" width="40" height="9" rx="3" fill="#B7791F"/>
  <rect x="60" y="78" width="20" height="14" rx="3" fill="#D69E2E"/>
  <path d="M44 20 h52 v22 a26 26 0 0 1 -52 0 Z" fill="#F6C445"/>
  <path d="M44 20 h52 v8 h-52 Z" fill="#FFE08A"/>
  <path d="M44 26 h-12 a12 12 0 0 0 12 20" fill="none" stroke="#D69E2E" stroke-width="5" stroke-linecap="round"/>
  <path d="M96 26 h12 a12 12 0 0 1 -12 20" fill="none" stroke="#D69E2E" stroke-width="5" stroke-linecap="round"/>
  <rect x="64" y="64" width="12" height="16" fill="#D69E2E"/>
  <path d="M70 30 l3.4 6.9 7.6 1.1 -5.5 5.4 1.3 7.6 -6.8 -3.6 -6.8 3.6 1.3 -7.6 -5.5 -5.4 7.6 -1.1 Z" fill="#fff" opacity=".9"/>
  <path d="M22 92 l6 -10 6 10 Z" fill="#CBD5E1"/><path d="M106 92 l6 -10 6 10 Z" fill="#CBD5E1"/>
</svg>`;

CIZ.modCanli = `<svg viewBox="0 0 170 100" class="cdw-mod-ciz" aria-hidden="true">
  <ellipse cx="85" cy="93" rx="44" ry="5" fill="#E8EEF6"/>
  <rect x="63" y="12" width="44" height="74" rx="8" fill="#fff" stroke="#C7D3E0" stroke-width="2.6"/>
  <rect x="68" y="21" width="34" height="50" rx="3" fill="#F7FAFD"/>
  <g fill="#1F3864">
    <path d="M72 26 h9 v9 h-9 Z" fill="none" stroke="#1F3864" stroke-width="2.2"/>
    <rect x="75.5" y="29.5" width="2.4" height="2.4"/>
    <path d="M89 26 h9 v9 h-9 Z" fill="none" stroke="#1F3864" stroke-width="2.2"/>
    <rect x="92.5" y="29.5" width="2.4" height="2.4"/>
    <path d="M72 44 h9 v9 h-9 Z" fill="none" stroke="#1F3864" stroke-width="2.2"/>
    <rect x="75.5" y="47.5" width="2.4" height="2.4"/>
    <rect x="89" y="44" width="3.2" height="3.2"/><rect x="95" y="44" width="3.2" height="3.2"/>
    <rect x="89" y="50" width="3.2" height="3.2"/><rect x="95" y="56" width="3.2" height="3.2"/>
    <rect x="83" y="56" width="3.2" height="3.2"/><rect x="89" y="62" width="3.2" height="3.2"/>
    <rect x="73" y="58" width="3.2" height="3.2"/><rect x="79" y="63" width="3.2" height="3.2"/>
  </g>
  <rect x="76" y="75" width="18" height="3" rx="1.5" fill="#DCE6F0"/>
  <g stroke="#16A085" fill="none" stroke-linecap="round">
    <path d="M46 36 q-9 14 0 28" stroke-width="3"/><path d="M34 27 q-14 23 0 46" stroke-width="3" opacity=".55"/>
    <path d="M124 36 q9 14 0 28" stroke-width="3"/><path d="M136 27 q14 23 0 46" stroke-width="3" opacity=".55"/>
  </g>
</svg>`;

CIZ.modCevrimdisi = `<svg viewBox="0 0 170 100" class="cdw-mod-ciz" aria-hidden="true">
  <ellipse cx="85" cy="92" rx="50" ry="5" fill="#E8EEF6"/>
  <!-- tahta -->
  <rect x="50" y="10" width="70" height="34" rx="4" fill="#2E7D6B" stroke="#1E5A4C" stroke-width="2.4"/>
  <path d="M59 21 h30 M59 28 h42 M59 35 h22" stroke="#BFE8DD" stroke-width="2.6" stroke-linecap="round"/>
  <!-- öğrenciler -->
  <g>
    <path d="M55 87 v-12 a7.5 7.5 0 0 1 15 0 v12 Z" fill="#F39C12"/>
    <circle cx="62.5" cy="67" r="6.5" fill="#F7D2B0"/>
    <path d="M77 87 v-12 a7.5 7.5 0 0 1 15 0 v12 Z" fill="#42A5F5"/>
    <circle cx="84.5" cy="67" r="6.5" fill="#EFC49A"/>
    <path d="M99 87 v-12 a7.5 7.5 0 0 1 15 0 v12 Z" fill="#EF5350"/>
    <circle cx="106.5" cy="67" r="6.5" fill="#FADFC4"/>
  </g>
  <!-- kâğıt -->
  <g transform="translate(8 50)">
    <rect x="0" y="0" width="28" height="38" rx="3" fill="#fff" stroke="#C7D3E0" stroke-width="2.2"/>
    <path d="M7 10 h14 M7 18 h14 M7 26 h9" stroke="#DCE6F0" stroke-width="2.6" stroke-linecap="round"/>
  </g>
  <!-- internet yok -->
  <g transform="translate(134 12)">
    <g stroke="#C3CEDA" fill="none" stroke-linecap="round" stroke-width="2.6">
      <path d="M1 13 q11 -12 22 0"/><path d="M6 20 q6 -6.5 12 0"/>
    </g>
    <circle cx="12" cy="26" r="2.8" fill="#C3CEDA"/>
    <path d="M-1 31 L25 3" stroke="#EF5350" stroke-width="3.4" stroke-linecap="round"/>
  </g>
</svg>`;

/* Büyük mod kartları kaldırıldı: mod seçimi 1. sayfadaki anahtarda. */

/* ---------- küçük mod anahtarı (üst çubuk) ---------- */
/* Anahtarın içindeki küçük canlı çizimler. Amaç iki şeyi tek bakışta
   anlatmak: canlıda karekodla girilir ve internet gerekir; çevrimdışında
   kâğıt–tahta yeter, internet gerekmez (üstü çizili wifi).
   Renkler currentColor'dan gelir; seçili olan hareket eder. */
CIZ.swCevrimdisi = `<svg viewBox="0 0 45 32" class="cdw-sw-ciz" aria-hidden="true">
  <!-- defter: kâğıt ve tahta yeter -->
  <rect x="2" y="5" width="17" height="22" rx="2.4" fill="#E9FBF4"/>
  <rect x="2" y="5" width="17" height="22" rx="2.4" fill="none" stroke="#16A085" stroke-width="2"/>
  <path d="M6.5 5 v22" stroke="#16A085" stroke-width="1.6" opacity=".45"/>
  <g stroke="#0E8C74" stroke-width="2" stroke-linecap="round" opacity=".8">
    <path d="M9 11 h7"/><path d="M9 16 h7"/><path d="M9 21 h4"/>
  </g>
  <!-- internet gerekmez: üstü çizili wifi -->
  <g class="sw-wifi kapali" fill="none" stroke="#94A6B8" stroke-linecap="round">
    <path class="sw-a3" d="M28 15.5 a10 10 0 0 1 14 0" stroke-width="2"/>
    <path class="sw-a2" d="M31 19 a6 6 0 0 1 8 0" stroke-width="2"/>
  </g>
  <circle class="sw-nokta" cx="35" cy="23.5" r="2" fill="#94A6B8"/>
  <path class="sw-cizik" d="M28.5 27 L41.5 12" stroke="#EF5350" stroke-width="2.8"
        stroke-linecap="round" fill="none"/>
</svg>`;
CIZ.swCanli = `<svg viewBox="0 0 45 32" class="cdw-sw-ciz" aria-hidden="true">
  <!-- karekod: telefonla okutup girilir -->
  <rect x="2" y="6" width="20" height="20" rx="2.6" fill="#EEF2FF"/>
  <rect x="2" y="6" width="20" height="20" rx="2.6" fill="none" stroke="#4C5FD5" stroke-width="2"/>
  <g fill="none" stroke="#4C5FD5" stroke-width="1.9">
    <rect x="5" y="9" width="5" height="5" rx="1"/>
    <rect x="14" y="9" width="5" height="5" rx="1"/>
    <rect x="5" y="18" width="5" height="5" rx="1"/>
  </g>
  <g fill="#4C5FD5" opacity=".9">
    <rect x="14" y="18" width="2.2" height="2.2" rx=".6"/>
    <rect x="16.8" y="20.8" width="2.2" height="2.2" rx=".6"/>
    <rect x="14" y="21.6" width="1.6" height="1.6" rx=".5"/>
  </g>
  <!-- tarama ışını -->
  <path class="sw-tara" d="M3.5 16 h17" stroke="#EF5350" stroke-width="2.2"
        stroke-linecap="round" opacity=".9"/>
  <!-- internet gerekir: yayılan wifi -->
  <g class="sw-wifi acik" fill="none" stroke="#16A085" stroke-linecap="round">
    <path class="sw-a3" d="M30 15.5 a10 10 0 0 1 14 0" stroke-width="2.2"/>
    <path class="sw-a2" d="M33 19 a6 6 0 0 1 8 0" stroke-width="2.2"/>
  </g>
  <circle class="sw-nokta" cx="37" cy="23.5" r="2.1" fill="#16A085"/>
</svg>`;

function switchHtml(aktif, pasif){
  const yol = [["cevrimdisi","Çevrimdışı","Kâğıt ve tahta", CIZ.swCevrimdisi],
               ["canli","Canlı","Telefonla katılım", CIZ.swCanli]];
  const ipucu = pasif ? "Mod 1. adımda seçilir" : "";
  return `<div class="cdw-switch${pasif?" pasif":""}" role="group" aria-label="Yarışma modu"
       title="${ipucu}">
    ${yol.map(([v, ad, not, ciz]) => `<button type="button" class="cdw-sw${aktif===v?" ac":""}"
        ${pasif ? "disabled" : `onclick="COFF.modDegis('${v}')"`}
        aria-pressed="${aktif===v}" title="${pasif ? ipucu : not}">
        ${ciz}<span class="cdw-sw-ad">${ad}</span></button>`).join("")}
  </div>`;
}

/* Canlı ana sayfanın başlığına da aynı anahtarı koyuyoruz ki oradan da
   çevrimdışına geçilebilsin. Bir kez eklenir, sonra sınıfı güncellenir. */
function switchTazele(aktif){
  const sag = document.querySelector("#ekranAnasayfa .biy-header-sag");
  if (sag){
    let k = sag.querySelector(".cdw-switch-yuva");
    if (!k){
      k = document.createElement("span");
      k.className = "cdw-switch-yuva";
      sag.insertBefore(k, sag.firstChild);
    }
    k.innerHTML = switchHtml(aktif);
  }
}

/* ---------- adım adım kurulum (slayt) ---------- */
/* Kurulum tek sayfa: iki mod da aynı adımlardan geçer. Yalnız "Sınıf listesi"
   çevrimdışına özeldir — canlıda öğrenciler karekodla kendileri katılır. */
/* Çevrimdışında "kimler yarışacak" ve listeyi kurma tek adımda: biçim
   seçilir seçilmez altında o biçmin listesi açılır, çıktı da orada. */
const ADIM_CD    = [["ders","Ders ve sorular"], ["bicim","Takımlar ve çıktı"],
                    ["bas","Başlat"]];
/* Canlıda son adım kurulum ekranının dışında yaşıyor: 3 karekod lobisi.
   Ayrı bir "Başlat" sayfası yok — 2. adımdaki İleri soruları hazırlayıp
   doğrudan karekodu açıyor. Yarışma başlayınca hiçbir şerit görünmez. */
const ADIM_CANLI = [["ders","Ders ve sorular"], ["bicim","Kimler yarışacak?"],
                    ["karekod","Karekod"]];
function adimlar(){
  if (D.mod === "canli") return ADIM_CANLI;
  const ad = D.bicim === "sinif" ? "Sınıflar ve çıktı" : "Takımlar ve çıktı";
  return ADIM_CD.map(a => a[0] === "bicim" ? ["bicim", ad] : a);
}
/* Kurulumda eksik kalan ne varsa listeler. Sekmeler arasında serbestçe
   gezilebilir; ama bu liste boşalmadan yarışma başlatılamaz. */
function eksikler(){
  const e = [];
  if (!D.konuId) e.push({ ad: "ders", yazi: "Ders seçilmedi", git: "ders" });
  else if (!seciliSorular().length)
    e.push({ ad: "ders", yazi: "Seçtiğin süzgeçlerde soru kalmadı", git: "ders" });
  else {
    /* Sorular elle seçilmeden yarışma başlamaz: soru sayısı süzgecindeki
       sayı kadar soru havuzdan işaretlenmiş olmalı. */
    const s = havuzSecili(), h = Math.min(hedefSoru(), seciliSorular().length);
    if (s < h)
      e.push({ ad: "ders", git: "ders",
               yazi: s ? "Havuzdan " + h + " soru seçmelisin — şu an " + s + " seçili"
                       : "Havuzdan " + h + " soru seç" });
  }
  if (D.mod === "cevrimdisi"){
    if (D.bicim === "sinif" && !sinifAdlari().length)
      e.push({ ad: "bicim", yazi: "Yarışan sınıf yazılmadı", git: "bicim" });
    else if (!D.katilim.length)
      e.push({ ad: "bicim", yazi: "Takım/sınıf listesi boş", git: "bicim" });
  }
  return e;
}
/* Soru seti yalnız seçimler değiştiğinde yeniden kurulur; sekmeler arasında
   dolaşmak hazır soruları ve puanları silmez. */
function turImza(){
  const b = D.bicimSecim || {}, z = (typeof state !== "undefined" && state.zorlukSecim) || {};
  return [D.konuId || "", D.soruSayisi,
          ["test","surukle","eslestir","yazma"].map(k => b[k] ? 1 : 0).join(""),
          [1,2,3].map(k => z[k] === false ? 0 : 1).join(""),
          (typeof state !== "undefined" && state.secilenSet ? state.secilenSet.size : 0)
         ].join("|");
}
function turGerekli(){ return !D.sorular.length || D.turImza !== turImza(); }
/* Sekmeler serbest gezilebildiği için ✓ "geçildi" değil "tamam" demek. */
function odaVar(){
  try { return !!(typeof state !== "undefined" && state.odaId); } catch(e){ return false; }
}
function oyunAkiyor(){
  try { return !!(typeof state !== "undefined" && state.oda &&
                  (state.oda.durum === "oyun" || state.oda.durum === "beraberlik" ||
                   state.oda.durum === "bitti")); } catch(e){ return false; }
}
function adimTamam(k){
  if (k === "karekod")  return odaVar();
  const e = eksikler();
  if (k === "bas") return !e.length && D.sorular.length > 0;
  return !e.some(x => x.ad === k);
}

function adimAnahtar(){ const y = adimlar(); const a = y[D.adim - 1]; return a ? a[0] : y[0][0]; }
/* Bir sonraki adımın anahtarı — "Başlat"a geçerken soruları hazırlamak için. */
function sonrakiAnahtar(){ const a = adimlar()[D.adim]; return a ? a[0] : ""; }
function adimNo(anahtar){
  const i = adimlar().findIndex(a => a[0] === anahtar);
  return i >= 0 ? i + 1 : 1;
}

/* Sekme şeridi: kurulum ekranında da, canlının karekod/yarışma
   ekranlarında da aynı işaretler görünsün diye tek yerden üretiliyor. */
function yolSeridi(){
  return `<ol class="cdw-yol">
    ${adimlar().map(([k, a], i) => {
      const n = i + 1;
      const tamam = adimTamam(k);
      const simdi = (n === D.adim);
      const durum = (simdi ? "simdi " : "") + (tamam ? "bitti" : (n < D.adim ? "eksik" : ""));
      return `<li class="${durum.trim()}">
        <button type="button" class="cdw-yol-tus"
                title="${kacisi(a)}${tamam ? "" : " — eksik"}" onclick="COFF.adimGit(${n})">
          <span class="cdw-yol-no">${tamam && !simdi ? "✓" : n}</span>
          <span class="cdw-yol-ad">${a}</span>
        </button></li>`;
    }).join("")}
  </ol>`;
}

/* Hangi canlı ekranı açık: karekod lobisi mi, yansıtılan yarışma mı? */
function canliEkran(){
  if (D.mod !== "canli") return "";
  const ac = id => { const e = el(id); return e && !e.classList.contains("gizli"); };
  /* Yarışma başlayınca tahtada yalnız soru olsun: şerit de başlık da yok. */
  if (ac("ekranOyunAdmin")) return "";
  if (ac("ekranTakimlar"))  return "karekod";
  return "";
}
/* Şerit gövdeye asılı duruyor: yarışma ekranının içeriği her anlık
   görüntüde baştan çiziliyor, içine koyulan bir düğüm silinirdi. */
function canliYolCiz(){
  const yer = canliEkran();
  let s = el("cdYolCanli");
  /* Not: "cd-yol-canli" adı mod kapısındaki karta ait, çakışmasın. */
  document.body.classList.toggle("cd-serit-acik", !!yer);
  if (!yer){ if (s) s.remove(); return; }
  D.adim = adimNo(yer);
  if (!s){
    s = document.createElement("div");
    s.id = "cdYolCanli";
    s.className = "cdw-yol-serit";
    document.body.appendChild(s);
  }
  s.innerHTML = `<button type="button" class="cdw-geri-tus" onclick="COFF.yolGeri()"
      title="Bir önceki adım" aria-label="Geri">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
      </svg></button>` + yolSeridi();
  /* Üstteki boşluk şeridin gerçek yüksekliği kadar olsun. */
  requestAnimationFrame(() => document.body.style.setProperty(
    "--cd-serit-h", s.offsetHeight + "px"));
}
/* Ekran değişimini yakala: .gizli sınıfı gidip gelince şeridi tazele. */
let yolGozcu = null;
function canliYolGozle(){
  if (yolGozcu) return;
  yolGozcu = new MutationObserver(() => canliYolCiz());
  ["ekranTakimlar", "ekranOyunAdmin", "ekranCevrimdisi"].forEach(id => {
    const e = el(id); if (e) yolGozcu.observe(e, { attributes: true, attributeFilter: ["class"] });
  });
}

function kurulumHtml(){
  const yol = adimlar();
  /* Canlıda 3-4 kurulum dışında; alt satır yalnız "Başlat" adımında biter. */
  const son = adimAnahtar() === "bas";
  return `
  <div class="cdw" dir="ltr">
    <div class="cdw-ust">
      <button type="button" class="cdw-geri-tus" onclick="COFF.geriCik()"
              title="${D.adim > 1 ? (D.adim - 1) + ". adıma dön" : "Oyunlara dön"}" aria-label="Geri">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
        </svg>
      </button>
      ${yolSeridi()}
    </div>

    <div class="cdw-govde cdw-govde-${adimAnahtar()}">${adimHtml()}</div>

    <div class="cdw-alt">
      <span class="cdw-adim-not">${D.adim}. adım / ${yol.length}</span>
      <span class="cdw-uyari" id="cdUyari"></span>
      <span class="cdw-bosluk"></span>
      ${son
        ? (adimTamam("bas")
            ? `<span class="cdw-bitti-not">Her şey hazır 🎉</span>`
            : `<span class="cdw-bitti-not eksik">${eksikler().length} eksik var</span>`)
        : `<button type="button" class="cdw-tus cdw-tus-ana" onclick="COFF.adimIleri()">
             ${sonrakiAnahtar() === "bas" ? "Soruları hazırla ›"
               : sonrakiAnahtar() === "karekod" ? "Soruları hazırla ve karekodu aç ›"
               : "İleri ›"}</button>`}
    </div>
  </div>`;
}

function adimHtml(){
  const k = adimAnahtar();
  if (k === "bicim") return adim1();
  if (k === "ders")  return adim3();
  return D.mod === "canli" ? adimCanliBas() : adim5();
}

/* --- 1 · yarışma biçimi ---
   Canlı taraftaki üç kartın ta kendisi: aynı çizimler, aynı Arapça adlar.
   Artık iki modda da bu ekran geliyor; tıklayınca yalnız seçim yapılır. */
const menuKartlar = () => {
/* Çevrimdışında bireysel yarış hiç kullanılmıyor (her öğrenciye tek tek
   puan vermek zor): kartı soluk göstermek yerine hiç çıkarmıyoruz. */
const hepsi = [
  `<button class="biy-menu-kart${D.bicim==='sinif'?' cdw-secili':''}" onclick="COFF.bicimSec('sinif')">
        <span class="biy-menu-emoji biy-anim" aria-hidden="true">
          <svg viewBox="0 0 64 64" class="biy-svg biy-svg-okul">
            <circle class="biy-hale" cx="32" cy="32" r="26" fill="url(#biyGrTuruncu)" opacity=".14"/>
            <path d="M12 30 32 16l20 14v20H12z" fill="url(#biyGrTuruncu)" opacity=".85"/>
            <rect class="biy-ok-kapi" x="27" y="38" width="10" height="12" rx="1.5" fill="#fff" opacity=".9"/>
            <g class="biy-ok-cam">
              <rect x="17" y="34" width="7" height="7" rx="1.5" fill="#fff" opacity=".85"/>
              <rect x="40" y="34" width="7" height="7" rx="1.5" fill="#fff" opacity=".85"/>
            </g>
            <g class="biy-ok-bayrak">
              <line x1="32" y1="16" x2="32" y2="6" stroke="url(#biyGrMor)" stroke-width="2.6" stroke-linecap="round"/>
              <path d="M32 7h10l-3 3.5 3 3.5H32z" fill="url(#biyGrMor)"/>
            </g>
          </svg>
        </span>
        <span class="biy-menu-ad">Sınıfça Yarış</span>
        <span class="biy-menu-ar">نِظام الصُّفوف</span>
        <span class="biy-menu-desc">Her sınıfa bir karekod · sınıflar yarışır</span>
        <span class="cdw-menu-tik">✓</span>
      </button>`,
  `<button class="biy-menu-kart${D.bicim==='takim'?' cdw-secili':''}" onclick="COFF.bicimSec('takim')">
        <span class="biy-menu-emoji biy-anim" aria-hidden="true">
          <svg viewBox="0 0 64 64" class="biy-svg biy-svg-takim">
            <circle class="biy-hale" cx="32" cy="32" r="26" fill="url(#biyGrMor)" opacity=".14"/>
            <g class="biy-tk-a">
              <circle cx="20" cy="26" r="7" fill="url(#biyGrMor)"/>
              <path d="M8 48c0-7 5.5-11 12-11s12 4 12 11z" fill="url(#biyGrMor)" opacity=".75"/>
            </g>
            <g class="biy-tk-b">
              <circle cx="44" cy="26" r="7" fill="url(#biyGrMavi)"/>
              <path d="M32 48c0-7 5.5-11 12-11s12 4 12 11z" fill="url(#biyGrMavi)" opacity=".75"/>
            </g>
            <path class="biy-tk-bag" d="M24 20 Q32 12 40 20" fill="none" stroke="url(#biyGrTuruncu)" stroke-width="3" stroke-linecap="round"/>
          </svg>
        </span>
        <span class="biy-menu-ad">Takım Olarak Yarış</span>
        <span class="biy-menu-ar">نِظام الفِرَق</span>
        <span class="biy-menu-desc">Her takıma bir karekod · takımlar yarışır</span>
        <span class="cdw-menu-tik">✓</span>
      </button>`,
  `<button class="biy-menu-kart${D.bicim==='kisi'?' cdw-secili':''}${
        D.mod === "cevrimdisi" ? " cdw-kart-pasif" : ""}"
        ${D.mod === "cevrimdisi" ? 'disabled title="Bireysel Yarış yalnız çevrimiçi yarışmada kullanılır"' : ""}
        onclick="COFF.bicimSec('kisi')">
        <span class="biy-menu-emoji biy-anim" aria-hidden="true">
          <svg viewBox="0 0 64 64" class="biy-svg biy-svg-birey">
            <circle class="biy-hale" cx="32" cy="32" r="26" fill="url(#biyGrYesil)" opacity=".14"/>
            <g class="biy-br-govde">
              <circle cx="32" cy="24" r="8" fill="url(#biyGrYesil)"/>
              <path d="M17 50c0-8 6.7-13 15-13s15 5 15 13z" fill="url(#biyGrYesil)" opacity=".75"/>
            </g>
            <g class="biy-br-el">
              <rect x="44" y="14" width="5" height="15" rx="2.5" fill="url(#biyGrTuruncu)"/>
            </g>
            <circle class="biy-br-nokta" cx="46.5" cy="9" r="3.2" fill="url(#biyGrTuruncu)"/>
          </svg>
        </span>
        <span class="biy-menu-ad">Bireysel Yarış</span>
        <span class="biy-menu-ar">نِظام الأَفْراد</span>
        <span class="biy-menu-desc">${D.mod === "cevrimdisi"
          ? "Yalnız çevrimiçi · puanı sistem işler"
          : "Tek karekod · herkes kendi adıyla girer"}</span>
        ${D.mod === "cevrimdisi"
          ? `<span class="cdw-menu-kilit">Çevrimiçine geç</span>` : `<span class="cdw-menu-tik">✓</span>`}
      </button>`
];
  return (D.mod === "cevrimdisi") ? hepsi.slice(0, 2) : hepsi;
};

function adim1(){
  /* Canlıda yalnız biçim seçilir; çevrimdışında hemen altında listenin
     kendisi ve çıktı bölümü açılır — çıktı takımlara göre hazırlanır. */
  const cd = D.mod === "cevrimdisi";
  return `
  <div class="cdw-sahne cdw-genis${cd ? " cdw-birlesik" : ""}${
      cd && D.katilim.length ? " liste-hazir" : ""}">
    <h2 class="cdw-bas cdw-bas-ince">Kimler yarışacak?</h2>
    ${cd ? "" : `<p class="cdw-alt-bas cdw-alt-ar">نِظام المُسابَقَة</p>`}
    <div class="biy-menu cdw-menu" dir="rtl">
      ${menuKartlar().join("")}
    </div>
    ${cd ? `<div class="cdw-liste-govde">${listeGovdesi()}</div>
            <div id="cdCiktiYuva">${ciktiHtml()}</div>` : ""}
  </div>`;
}

/* --- birleşik adımın alt yarısı: takım / sınıf listesi --- */
function listeGovdesi(){
  const takimMi = D.bicim === "takim";
  const sinifMi = D.bicim === "sinif";
  const yokSay = String(D.yok || "").split(/[^0-9]+/).filter(Boolean).length;
  const toplam = Math.max(0, Math.max(D.bas, D.son) - Math.max(1, D.bas) + 1) - yokSay;
  const kacSinif = sinifAdlari().length;
  return `
  <div class="cdw-liste-bolum">
    <h3 class="cdw-bolum-bas">${sinifMi ? "Yarışan sınıflar" : "Takımları kuralım"}</h3>
    <p class="cdw-bolum-alt">${sinifMi
      ? "Hangi sınıflar yarışacak? Adını yaz, ekle; istemediğini ✕ ile çıkar."
      : "Sınıfın sıra numaralarını yaz, <b>bugün gelmeyenleri çıkar</b>; kalan numaralar takımlara dağılsın."}</p>
    ${sinifMi ? "" : `
    <ol class="cdw-liste-adim">
      <li>
        ${CIZ.adimNo}
        <b>Sıra numaraları</b>
        <small>Kaçtan kaça? Örnek: <i>1 → 24</i></small>
      </li>
      <li class="cdw-la-vurgu">
        ${CIZ.adimYok}
        <b>Gelmeyenleri çıkar</b>
        <small>Bugün olmayanların numarasını yaz — takımlara girmezler.</small>
      </li>
      <li>
        ${CIZ.adimTakim}
        <b>Takımlar hazır</b>
        <small>Numaralar eşit dağılır; sürükleyerek değiştirebilirsin.</small>
      </li>
    </ol>`}

    <div class="cdw-serit">
      ${sinifMi ? `
      <div class="cdw-serit-alan buyur">
        <label>Sınıf adı ekle</label>
        <input type="text" class="gen" id="cdSinifAd" value="" maxlength="24"
               placeholder="örnek: 7-A"
               onkeydown="if(event.key==='Enter'){event.preventDefault();COFF.sinifEkle();}">
      </div>
      <div class="cdw-serit-alan">
        <label>&nbsp;</label>
        <button type="button" class="cdw-tus cdw-tus-ana" onclick="COFF.sinifEkle()">
          + Sınıf ekle</button>
      </div>` : `
      <div class="cdw-serit-alan">
        <label>Sıra numaraları</label>
        <div class="cdw-ikili">
          <input type="number" id="cdBas" value="${D.bas}" min="1" onchange="COFF.ayar('bas',this.value)">
          <span class="cdw-ok">→</span>
          <input type="number" id="cdSon" value="${D.son}" min="1" onchange="COFF.ayar('son',this.value)">
        </div>
      </div>
      <div class="cdw-serit-alan buyur">
        <label>Bugün gelmeyenler <i>(boş bırakabilirsin)</i></label>
        <input type="text" class="gen" id="cdYok" value="${kacisi(D.yok)}" placeholder="örnek: 3, 7, 15"
               onchange="COFF.ayar('yok',this.value)">
      </div>`}
      ${takimMi ? `
      <div class="cdw-serit-alan">
        <label>Kaç takım</label>
        <div class="cdw-sayac-kutu ufak">
          <button type="button" class="cdw-yuvarlak" onclick="COFF.takimDegis(-1)"
                  ${D.takimSayi <= 2 ? "disabled" : ""}>−</button>
          <b id="cdTkmDeger">${Math.min(D.takimSayi, enFazlaTakim())}</b>
          <button type="button" class="cdw-yuvarlak" onclick="COFF.takimDegis(1)"
                  ${D.takimSayi >= enFazlaTakim() ? "disabled" : ""}>+</button>
        </div>
      </div>` : ""}
      ${sinifMi ? "" : `
      <div class="cdw-serit-alan">
        <label>&nbsp;</label>
        <button type="button" class="cdw-tus cdw-tus-ana" onclick="COFF.listeKur()">
          Listeyi kur</button>
      </div>`}
      ${sinifMi ? "" : `
      <div class="cdw-serit-say">
        <b>${toplam > 0 ? toplam : 0}</b><span>öğrenci</span>
      </div>`}
    </div>

    <div class="cdw-kat" id="cdKat">${katHtml()}</div>
  </div>`;
}

/* --- 3 · ders, soru sayısı, süre ve soru türleri: hepsi tek ekranda --- */
/* Cevap kâğıdının adı yarışma biçimine göre değişir. */
function kagitAdi(){
  return D.bicim === "kisi" ? "Kişi cevap kâğıdı"
       : D.bicim === "sinif" ? "Sınıf cevap kâğıdı" : "Takım yarışma kâğıdı";
}

/* Çıktı bölümü: süzgeç değişince tek başına tazelenebilsin diye ayrı. */
function ciktiHtml(){
  const havuz  = seciliSorular().length;
  const secili = (typeof state !== "undefined" && state.secilenSet) ? state.secilenSet.size : 0;
  /* Çıktı ancak havuzdan hedef sayıda soru işaretlendikten sonra açılır. */
  const hedef = Math.min(hedefSoru(), havuz);
  /* Cevap kâğıdı takımlara/sınıflara göre basıldığı için liste de hazır
     olmalı; soru tarafı ile katılımcı tarafı birlikte tamamlanır. */
  const listeEksik = eksikler().find(x => x.ad === "bicim");
  const cikabilir = !!D.konuId && havuz > 0 && secili >= hedef && !listeEksik;
  return `
    <div class="cdw-cikti${cikabilir ? "" : " kapali"}">
      <span class="cdw-cikti-bas">Kâğıda dökmek istersen</span>
      ${cikabilir ? "" : `<span class="cdw-cikti-not">
        ${!D.konuId || havuz === 0
          ? `Önce bir ders seç, sonra havuzdan soruları işaretle.`
          : secili < hedef
            ? `Havuzdan <b>${hedef}</b> soru işaretle${secili ? ` — şu an <b>${secili}</b> seçili` : ""}.`
            : kacisi(listeEksik ? listeEksik.yazi + " — cevap kâğıdı listeye göre basılır." : "")}
        ${(!D.konuId || havuz === 0 || secili < hedef)
          ? `<button type="button" class="cdw-cikti-git" ${D.konuId && havuz > 0 ? "" : "disabled"}
                     onclick="COFF.havuzAc()">Soruları seç ›</button>`
          : ""}
      </span>`}
      <div class="cdw-cikti-tuslar">
        <button type="button" class="cdw-cikti-tus" ${cikabilir ? "" : "disabled"}
                onclick="COFF.pdf('kitapcik')" title="Seçtiğin soruları PDF olarak indir">
          ${CIZ.yazici}
          <span><b>Soru kitapçığı</b><small>Bütün sorular kâğıtta — klasik test gibi dağıt.</small></span>
          <i class="cdw-cikti-ok">⭳ PDF</i>
        </button>
        <button type="button" class="cdw-cikti-tus" ${cikabilir ? "" : "disabled"}
                onclick="COFF.pdf('kart')" title="Boş cevap kâğıdını PDF olarak indir">
          ${CIZ.kart}
          <span><b>${kacisi(kagitAdi())}</b><small>Boş cevap kâğıdı — öğrenciler buraya yazar.</small></span>
          <i class="cdw-cikti-ok">⭳ PDF</i>
        </button>
      </div>
      <span class="cdw-pdf-durum" id="cdPdfDurum1">${cikabilir
        ? kacisi(hedef + " soru kâğıda gidecek" + (secili > hedef
            ? " (havuzda " + secili + " seçili, ilk " + hedef + " kullanılır)." : "."))
        : ""}</span>
    </div>`;
}

function adim3(){
  return `
  <div class="cdw-sahne cdw-genis cdw-ust-hizali">
    <!-- Yarışma çevrimdışı mı canlı mı: kurulumun ilk kararı, en başta. -->
    <div class="cdw-mod-secim">${switchHtml(D.mod)}</div>
    <h2 class="cdw-bas">Hangi dersten soru gelsin?</h2>
    <div class="cdw-panel cdw-panel-ayar" id="cdPanelAyar"></div>
    <div class="cdw-panel" id="cdPanelSure"></div>
    <div class="cdw-panel" id="cdPanelDers"></div>
  </div>`;
}

/* --- 5 · başlat --- */
function adim5(){
  const kacKisi = D.katilim.length;
  const kimNot = D.bicim === "kisi" ? kacKisi + " öğrenci"
               : D.bicim === "sinif" ? (kacKisi > 1 ? kacKisi + " sınıf" : "bütün sınıf")
               : kacKisi + " takım";
  const ders = D.konuId ? dersTr(konuBul(D.konuId) || { id:"", ad:"" }) : "—";
  const eks = eksikler();
  const hazir = !eks.length && D.sorular.length > 0;
  const kilit = hazir ? "" : "disabled";
  return `
  <div class="cdw-sahne">
    <h2 class="cdw-bas">${hazir ? "Hazır! Şimdi ne yapmak istersin?" : "Bir adım kaldı"}</h2>
    ${eks.length ? `
    <div class="cdw-eksik" role="status">
      <span class="cdw-eksik-bas">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9"/><line x1="12" y1="7.5" x2="12" y2="13"/>
          <circle cx="12" cy="16.6" r="1.1" fill="currentColor" stroke="none"/>
        </svg>
        Yarışmayı başlatmak için önce şunlar gerekli:
      </span>
      <ul class="cdw-eksik-liste">
        ${eks.map(x => `<li><b>${kacisi(x.yazi)}</b>
          <button type="button" class="cdw-eksik-tus" onclick="COFF.adimGit(${adimNo(x.git)})">
            ${x.git === "ders" ? "Ders sekmesine git" : "Takım sekmesine git"} ›</button></li>`).join("")}
      </ul>
    </div>` : ""}
    <div class="cdw-ozet">
      <span><i>Kimler</i>${kacisi(kimNot)}</span>
      <span><i>Ders</i>${kacisi(ders)}</span>
      <span><i>Soru</i>${D.sorular.length} soru</span>
      <span><i>Süre</i>${sureOzet()}</span>
    </div>
    <div class="cdw-secim3 cdw-ikili cdw-is">
      <button type="button" class="cdw-kart cdw-is-kart" ${kilit}
              onclick="COFF.yansitBasla()">
        ${CIZ.perde}
        <b>Tahtaya yansıt</b>
        <small>Sorular tek tek büyük görünür, geri sayım çalışır, cevabı sen açarsın.</small>
        <span class="cdw-kagit-not">📓 Yazıcı gerekmez — her takım cevabını <i class="cdw-kn-vur">kendi defterine</i> yazar,
          kâğıt ve kalem hazır olsun.</span>
        <span class="cdw-is-tus">▶ Başlat</span>
        <span class="cdw-nasil" role="button" tabindex="0"
              onclick="event.stopPropagation();COFF.defterAc()"
              onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();COFF.defterAc();}"
        >Nasıl işler?</span>
      </button>
      <button type="button" class="cdw-kart cdw-is-kart" ${hazir && D.katilim.length > 1 ? "" : "disabled"}
              onclick="COFF.turnuvaAc()">
        ${CIZ.kupa}
        <b>Turnuva</b>
        <small>Eleme usulü: ikişerli eşleşme, kazanan üst tura. Yarı final, final, kupa.</small>
        <span class="cdw-is-tus">🏆 Şemayı kur</span>
      </button>
    </div>
    <div class="cdw-pdf-durum" id="cdPdfDurum"></div>
  </div>`;
}

/* Tahtaya yansıt açılınca gösterilen kısa akış anlatımı: dört perde,
   her biri kendi animasyonuyla. Bir kez görülünce tekrar açılmaz. */
function anlatimPerdeleri(){
  const kimNot = D.bicim === "kisi" ? "Her öğrenci kendi defterine yazar."
               : D.bicim === "sinif" ? "Her sınıf kendi arasında karar verir, sözcüsü söyler."
               : "Her takım tek bir deftere yazar, sözcü okur.";
  return [
    { bas: "Defter ve kalem hazır olsun",
      alt: "Herkes defterine 1'den " + D.sorular.length + "'e kadar numara yazsın. " + kimNot,
      ciz: CIZ.kaldiranlar, sinif: "p1" },
    { bas: "Soru tahtada, süre işliyor",
      alt: "Soru büyük görünür, geri sayım başlar. Cevabı kimse söylemez — herkes defterine yazar.",
      ciz: CIZ.tahta, sinif: "p2" },
    { bas: "Herkes cevabını defterine yazar",
      alt: "Süre boyunca yazarlar. Son 5 saniyede uyarı sesi gelir.",
      ciz: CIZ.yazanlar, sinif: "p3" },
    { bas: "Cevabı aç, puanı işle",
      alt: "Doğru cevap pankartta açılır. Sağdaki tabloda her takıma ✓ ya da ✗ verirsin; hepsi işaretlenmeden sonraki soruya geçilmez.",
      ciz: CIZ.puanSatir, sinif: "p4" }
  ];
}

function anlatimHtml(){
  const p = anlatimPerdeleri();
  const i = Math.max(0, Math.min(p.length - 1, D.anlAdim || 0));
  const s = p[i];
  return `
  <div class="cdw" dir="ltr">
    <div class="cdw-ust">
      <button type="button" class="cdw-geri-tus" onclick="COFF.basaDon()"
              title="Geri" aria-label="Geri">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
        </svg>
      </button>
      <ol class="cdw-yol"><li class="simdi"><button type="button" class="cdw-yol-tus" disabled>
        <span class="cdw-yol-no">▶</span><span class="cdw-yol-ad">Nasıl işler?</span></button></li></ol>
      <button type="button" class="cd-tus cd-tus-ufak" onclick="COFF.anlatimBitir()">Atla ›</button>
    </div>
    <div class="cdw-govde cdw-govde-anl">
      <div class="cdw-sahne cdw-genis">
        <div class="cd-anl ${s.sinif}" id="cdAnl">${s.ciz}</div>
        <h2 class="cdw-bas cd-anl-bas">${kacisi(s.bas)}</h2>
        <p class="cdw-alt-bas cd-anl-alt">${kacisi(s.alt)}</p>
        <div class="cd-anl-nokta">${p.map((_, j) =>
          `<button type="button" class="cd-anl-n${j === i ? " ac" : ""}${j < i ? " gecti" : ""}"
             onclick="COFF.anlatimGit(${j})" aria-label="${j + 1}. adım"></button>`).join("")}</div>
      </div>
    </div>
    <div class="cdw-alt">
      <span class="cdw-adim-not">${i + 1} / ${p.length}</span>
      <span class="cdw-bosluk"></span>
      ${i > 0 ? `<button type="button" class="cdw-tus" onclick="COFF.anlatimGit(${i - 1})">‹ Geri</button>` : ""}
      ${i < p.length - 1
        ? `<button type="button" class="cdw-tus cdw-tus-ana" onclick="COFF.anlatimGit(${i + 1})">İleri ›</button>`
        : `<button type="button" class="cdw-tus cdw-tus-ana" onclick="COFF.anlatimBitir()">▶ Yarışmayı başlat</button>`}
    </div>
  </div>`;
}

function defterHtml(){
  const kimNot = D.bicim === "kisi" ? "Her öğrenci kendi defterine yazar."
               : D.bicim === "sinif" ? (D.katilim.length > 1
                   ? "Her sınıf kendi arasında karar verir, sözcüsü söyler."
                   : "Sınıf birlikte karar verir, sözcü söyler.")
               : "Her takım tek bir deftere yazar, sözcü okur.";
  const adimlar = [
    ["Defterleri açtırın", "Herkes defterine 1'den " + D.sorular.length + "'e kadar numara yazsın. " + kimNot],
    ["Soruyu yansıtın", "Soru ekranda büyük görünür. Süreyi başlatın, herkes cevabını defterine yazsın."],
    ["Süre bitince cevabı açın", "Boşluk tuşuna basınca doğru cevap ekranda işaretlenir; herkes kendi defterini kontrol eder."],
    ["Puanı işleyin", "Sağdaki puan tablosunda + ve − tuşlarıyla puan verin. Tablo hep açık durur."]
  ];
  return `
  <div class="cdw" dir="ltr">
    <div class="cdw-ust">
      <button type="button" class="cdw-geri-tus" onclick="COFF.basaDon()"
              title="Geri" aria-label="Geri">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
        </svg>
      </button>
      <ol class="cdw-yol"><li class="simdi"><button type="button" class="cdw-yol-tus" disabled>
        <span class="cdw-yol-no">✎</span><span class="cdw-yol-ad">Tahtaya yansıt · nasıl işler?</span></button></li></ol>
      
    </div>
    <div class="cdw-govde"><div class="cdw-sahne">
      <h2 class="cdw-bas">Tahtaya yansıtma nasıl işler?</h2>
      <p class="cdw-alt-bas">Yazıcı gerekmez. Bu dört adımı sınıfa okuyup başlayabilirsin.</p>
      <div class="cdw-defter">
        <div class="cdw-defter-ciz">${CIZ.defter}</div>
        <ol class="cdw-adimlar">
          ${adimlar.map(([b, a]) => `<li><b>${kacisi(b)}</b><span>${kacisi(a)}</span></li>`).join("")}
        </ol>
      </div>
    </div></div>
    <div class="cdw-alt">
      <span class="cdw-adim-not">${D.sorular.length} soru · ${sureOzet()}</span>
      <span class="cdw-bosluk"></span>
      <button type="button" class="cdw-tus cdw-tus-ana" onclick="COFF.defterBasla()">
        ▶ Yarışmayı başlat</button>
    </div>
  </div>`;
}

/* --- son adım · canlı --- */
function adimCanliBas(){
  const kimNot = D.bicim === "kisi" ? "Her öğrenci kendi adıyla katılır"
               : D.bicim === "sinif" ? "Her sınıf kendi adıyla katılır"
               : "Her takım kendi karekodunu okutur";
  const ders = D.konuId ? dersTr(konuBul(D.konuId) || { id:"", ad:"" }) : "—";
  const odaVar = !!state.odaId;
  return `
  <div class="cdw-sahne">
    <h2 class="cdw-bas">Hazır! Karekodu açalım mı?</h2>
    <div class="cdw-ozet">
      <span><i>Kimler</i>${kacisi(kimNot)}</span>
      <span><i>Ders</i>${kacisi(ders)}</span>
      <span><i>Soru</i>${D.soruSayisi} soru</span>
    </div>
    <div class="cdw-secim3 cdw-tekli cdw-is">
      <button type="button" class="cdw-kart cdw-is-kart" onclick="COFF.canliBaslat()">
        ${CIZ.karekod}
        <b>${odaVar ? "Odaya geri dön" : "Karekodu aç"}</b>
        <small>${kacisi(D.bicim === "takim" ? "Takım adlarını yaz, her takıma bir karekod çıksın. Öğrenciler telefonlarıyla okutup katılır."
                      : D.bicim === "sinif" ? "Sınıf adlarını yaz, her sınıfa bir karekod çıksın. Öğrenciler telefonlarıyla okutup katılır."
                      : "Tek karekod ekranda durur; öğrenciler okutup adını yazar, sen onaylarsın.")}</small>
        <span class="cdw-is-tus">▶ ${odaVar ? "Devam et" : "Başlat"}</span>
      </button>
    </div>
    <p class="cdw-bilgi">İnternet gerekir. Öğrencilerin EBA'ya giriş yapmış olması gerekir.</p>
  </div>`;
}

function katHtml(){
  if (!D.katilim.length){
    return `<div class="cdw-kat-bos">${CIZ.liste}
      <p>${D.bicim === "sinif"
        ? `Henüz sınıf eklenmedi.<br>Yukarıya sınıf adını yazıp <b>“+ Sınıf ekle”</b> tuşuna bas.`
        : `Henüz liste kurulmadı.<br><b>“Listeyi kur”</b> tuşuna bas.`}</p></div>`;
  }
  if (D.bicim === "kisi"){
    return `<div class="cdw-nolar">` + D.katilim.map(k =>
      `<span class="cdw-no">${kacisi(k.ad)}</span>`).join("") + `</div>`;
  }
  if (D.bicim === "sinif"){
    return `<div class="cdw-takimlar cdw-siniflar">` + D.katilim.map((k, i) => `
      <div class="cdw-takim cdw-sinif-kart" style="--tr:${k.renk}">
        <div class="cdw-takim-bas">
          <span class="cdw-bayrak">${bayrakSvg(k.renk)}</span>
          <b>${kacisi(k.tr || k.ad)}</b>
          <button type="button" class="cdw-sinif-sil" onclick="COFF.sinifSil(${i})"
                  title="Bu sınıfı sil" aria-label="Sil">✕</button>
        </div>
      </div>`).join("") + `</div>`;
  }
  const el_ = D.tasinan;
  return `<div class="cdw-takimlar${el_ != null ? " tasima-var" : ""}">` + D.katilim.map(k => `
    <div class="cdw-takim" style="--tr:${k.renk}" data-tkm="${k.id}"
         ondragover="COFF._uzerinde(event,this)"
         ondragleave="this.classList.remove('hedef')"
         ondrop="COFF._birak(event,this,'${k.id}')"
         onclick="COFF.takimaTasi('${k.id}')">
      <div class="cdw-takim-bas">
        <span class="cdw-bayrak">${bayrakSvg(k.renk)}</span>
        <b>${kacisi(k.tr || k.ad)}</b>
        <span class="cdw-takim-say">${(k.uyeler || []).length}</span>
      </div>
      <div class="cdw-nolar">${(k.uyeler || []).map(n =>
        `<span class="cdw-no${el_ === n ? " tasiniyor" : ""}" style="--tr:${k.renk}"
               draggable="true" data-no="${n}"
               ondragstart="COFF._suruklBasla(event,${n})"
               ondragend="COFF._suruklBitir()"
               onclick="event.stopPropagation();COFF.noSec(${n})"
               title="Taşımak için dokun ya da sürükle">${n}</span>`).join("")}</div>
    </div>`).join("") + `</div>
    <p class="cdw-tasima-not">${el_ != null
      ? `<b>${el_}</b> numarayı taşıyorsun — bırakmak istediğin takıma dokun, yer değiştirmek için başka bir numaraya dokun. <button type="button" class="cdw-tasima-vaz" onclick="COFF.noSec(${el_})">Vazgeç</button>`
      : `Numaraları takımlar arasında <b>sürükleyip bırakabilir</b> ya da önce numaraya, sonra takıma dokunarak taşıyabilirsin. İki numaraya arka arkaya dokunursan yerleri değişir.`}</p>`;
}

function bayrakSvg(renk){
  return `<svg viewBox="0 0 26 30" aria-hidden="true">
    <path d="M4 29 V3" stroke="#8C97A3" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M5 3 h18 l-5 6 5 6 H5 Z" fill="${renk}"/></svg>`;
}

function sayacTazele(){
  const e = document.querySelector(".cdw-serit-say b");
  if (e) e.textContent = gecerliNolar().length;
}

function gecerliNolar(){
  const yok = new Set(String(D.yok || "").split(/[^0-9]+/).filter(Boolean).map(Number));
  const n = [];
  for (let i = Math.max(1, D.bas); i <= Math.max(D.bas, D.son); i++) if (!yok.has(i)) n.push(i);
  return n;
}

/* ---------- sunum ---------- */
/* Soru bitince üstte kalacak tek satırlık doğru cevap. */
function dogruMetin(s){
  const b = (s.bicim || "test");
  if (b === "test")     return (s.secenekler || [])[s.dogru] || "";
  if (b === "surukle")  return (s.parcalar || []).join(" ");
  if (b === "eslestir") return (s.ciftler || []).map(c => c[0] + " → " + c[1]).join("   ·   ");
  return s.cevapYazi || "";
}

/* Eşleştirme cevabı tek uzun satır olunca hem küçülüyor hem de bir çiftin
   iki kelimesi ayrı satırlara düşüyordu. Her çift kendi kutusunda, bölünmeden
   duruyor; böylece punto da büyük kalabiliyor. */
function ciftlerHtml(s, on){
  const c = s.ciftler || [];
  if (!c.length) return "";
  return `<span class="${on}-ciftler">` + c.map(x =>
    `<span class="${on}-cift"><b${arMi(x[0]) ? ' class="ar"' : ""}>${kacisi(x[0])}</b>` +
    `<i aria-hidden="true">→</i>` +
    `<span${arMi(x[1]) ? ' class="ar"' : ""}>${kacisi(x[1])}</span></span>`).join("") + `</span>`;
}

/* ---------- Türkçe yönergeler ----------
   Havuzdaki soru metinleri Arapça yönerge + Arapça/Türkçe içerik biçiminde
   yazılmış ("ما مَعْنى «أَسْتَيْقِظُ»؟" gibi). Tahtada 7. sınıfın yönergeyi
   anlaması için yönergeyi Türkçe veriyoruz; sorulan kelime/cümle ise kendi
   satırında, harekeleriyle birlikte büyük puntoda duruyor.
   Eşleşme harekesiz sade metin üzerinden yapılır; gösterilen içerik hep
   sorunun kendi hâlidir. Üçüncü alan: 1 = «» içinde ayrı bir içerik var. */
const yonSade = t => String(t || "").replace(/[\u064B-\u0652\u0670\u0640]/g, "")
                                    .replace(/\s+/g, " ").trim();
const YON_TABLO = [
  [/^الموز ب (\d+) ليرات والتفاح ب (\d+) ليرات\. أيهما أغلى؟$/, m => "Muz " + m[1] + " lira, elma " + m[2] + " lira. Hangisi daha pahalı?", 0],
  [/^الكرز ب (\d+) ليرات والتفاح ب (\d+) ليرات\. أيهما أرخص؟$/, m => "Kiraz " + m[1] + " lira, elma " + m[2] + " lira. Hangisi daha ucuz?", 0],
  [/^الكرز ب (\d+) ليرات والتفاح ب (\d+) ليرات\. «[^»]*» — صحيح؟$/, m => "Kiraz " + m[1] + " lira, elma " + m[2] + " lira. Aşağıdaki cümle doğru mu?", 1],
  [/^المشمش ب (\d+) ليرات والموز ب (\d+) ليرة\. «[^»]*» — صحيح؟$/, m => "Kayısı " + m[1] + " lira, muz " + m[2] + " lira. Aşağıdaki cümle doğru mu?", 1],
  [/^رتب الأيام: Pazartesi → Perşembe \(من اليمين\)\.$/, "Günleri Pazartesi'den Perşembe'ye sırala (sağdan sola).", 0],
  [/^رتب الساعات من (\d+) إلى (\d+) \(من اليمين\)\.$/, m => "Saatleri " + m[1] + "'den " + m[2] + "'ye sırala (sağdan sola).", 0],
  [/^رتب الأعداد من (\d+) إلى (\d+) \(من اليمين\)\.$/, m => "Sayıları " + m[1] + "'den " + m[2] + "'ye sırala (sağdan sola).", 0],
  [/^ما الكلمة المناسبة للفراغ؟ «[^»]*»$/, "Boşluğa hangi kelime gelmeli?", 1],
  [/^أين يقع مسجد آياصوفيا الكبير؟$/, "Ayasofya Camii hangi şehirdedir?", 0],
  [/^كيف نقول الساعة (\d+) بالعربية؟$/, m => "Saat " + m[1] + " Arapça nasıl söylenir?", 0],
  [/^ماذا نفعل عند الضوء الأحمر؟$/, "Kırmızı ışıkta ne yaparız?", 0],
  [/^ماذا نفعل عند الضوء الأخضر؟$/, "Yeşil ışıkta ne yaparız?", 0],
  [/^صل الضمائر بالأفعال \(درس\)\.$/, "Zamirleri «دَرَسَ» fiiliyle eşleştir.", 0],
  [/^صل الضمائر بالأفعال \(نام\)\.$/, "Zamirleri «نامَ» fiiliyle eşleştir.", 0],
  [/^صل كل مدينة بما تشتهر به\.$/, "Her şehri meşhur olduğu şeyle eşleştir.", 0],
  [/^صل وسائل النقل بمعانيها\.$/, "Ulaşım araçlarını anlamlarıyla eşleştir.", 0],
  [/^صل صيغ التفضيل بمعانيها\.$/, "Üstünlük kalıplarını anlamlarıyla eşleştir.", 0],
  [/^أي وسيلة تسير على الماء؟$/, "Suda giden ulaşım aracı hangisidir?", 0],
  [/^أي وسيلة تسير تحت الأرض؟$/, "Yer altında giden ulaşım aracı hangisidir?", 0],
  [/^أي كلمة نستعمل مع الجمع؟$/, "Çoğul isimle hangi kelimeyi kullanırız?", 0],
  [/^صل ألوان إشارات المرور\.$/, "Trafik ışığı renklerini eşleştir.", 0],
  [/^ما ترجمة «[^»]*» بالعربية؟$/, "Bunun Arapçası hangisidir?", 1],
  [/^كيف نقول «[^»]*» بالعربية؟$/, "Bunu Arapça nasıl söyleriz?", 1],
  [/^كيف نقول (\d+):(\d+) بالعربية؟$/, m => "Saat " + m[1] + ":" + m[2] + " Arapça nasıl söylenir?", 0],
  [/^صل الاتجاهات بمعانيها\.$/, "Yönleri anlamlarıyla eşleştir.", 0],
  [/^صل طرق السفر بمعانيها\.$/, "Seyahat yollarını anlamlarıyla eşleştir.", 0],
  [/^ما معنى «[^»]*» بالترتيب؟$/, "Bunların sırasıyla Türkçe anlamı nedir?", 1],
  [/^بماذا تشتهر ديار بكر؟$/, "Diyarbakır neyiyle meşhurdur?", 0],
  [/^صل الأفعال بمعانيها\.$/, "Fiilleri anlamlarıyla eşleştir.", 0],
  [/^صل الساعات بالأرقام\.$/, "Saatleri rakamlarıyla eşleştir.", 0],
  [/^صل الأعداد بالأرقام\.$/, "Sayıları rakamlarıyla eşleştir.", 0],
  [/^صل الأماكن بمعانيها\.$/, "Mekânları anlamlarıyla eşleştir.", 0],
  [/^صل الأوامر بمعانيها\.$/, "Emir kiplerini anlamlarıyla eşleştir.", 0],
  [/^صل كل مدينة بموقعها\.$/, "Her şehri bulunduğu bölgeyle eşleştir.", 0],
  [/^صل كل مدينة بمعلمها\.$/, "Her şehri simgesiyle eşleştir.", 0],
  [/^صل الكلمات بمعانيها\.$/, "Kelimeleri anlamlarıyla eşleştir.", 0],
  [/^صل الصفات بمعانيها\.$/, "Sıfatları anlamlarıyla eşleştir.", 0],
  [/^صل المواد الغذائية\.$/, "Gıda maddelerini anlamlarıyla eşleştir.", 0],
  [/^بماذا تشتهر أرضروم؟$/, "Erzurum neyiyle meşhurdur?", 0],
  [/^بماذا تشتهر باطمان؟$/, "Batman neyiyle meşhurdur?", 0],
  [/^«[^»]*» أي جواب مناسب؟$/, "Bu soruya uygun cevap hangisi?", 1],
  [/^من فاعل الفعل «[^»]*»؟$/, "Bu fiilin öznesi kimdir?", 1],
  [/^صل المدن بأسمائها\.$/, "Şehirleri adlarıyla eşleştir.", 0],
  [/^بماذا تشتهر بورصة؟$/, "Bursa neyiyle meşhurdur?", 0],
  [/^بماذا تشتهر قيصري؟$/, "Kayseri neyiyle meşhurdur?", 0],
  [/^بماذا تشتهر أفيون؟$/, "Afyon neyiyle meşhurdur?", 0],
  [/^بماذا تشتهر مرسين؟$/, "Mersin neyiyle meşhurdur?", 0],
  [/^اكتب «[^»]*» بالحروف\.$/, "Bu kelimeyi Arapça harflerle yaz.", 1],
  [/^صل المفرد بالجمع\.$/, "Tekilleri çoğullarıyla eşleştir.", 0],
  [/^أي مدينة هي «[^»]*»؟$/, "Bu hangi şehirdir?", 1],
  [/^رتب الكلمات: «[^»]*»$/, "Kelimeleri doğru sıraya diz.", 1],
  [/^صل أطعمة الفطور\.$/, "Kahvaltılıkları anlamlarıyla eşleştir.", 0],
  [/^صل أوقات الصلاة\.$/, "Namaz vakitlerini anlamlarıyla eşleştir.", 0],
  [/^أين يذهب المريض؟$/, "Hasta nereye gider?", 0],
  [/^أين تقع أنطاليا؟$/, "Antalya hangi bölgededir?", 0],
  [/^أي صلاة هي «[^»]*»؟$/, "Bu hangi namazdır?", 1],
  [/^«[^»]*» متى يستيقظ؟$/, "Bu cümleye göre ne zaman uyanıyor?", 1],
  [/^صل ظروف الزمان\.$/, "Zaman zarflarını anlamlarıyla eşleştir.", 0],
  [/^أين نقرأ الكتب؟$/, "Kitapları nerede okuruz?", 0],
  [/^ما عاصمة تركيا؟$/, "Türkiye'nin başkenti neresidir?", 0],
  [/^أين تقع سامسون؟$/, "Samsun hangi bölgededir?", 0],
  [/^«[^»]*» ما معناها؟$/, "Bu kelimenin anlamı nedir?", 1],
  [/^كم الساعة؟ «[^»]*»$/, "Saat kaç?", 1],
  [/^أي يوم هو «[^»]*»؟$/, "Bu hangi gündür?", 1],
  [/^أي جملة صحيحة؟$/, "Hangi cümle doğrudur?", 0],
  [/^أين تقع إزمير؟$/, "İzmir hangi bölgededir?", 0],
  [/^أين تقع قونيا؟$/, "Konya hangi bölgededir?", 0],
  [/^أين تقع مرسين؟$/, "Mersin hangi bölgededir?", 0],
  [/^أين تقع سينوب؟$/, "Sinop hangi bölgededir?", 0],
  [/^صل المشروبات\.$/, "İçecekleri anlamlarıyla eşleştir.", 0],
  [/^صل الخضراوات\.$/, "Sebzeleri anlamlarıyla eşleştir.", 0],
  [/^ما معنى «[^»]*»؟$/, "Bu kelimenin Türkçe anlamı nedir?", 1],
  [/^أين تقع وان؟$/, "Van hangi bölgededir?", 0],
  [/^ما جمع «[^»]*»؟$/, "Bu kelimenin çoğulu hangisidir?", 1],
  [/^صل الأطعمة\.$/, "Yiyecekleri anlamlarıyla eşleştir.", 0],
  [/^صل الفواكه\.$/, "Meyveleri anlamlarıyla eşleştir.", 0],
  [/^صل الأضداد\.$/, "Zıt anlamlıları eşleştir.", 0],
  [/^صل الأيام\.$/, "Günleri anlamlarıyla eşleştir.", 0],
  [/^أكمل: «[^»]*»$/, "Cümleyi tamamla.", 1],
];

function soruBaslik(s){
  const ham  = String((s && s.soru) || "");
  const sade = yonSade(ham);
  for (let i = 0; i < YON_TABLO.length; i++){
    const kalip = YON_TABLO[i][0], tr = YON_TABLO[i][1], icerikli = YON_TABLO[i][2];
    const m = sade.match(kalip);
    if (!m) continue;
    const yonerge = (typeof tr === "function") ? tr(m) : tr;
    if (!icerikli) return { yonerge: yonerge, cumle: "" };
    const c = ham.match(/\u00AB([^\u00BB]*)\u00BB/);
    return { yonerge: yonerge, cumle: c ? c[1].trim() : "" };
  }
  return null;                       // tabloda yoksa soru olduğu gibi kalsın
}

function sunumHtml(){
  const s = SORULAR()[D.aktif];
  if (!s) return "";
  const b = (s.bicim || "test");
  let govde = "";
  if (b === "test"){
    const arSik = s.secenekler.some(arMi);
    /* Şıklar uzunsa punto kademeli insin: soru başlığıyla birlikte ekrana sığsın. */
    const enUzun = s.secenekler.reduce((a,x) => Math.max(a, yonSade(x).length), 0);
    const sSinif = enUzun <= 14 ? "" : enUzun <= 24 ? " s2" : " s3";
    govde = `<div class="cd-secenekler${arSik?" ar":""}${sSinif}" style="grid-template-columns:repeat(${s.secenekler.length>3?2:1},1fr)">`
      + s.secenekler.map((x,i) => `<div class="cd-secenek${D.cevapAcik && i===s.dogru ? " dogru":""}${arMi(x)?" ar":""}">
          <span class="cd-harf">${HARF[i]}</span><span>${kacisi(x)}</span></div>`).join("") + `</div>`;
  } else if (b === "surukle"){
    const p = D.cevapAcik ? (s.parcalar || []) : (s.karisik || karis(s.parcalar || []));
    /* Kelime sayısı ve uzunluğu arttıkça punto kademeli küçülsün; yoksa
       6-7 kelimelik cümleler ikinci satıra taşıp ekranı aşıyor. */
    const yuk = p.reduce((a, x) => a + sadeAr(x).length, 0) + p.length * 2;
    let kSinif = yuk <= 30 ? " k1" : yuk <= 40 ? " k2" : yuk <= 48 ? " k3" : " k4";
    /* Kelime sayısı kendi başına da genişlik demek: altı ve üzeri hep küçülsün. */
    if (p.length >= 6 && (kSinif === " k1" || kSinif === " k2")) kSinif = " k3";
    govde = `<div class="cd-parcalar cd-kelimeler${kSinif}">` + p.map(x =>
      `<span class="cd-parca cd-kelime${arMi(x)?" ar":""}">${kacisi(x)}</span>`).join("") + `</div>`;
    if (D.cevapAcik){
      const tam = (s.parcalar||[]).join(" ");
      govde += `<div class="cd-cevap${arMi(tam)?" ar":""}">${kacisi(tam)}</div>`;
    }
  } else if (b === "eslestir"){
    /* Eşleştirmede iki liste de görünmeli: solda numaralı kelimeler, sağda
       harflendirilmiş karışık karşılıklar. Öğrenci "1-C" diye yazar. */
    const c = s.ciftler || [];
    const sag = (s.sagKarisik && s.sagKarisik.length === c.length)
      ? s.sagKarisik : c.map(x => x[1]);
    const harfi = v => { const i = sag.indexOf(v); return i >= 0 ? HARF[i] : "?"; };
    govde = `<div class="cd-esle-alan">
      <ol class="cd-esle-sutun">` + c.map((x, i) =>
        `<li class="cd-esle-sat${D.cevapAcik ? " acik" : ""}">
           <span class="cd-harf">${i + 1}</span>
           <span class="cd-esle-sol${arMi(x[0]) ? " ar" : ""}">${kacisi(x[0])}</span>
           <span class="cd-esle-cevap">${D.cevapAcik
             ? `<b>${harfi(x[1])}</b>`
             : `<i>?</i>`}</span>
         </li>`).join("") + `</ol>
      <ul class="cd-esle-banka">` + sag.map((v, i) =>
        `<li class="cd-esle-sik${D.cevapAcik ? " acik" : ""}">
           <span class="cd-harf">${HARF[i]}</span>
           <span class="cd-esle-karsi${arMi(v) ? " ar" : ""}">${kacisi(v)}</span>
         </li>`).join("") + `</ul>
    </div>`;
  } else {
    govde = D.cevapAcik
      ? `<div class="cd-cevap${arMi(s.cevapYazi)?" ar":""}">${kacisi(s.cevapYazi || "")}</div>`
      : `<div class="cd-parcalar cd-harfler">` + (s.tusKarisik || karis(s.tuslar || [])).map(x =>
          `<span class="cd-parca cd-harf-tas${arMi(x)?" ar":""}">${kacisi(x)}</span>`).join("") + `</div>`;
  }
  const tam = toplamSure(s);
  const yuzde = Math.max(0, Math.min(100, Math.round((D.sayacKalan / tam) * 100)));
  return `
  <div class="cd-sunum${D.siralamaAcik?" sira-acik":(D.yanAcik?" yan-acik":"")}${D.cevapAcik&&!D.siralamaAcik?" cevap-acik":""}" id="cdSunum">
    <div class="cd-sunum-ust">
      <button class="cd-tus cd-kapat" onclick="COFF.cikSor()" title="Yarışmadan çık"
              aria-label="Geri">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
        </svg>
      </button>
      <span class="cd-sayac${D.sayacKalan<=10?" az":""}" id="cdSayac">${cdSure(D.sayacKalan)}</span>
      <span class="cd-ilerleme${D.sayacKalan<=10?" az":""}"><i style="width:${yuzde}%"></i></span>
      <button class="cd-tus" onclick="COFF.yanAcKapa()">Puan tablosu</button>
    </div>
    ${D.siralamaAcik ? siralamaHtml() : (D.cevapAcik ? `
    <div class="cd-cevap-serit${(b === "eslestir" && (s.ciftler || []).length) ? " esle" : ""}">
      <span class="cd-cs-etiket">Doğru cevap</span>
      ${(b === "eslestir" && (s.ciftler || []).length)
        ? ciftlerHtml(s, "cd-cs")
        : (() => { const m = dogruMetin(s);
            return `<span class="cd-cs-metin${arMi(m) ? " ar" : ""}${
              m.length > 96 ? " cok-uzun" : (m.length > 52 ? " uzun" : "")
            }">${kacisi(m)}</span>`; })()}
      <span class="cd-cs-no" dir="ltr">Soru ${D.aktif+1} / ${SORULAR().length}</span>
    </div>` : `
    <div class="cd-sunum-orta cd-b-${b}">
      <span class="cd-soru-no" dir="ltr">${D.mac ? kacisi(turAdi(D.mac.ti)) + " · " : ""}Soru ${D.aktif+1} / ${SORULAR().length} · ${kacisi(BICIM_TR[b]||"")}</span>
      ${(() => { const x = soruBaslik(s);
        if (x && x.cumle){
          /* Kısa içerik en büyük puntoyu kaldırır; uzun cümlede kademeli iner. */
          const n = yonSade(x.cumle).length;
          const h = n <= 16 ? " h1" : n <= 30 ? " h2" : n <= 46 ? " h3" : " h4";
          return `
          <div class="cd-yonerge">${kacisi(x.yonerge)}</div>
          <div class="cd-hedef${h}${arMi(x.cumle) ? " ar" : ""}">${kacisi(x.cumle)}</div>`;
        }
        if (x){
          const n = x.yonerge.length;
          return `<div class="cd-soru cd-soru-tr${n <= 32 ? "" : n <= 46 ? " t2" : " t3"}">${kacisi(x.yonerge)}</div>`;
        }
        return `<div class="cd-soru${arMi(s.soru)?" ar":""}">${kacisi(s.soru)}</div>
          ${arapcaSatiri(s) ? `<div class="cd-soru ar cd-soru-alt">${kacisi(arapcaSatiri(s))}</div>` : ""}`;
      })()}
      ${govde}
    </div>`)}
    <div class="cd-sunum-alt">
      ${ilerlemeHtml()}
      <button class="cd-tus" onclick="COFF.sayacBasDur()" id="cdSayacTus">${D.sayacId?"⏸ Duraklat":"▶ Süreyi başlat"}</button>
      <button class="cd-tus cd-tus-ek" id="cdSureEkTus" onclick="COFF.sureEkle(15)"
              ${D.cevapAcik ? "disabled" : ""} title="Süreye 15 saniye ekle">+15 sn</button>
      <button class="cd-tus cd-tus-ana" onclick="COFF.cevapAc()">${D.cevapAcik?"Cevap açık":"Cevabı göster"}</button>
      <button class="cd-tus${ileriKilitli() ? " kilitli" : " hazir"}" id="cdIleriTus"
              onclick="COFF.ileri()" ${ileriKilitli() ? "disabled" : ""}
              title="${ileriKilitli() ? kacisi(ileriNeden()) : "Herkes değerlendirildi — sonraki soruya geçebilirsin"}">
        ${D.aktif+1>=SORULAR().length?(D.mac?"Maçı bitir":"Bitir"):"Sonraki ›"}</button>
      <span class="cd-kisayol">boşluk: cevap · S: süre · P: puan · +: doğru, −: geri al</span>
    </div>
    <aside class="cd-yan${D.yanAcik?" acik":""}${YAR().length>10?" cok-kalabalik":(YAR().length>6?" kalabalik":"")}" id="cdYan">
      <h4>${D.mac ? "Maç puanı" : "Puan tablosu"}</h4>
      <span class="cd-isaret-yuva">${isaretNotu()}</span>
      <div class="cd-puan">${puanHtml()}</div>
    </aside>
  </div>`;
}
function cdSure(sn){
  sn = Math.max(0, sn|0);
  return String(Math.floor(sn/60)).padStart(2,"0") + ":" + String(sn%60).padStart(2,"0");
}
/* Bu sorunun işaretleri: her katılımcı için "d" (doğru) ya da "y" (bilemedi). */
function turIsaret(){
  if (!D.turPuan[D.aktif]) D.turPuan[D.aktif] = {};
  return D.turPuan[D.aktif];
}
function isaretSayisi(){
  const t = turIsaret();
  return YAR().filter(k => t[k.id]).length;
}
function hepsiIsaretli(){ return YAR().length > 0 && isaretSayisi() === YAR().length; }
/* Soru "çözülmüş" sayılması için önce cevabın açılması, sonra herkesin
   işaretlenmiş olması gerekir. İkisi tamamlanmadan sonraki soruya geçilmez. */
function ileriKilitli(){ return !D.cevapAcik || !hepsiIsaretli(); }
/* i. soru tamamlandı mı: herkes işaretlenmişse bitmiş sayılır. */
function soruBitti(i){
  const t = D.turPuan[i]; if (!t) return false;
  const y = YAR();
  return y.length > 0 && y.every(k => !!t[k.id]);
}
/* Alttaki ilerleme çubuğu: her soru için bir kutucuk. */
function ilerlemeHtml(){
  const n = SORULAR().length;
  const bitmis = [];
  for (let i = 0; i < n; i++) if (soruBitti(i)) bitmis.push(i);
  return `<div class="cd-ilerleme-serit" role="progressbar"
       aria-valuemin="1" aria-valuemax="${n}" aria-valuenow="${D.aktif + 1}"
       aria-label="Soru ${D.aktif + 1} / ${n}">
    <span class="cd-il-sayi">Soru <b>${D.aktif + 1}</b> / ${n}</span>
    <span class="cd-il-kutular">${Array.from({ length: n }, (_, i) =>
      `<i class="cd-il-adim${i === D.aktif ? " simdi" : (soruBitti(i) ? " tamam" : "")}"
          title="Soru ${i + 1}${soruBitti(i) ? " · tamamlandı" : ""}"></i>`).join("")}</span>
    <span class="cd-il-bitti">${bitmis.length} / ${n} tamam</span>
  </div>`;
}
function ileriNeden(){
  if (!D.cevapAcik) return "Önce cevabı göster.";
  const eksik = YAR().length - isaretSayisi();
  return "Önce herkesi işaretle — " + eksik + " tanesi kaldı.";
}

/* Sorular arasında ve sonunda gösterilen tam ekran sıralama. */
function siralamaHtml(){
  if (D.mac) return macSiralamaHtml();
  const sirali = D.katilim.slice().sort((a,b) => b.puan - a.puan);
  const enst = sirali.length ? sirali[0].puan : 0;
  const esitlik = sirali.filter(x => x.puan === enst).length >= sirali.length;
  const son = !!D.bitti;
  const madalya = ["🥇", "🥈", "🥉"];
  return `
  <div class="cd-siralama">
    <h2 class="cd-sir-bas">${son ? "Yarışma bitti 🎉" : "Puan durumu"}</h2>
    <p class="cd-sir-alt">${son ? "Tebrikler!" : "Soru " + (D.aktif + 1) + " / " + SORULAR().length + " tamamlandı"}</p>
    <div class="cd-sir-liste">
      ${sirali.map((k, i) => `
        <div class="cd-sir-satir${(!esitlik && k.puan === enst && k.puan > 0) ? " birinci" : ""}"
             style="--tr:${k.renk || "#1F3864"}">
          <span class="cd-sir-yer">${madalya[i] || (i + 1)}</span>
          <span class="cd-sir-ad" dir="auto">${kacisi(k.tr || k.ad)}
            ${k.alt ? `<small>${kacisi(k.alt)}</small>` : ""}</span>
          <span class="cd-sir-cubuk"><i style="width:${enst ? Math.round((k.puan / enst) * 100) : 0}%"></i></span>
          <span class="cd-sir-puan">${k.puan}</span>
        </div>`).join("")}
    </div>
    <div class="cd-sir-tuslar">
      ${son
        ? `<button class="cd-tus cd-tus-ana" onclick="COFF.sunumKapat()">Kurulum ekranına dön</button>`
        : `<button class="cd-tus cd-tus-ana" onclick="COFF.ileri()">Sonraki soru ›</button>
           <button class="cd-tus" onclick="COFF.siralamaKapat()">‹ Soruya dön</button>`}
    </div>
  </div>`;
}

function puanHtml(){
  /* Satırlar HİÇ yer değiştirmez: puan verince liste yeniden sıralansaydı
     tıklanan satır kayar, başka takım işaretlenmiş gibi görünürdü.
     Sıralama yalnızca baştaki rozetin rakamına yansır. */
  const sirali = YAR().slice().sort((a,b) => b.puan - a.puan);
  const yer = {};
  sirali.forEach((k, i) => { yer[k.id] = i + 1; });
  const enYuksek = sirali.length ? sirali[0].puan : 0;
  /* Herkes eşitse kimse "lider" sayılmaz; yoksa bütün satırlar altın olur. */
  const esitlik = sirali.filter(x => x.puan === enYuksek).length >= sirali.length;
  const t = turIsaret();
  return YAR().map(k => {
    const i = yer[k.id] - 1;
    const im = D.cevapAcik ? (t[k.id] || "") : "";
    return `<div class="cd-puan-satir${(!esitlik && k.puan === enYuksek && k.puan > 0)?" lider":""}${D.cevapAcik?" isaretli-satir":""}${im?" im-"+im:""}"
        style="--tr:${k.renk || "#1F3864"}">
      <span class="cd-sira">${yer[k.id]}</span>
      <span class="cd-puan-ad" dir="auto">${kacisi(k.tr || k.ad)}${k.alt?`<small>${kacisi(k.alt)}</small>`:""}</span>
      ${D.cevapAcik ? `
      <span class="cd-isaret">
        <button class="cd-im cd-im-y${im==="y"?" ac":""}" onclick="COFF.isaretle('${k.id}','y')"
                title="Bilemedi">✗<i>Bilemedi</i></button>
        <button class="cd-im cd-im-d${im==="d"?" ac":""}" onclick="COFF.isaretle('${k.id}','d')"
                title="Doğru">✓<i>Doğru</i></button>
      </span>` : ""}
      <span class="cd-sayacli">
        <button class="cd-mini eksi" onclick="COFF.puan('${k.id}',-1)"
                title="Geri al" aria-label="Geri al"
                ${(k.puan <= 0 && !im) ? "disabled" : ""}>−</button>
        <span class="cd-puan-deger">${k.puan}</span>
        <button class="cd-mini arti${im === "d" ? " ac" : ""}" onclick="COFF.puan('${k.id}',1)"
                title="Doğru (+1)" aria-label="Doğru">+</button>
      </span>
    </div>`;
  }).join("");
}

/* Puan tablosunun başındaki ilerleme notu. */
/* Bu sorunun kaç puan getirdiğini panelde göster: puanlama sabit 1 puan
   olmadığı sürece öğretmen ne işlediğini görsün. */
function puanRozeti(){
  const s = SORULAR()[D.aktif];
  const art = soruPuani(s), eksi = yanlisPuani();
  if (art === 1 && !eksi) return "";
  return `<span class="cd-puan-rozet">✓ +${art}${eksi ? ` · ✗ −${eksi}` : ""}</span>`;
}
function isaretNotu(){
  if (!D.cevapAcik)
    return `<span class="cd-isaret-not">Süre bitince <b>Cevabı göster</b>, sonra herkesi işaretle</span>${puanRozeti()}`;
  const n = isaretSayisi(), t = YAR().length;
  const ad = D.bicim === "kisi" ? "öğrenci" : (D.bicim === "sinif" ? "sınıf" : "takım");
  return (hepsiIsaretli()
    ? `<span class="cd-isaret-not tamam">Hepsi değerlendirildi · sonraki soruya geçebilirsin</span>`
    : `<span class="cd-isaret-not">${n} / ${t} ${ad} değerlendirildi · ✓ ✗ ya da +/− kullan</span>`)
    + puanRozeti();
}


/* ==========================================================================
   TURNUVA — eşleşmeli kupa şeması
   Takımlar ikişerli eşleşir, her maç birkaç soru sürer, çok doğru yapan üst
   tura çıkar, öbürü elenir. Katılımcı sayısı ikinin kuvveti değilse boş
   yerler "bay" olur; bay geçen taraf kendiliğinden bir üst tura yükselir.
   ========================================================================== */
const TUR_AD = { 2:"Final", 4:"Yarı final", 8:"Çeyrek final", 16:"Son 16", 32:"Son 32" };

function ikininKuvveti(n){ let k = 2; while (k < n) k *= 2; return k; }
function turAdi(ti){
  const t = D.turnuva;
  if (!t || !t.turlar[ti]) return (ti + 1) + ". tur";
  return TUR_AD[t.turlar[ti].length * 2] || (ti + 1) + ". tur";
}

function turnuvaKur(macSoru){
  const oyuncular = karis(D.katilim.slice());
  const yer = ikininKuvveti(Math.max(2, oyuncular.length));
  /* Boş yerleri sona yığmak yerine maçlara dağıtıyoruz: böylece bomboş maç
     kalmaz, eksik yer sadece bir tarafa "bay" olur ve o taraf üste çıkar. */
  const yuvalar = new Array(yer).fill(null);
  let i = 0;
  for (let m = 0; m < yer / 2 && i < oyuncular.length; m++) yuvalar[m * 2] = oyuncular[i++];
  for (let m = yer / 2 - 1; m >= 0 && i < oyuncular.length; m--) yuvalar[m * 2 + 1] = oyuncular[i++];
  const turlar = [];
  let siradaki = yuvalar;
  while (siradaki.length >= 2){
    const maclar = [];
    for (let i = 0; i < siradaki.length; i += 2){
      maclar.push({ a:siradaki[i], b:siradaki[i+1], sa:0, sb:0, kazanan:null, bitti:false });
    }
    turlar.push(maclar);
    siradaki = maclar.map(() => null);
  }
  D.turnuva = {
    turlar: turlar, tur: 0, mac: 0,
    macSoru: Math.max(1, Math.min(9, macSoru || 3)),
    soruImleci: 0, sampiyon: null
  };
  turnuvaBaylariGec();
}

/* Bir yandaki boşluk kalıcı mı (bay), yoksa henüz oynanmamış bir maçı mı
   bekliyor? İlk turda boşluk her zaman bay; üst turlarda ancak besleyen maç
   da bomboş kaldıysa bay sayılır. */
function slotKapali(ti, mi, yan){
  if (ti === 0) return true;
  const besleyen = D.turnuva.turlar[ti - 1][mi * 2 + yan];
  return !!(besleyen && besleyen.bitti && !besleyen.kazanan);
}

/* Rakibi olmayan (bay) maçları kendiliğinden çöz. Turlar baştan sona
   gezildiği için bir turda yükselen taraf, üst tur incelenmeden yerine oturur. */
function turnuvaBaylariGec(){
  const t = D.turnuva; if (!t) return;
  t.turlar.forEach((maclar, ti) => {
    maclar.forEach((m, mi) => {
      if (m.bitti) return;
      const aBos = !m.a && slotKapali(ti, mi, 0);
      const bBos = !m.b && slotKapali(ti, mi, 1);
      if (aBos && bBos){ m.bitti = true; m.bay = true; m.bos = true; return; }
      if (m.a && bBos){ m.kazanan = m.a; m.bitti = true; m.bay = true; turnuvaYukselt(ti, mi, m.a); }
      else if (m.b && aBos){ m.kazanan = m.b; m.bitti = true; m.bay = true; turnuvaYukselt(ti, mi, m.b); }
    });
  });
}

function turnuvaYukselt(turIdx, macIdx, kazanan){
  const t = D.turnuva;
  const ust = t.turlar[turIdx + 1];
  if (!ust){ t.sampiyon = kazanan; return; }
  const hedef = ust[Math.floor(macIdx / 2)];
  if (macIdx % 2 === 0) hedef.a = kazanan; else hedef.b = kazanan;
}

/* Oynanacak ilk maç. */
function siradakiMac(){
  const t = D.turnuva; if (!t) return null;
  for (let ti = 0; ti < t.turlar.length; ti++){
    for (let mi = 0; mi < t.turlar[ti].length; mi++){
      const m = t.turlar[ti][mi];
      if (!m.bitti && m.a && m.b) return { ti:ti, mi:mi, m:m };
    }
  }
  return null;
}

/* Tek bir maç bile oynandı mı? (oynandıysa ayarlar kilitlenir) */
function turnuvaBasladi(){
  const t = D.turnuva; if (!t) return false;
  return t.turlar.some(tt => tt.some(m => m.bitti && !m.bay));
}

/* Bu maçta kaç doğru yapıldı: işaretler üzerinden sayılır. */
function macSkor(){
  if (!D.mac) return { sa:0, sb:0 };
  const a = D.mac.yarisan[0], b = D.mac.yarisan[1];
  let sa = 0, sb = 0;
  Object.keys(D.turPuan).forEach(i => {
    const t = D.turPuan[i];
    if (t[a.id] === "d") sa++;
    if (t[b.id] === "d") sb++;
  });
  return { sa:sa, sb:sb };
}

/* ---------- şema ekranı ---------- */
function semaHtml(){
  const t = D.turnuva;
  const sira = siradakiMac();
  const kilit = turnuvaBasladi();
  return `
  <div class="cdw" dir="ltr">
    <div class="cdw-ust">
      <button type="button" class="cdw-geri-tus" onclick="COFF.turnuvaKapat()"
              title="Kuruluma dön" aria-label="Geri">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
        </svg>
      </button>
      <ol class="cdw-yol"><li class="simdi"><button type="button" class="cdw-yol-tus" disabled>
        <span class="cdw-yol-no">🏆</span><span class="cdw-yol-ad">Turnuva</span></button></li></ol>
      <div class="cd-sema-ayar">
        <label>Maç başına soru</label>
        <div class="cdw-sayac-kutu ufak">
          <button type="button" class="cdw-yuvarlak" onclick="COFF.macSoruDegis(-1)" ${kilit?"disabled":""}>−</button>
          <b>${t.macSoru}</b>
          <button type="button" class="cdw-yuvarlak" onclick="COFF.macSoruDegis(1)" ${kilit?"disabled":""}>+</button>
        </div>
        <button type="button" class="cd-tus cd-tus-ufak" onclick="COFF.turnuvaYenidenKur()"
                title="Eşleşmeleri yeniden çek">⟳ Kurayı yenile</button>
      </div>
    </div>
    <div class="cdw-govde cdw-govde-sema">
      <div class="cdw-sahne cdw-genis">
        <h2 class="cdw-bas">${t.sampiyon ? "Şampiyon 🏆" : "Turnuva şeması"}</h2>
        <p class="cdw-alt-bas">${t.sampiyon
          ? kacisi(t.sampiyon.tr || t.sampiyon.ad) + " kupayı aldı!"
          : (sira
             ? turAdi(sira.ti) + " · sıradaki maç: " +
               kacisi(sira.m.a.tr || sira.m.a.ad) + " — " + kacisi(sira.m.b.tr || sira.m.b.ad)
             : "Her maç " + t.macSoru + " soru · çok doğru yapan üst tura çıkar")}</p>
        <div class="cd-sema${t.turlar[0].length > 8 ? " cok-yogun" : (t.turlar[0].length > 4 ? " yogun" : "")}">
          ${t.turlar.map((maclar, ti) => `
            <div class="cd-sema-tur">
              <h3>${kacisi(turAdi(ti))}</h3>
              <div class="cd-sema-maclar">
              ${maclar.map((m, mi) => {
                const su = !!(sira && sira.ti === ti && sira.mi === mi);
                return `<div class="cd-mac${m.bitti ? " bitti" : ""}${m.bos ? " bos-mac" : ""}${su ? " sirada" : ""}">
                  ${[[m.a, m.sa, 0], [m.b, m.sb, 1]].map(ik => {
                    const k = ik[0], sk = ik[1], yan = ik[2];
                    const kazandi = !!(k && m.kazanan === k);
                    const elendi  = !!(m.bitti && k && m.kazanan !== k);
                    /* Boşluk iki türlü olur: kalıcı "bay" ya da alt turdan
                       gelecek kazananı bekleyen yer. İkisi ayrı görünsün. */
                    const bay = !k && slotKapali(ti, mi, yan);
                    return `<div class="cd-mac-yan${kazandi?" kazandi":""}${elendi?" elendi":""}${k?"":(bay?" bos":" bekliyor")}"
                         style="--tr:${k ? (k.renk || "#1F3864") : "#CBD5E1"}">
                      <span class="cd-mac-ad" dir="auto">${k ? kacisi(k.tr || k.ad) : (bay ? "bay" : "kazananı bekliyor")}</span>
                      ${(m.bitti && !m.bay) || su ? `<span class="cd-mac-skor">${sk}</span>` : ""}
                    </div>`;
                  }).join("")}
                  ${su ? `<button type="button" class="cd-tus cd-tus-ana cd-mac-tus"
                            onclick="COFF.macBaslat()">▶ Maçı başlat</button>` : ""}
                </div>`;
              }).join("")}
              </div>
            </div>`).join("")}
          ${t.sampiyon ? `
            <div class="cd-sema-tur">
              <h3>Kupa</h3>
              <div class="cd-sema-maclar">
                <div class="cd-mac sampiyon">
                  <div class="cd-mac-yan kupa-yan" style="--tr:${t.sampiyon.renk || "#D69E2E"}">
                    <span class="cd-mac-ad" dir="auto">🏆 ${kacisi(t.sampiyon.tr || t.sampiyon.ad)}</span>
                  </div>
                </div>
              </div>
            </div>` : ""}
        </div>
        <div class="cd-sema-alt">
          ${t.sampiyon
            ? `<button type="button" class="cd-tus cd-tus-ana" onclick="COFF.turnuvaKapat()">Kurulum ekranına dön</button>
               <button type="button" class="cd-tus" onclick="COFF.turnuvaYenidenKur()">Yeni turnuva</button>`
            : `<span class="cd-sema-not">Elenen taraf soluk ve üstü çizili görünür. Maçlar yukarıdan aşağıya oynanır.</span>`}
        </div>
      </div>
    </div>
  </div>`;
}

/* Maç arasında ve maç bitince gösterilen tam ekran tablo. */
function macSiralamaHtml(){
  const m = D.turnuva.turlar[D.mac.ti][D.mac.mi];
  const sn = D.mac.sonuc;
  const s = sn || macSkor();
  const a = D.mac.yarisan[0], b = D.mac.yarisan[1];
  const enst = Math.max(s.sa, s.sb, 1);
  const satir = (k, sk) => `
    <div class="cd-sir-satir${sn && sn.kazanan === k ? " birinci" : ""}${sn && sn.kazanan !== k ? " elendi" : ""}"
         style="--tr:${k.renk || "#1F3864"}">
      <span class="cd-sir-yer">${sn ? (sn.kazanan === k ? "🏆" : "✗") : "•"}</span>
      <span class="cd-sir-ad" dir="auto">${kacisi(k.tr || k.ad)}${k.alt?`<small>${kacisi(k.alt)}</small>`:""}</span>
      <span class="cd-sir-cubuk"><i style="width:${Math.round((sk / enst) * 100)}%"></i></span>
      <span class="cd-sir-puan">${sk}</span>
    </div>`;
  return `
  <div class="cd-siralama">
    <h2 class="cd-sir-bas">${sn ? "Maç bitti 🏆" : "Maç durumu"}</h2>
    <p class="cd-sir-alt">${sn
      ? kacisi(sn.kazanan.tr || sn.kazanan.ad) + " üst tura çıktı"
      : kacisi(turAdi(D.mac.ti)) + " · soru " + (D.aktif + 1) + " / " + D.mac.sorular.length
        + (D.mac.ek ? " · altın soru" : "")}</p>
    <div class="cd-sir-liste">${satir(a, s.sa)}${satir(b, s.sb)}</div>
    <div class="cd-sir-tuslar">
      ${sn
        ? `<button class="cd-tus cd-tus-ana" onclick="COFF.macKapat()">Şemaya dön ›</button>`
        : `<button class="cd-tus cd-tus-ana" onclick="COFF.ileri()">Sonraki soru ›</button>
           <button class="cd-tus" onclick="COFF.siralamaKapat()">‹ Soruya dön</button>`}
    </div>
  </div>`;
}

/* Turnuvada yalnız iki rakip yarışır; normal turda herkes. */
function YAR(){ return D.mac ? D.mac.yarisan : D.katilim; }
function SORULAR(){ return D.mac ? D.mac.sorular : D.sorular; }

/* ---------- dışa açılan arayüz ---------- */
const COFF = {
  ac(mod){
    if (mod === "canli" || mod === "cevrimdisi") D.mod = mod;
    if (D.mod === "cevrimdisi" && D.bicim === "kisi"){ D.bicim = "takim"; D.katilim = []; }
    if (!D.katilim.length) listeKur();
    /* Ders kendiliğinden seçilmez: klasör kapsamı 1-2 / 1-4 olduğu için
       hangi dersten soru geleceğine öğretmen karar verir. */
    D.adim = 1;
    ekranGoster("ekranCevrimdisi");
    canliYolGozle();
    COFF.ciz();
  },
  kapat(){ COFF.sunumKapat(); BIY._modKapisi(); },
  /* Çarpı bir önceki ekrana döner: adım varsa bir geri, 1. adımdaysa mod seçimine. */
  geriCik(){
    if (D.adim > 1){ COFF.adimGit(D.adim - 1); return; }
    location.href = "index.html";        // ilk adımda: oyun menüsüne dön
  },
  ciz(){
    const e = el("ekranCevrimdisi");
    if (!e) return;
    e.innerHTML = kurulumHtml();
    panelYerlestir();        // taşınan gerçek düğümleri yuvalarına yerleştir
  },

  ayar(alan, v){
    const sayisal = { bas:1, son:1, takimSayi:1, soruSayisi:1, sure:1 };
    if (alan === "yok") D.yok = String(v || "");
    else if (alan === "sinifAdlari"){ D.sinifAdlari = String(v || ""); listeKur(); COFF.ciz(); return; }
    else if (sayisal[alan]) D[alan] = Math.max(1, parseInt(v, 10) || 1);
    if (alan === "sure") D.sure = Math.max(10, Math.min(180, parseInt(v,10) || 30));
    if (adimAnahtar() === "bicim") sayacTazele();
  },
  bicimSec(v){
    /* Çevrimdışında her öğrenciye tek tek puan vermek zor; bireysel sistem
       yalnız karekodlu (çevrimiçi) yarışmada kullanılabilir. */
    if (v === "kisi" && D.mod === "cevrimdisi"){
      uyar("Bireysel Yarış yalnız çevrimiçi yarışmada kullanılır.");
      return;
    }
    D.bicim = v;
    /* Biçim tek yerde seçiliyor; canlı taraf da hemen aynı değeri görsün.
       Açık bir oda varsa dokunmayız — orayı canlı tarafın kendi onayı yönetir. */
    if (!state.odaId) state.oyunModu = BICIM_ES[v] || "takim";
    listeKur();
    COFF.ciz();
  },

  /* ---- mod anahtarı: seçimleri kaybetmeden çevrimiçi/çevrimdışı ---- */
  modDegis(hedef){
    const eski = adimAnahtar();
    COFF.sunumKapat();
    D.mod = (hedef === "canli") ? "canli" : "cevrimdisi";
    /* Çevrimdışında bireysel sistem yok: takıma çevir. */
    if (D.mod === "cevrimdisi" && D.bicim === "kisi"){
      D.bicim = "takim";
      if (!state.odaId) state.oyunModu = "takim";
      D.katilim = [];
    }
    if (D.mod === "canli") canliyaAktar(); else canlidanAl();
    if (!D.katilim.length) listeKur();
    /* Aynı işi gören adımda kal; o adım öbür modda yoksa dersten devam et. */
    D.adim = adimNo(adimlar().some(a => a[0] === eski) ? eski : "ders");
    ekranGoster("ekranCevrimdisi");     // tek kurulum sayfası — başka sayfa açılmaz
    COFF.ciz();
    switchTazele(D.mod);
  },
  canliBaslat(){
    if (!D.sorular.length && !seciliSorular().length){ uyar("Önce bir ders seç."); return; }
    canliyaAktar();
    canliYolGozle();
    try { BIY.acLobi(BICIM_ES[D.bicim] || "takim"); }
    catch(e){ console.warn("[CD] lobi:", e); uyar("Lobi açılamadı."); }
    setTimeout(canliYolCiz, 0);
  },

  /* ---- adım adım gezinme ---- */
  adimGit(n){
    const yol = adimlar();
    n = Math.max(1, Math.min(yol.length, n));
    const hedef = (yol[n - 1] || [])[0];
    const su = canliEkran();
    /* Canlının 4-5. sekmeleri kurulum sayfasının dışında: lobi ve yarışma. */
    if (D.mod === "canli" && hedef === "karekod"){
      if (oyunAkiyor() && odaVar()){       // oyun sürerken karekoda göz at
        D.adim = n; ekranGoster("ekranTakimlar"); canliYolCiz(); return;
      }
      const eks = eksikler();
      if (eks.length){ COFF.adimGit(adimNo(eks[0].git)); uyar(eks[0].yazi); return; }
      /* Ayrı "Başlat" sayfası kalmadığı için soru seti burada kuruluyor. */
      if (turGerekli() && !setKur()){ uyar("Bu derste seçtiğin çeşitlerde soru yok."); return; }
      D.adim = n; COFF.canliBaslat(); return;
    }
    D.adim = n;
    if (su) ekranGoster("ekranCevrimdisi");   // 4-5'ten kuruluma dön
    /* "Başlat" sekmesine girerken soru seti hazır değilse kurulur; hazırsa
       olduğu gibi kalır — puanlar ve seçilmiş sorular korunur. */
    if (adimAnahtar() === "bas" && D.konuId && seciliSorular().length && turGerekli()){
      COFF.turKur(); return;
    }
    COFF.ciz();
  },
  adimGeri(){ if (D.adim > 1) COFF.adimGit(D.adim - 1); },
  /* Karekod/yarışma ekranındaki şeritten bir önceki sekmeye. */
  yolGeri(){ COFF.adimGit(Math.max(1, D.adim - 1)); },
  adimIleri(){
    const k = adimAnahtar();
    if (k === "ders"){
      if (!D.konuId){ uyar("Önce bir ders seç."); return; }
      if (!seciliSorular().length){ uyar("Bu derste seçtiğin çeşitlerde soru yok."); return; }
    }
    if (k === "bicim" && D.mod === "cevrimdisi"){
      if (D.bicim === "sinif" && !D.katilim.length){
        uyar("En az bir sınıf ekle.");
        const g = el("cdSinifAd"); if (g) g.focus();
        return;
      }
      if (!D.katilim.length) listeKur();
    }
    /* Canlıda "Başlat" sayfası yok: soruları hazırlayıp karekodu açıyoruz. */
    if (sonrakiAnahtar() === "karekod"){ COFF.adimGit(adimNo("karekod")); return; }
    /* Son adıma ("Başlat") geçerken soruları burada hazırlıyoruz. */
    if (sonrakiAnahtar() === "bas"){
      const eski = D.sorular.length;
      D.adim = adimNo("bas");
      if (D.konuId && seciliSorular().length && turGerekli()) COFF.turKur();
      else COFF.ciz();
      const d5 = el("cdPdfDurum");
      if (d5 && D.sorular.length){
        d5.className = "cdw-pdf-durum ok";
        d5.textContent = D.sorular.length + " soru hazır" + (eski && !turGerekli() ? "" : "landı")
          + ". Yukarıdaki seçeneklerden birini kullan.";
      }
      return;
    }
    COFF.adimGit(D.adim + 1);
  },
  /* Canlı tarafın kendi soru havuzu penceresi — kaplama olarak açılır. */
  havuzAc(){
    try { if (BIY.soruSecAc) BIY.soruSecAc(); }
    catch(e){ uyar("Soru havuzu açılamadı."); }
  },
  basaDon(){ COFF.adimGit(adimNo("bas")); },
  /* Süzgeç penceresi açıkken bütün ekranı yeniden çizmek pencereyi bir an
     kapatıp açıyordu. Onun yerine yalnız havuz bilgisini tazeliyoruz. */
  bilgiTazele(){
    /* Süzgeç penceresi açıkken bütün ekranı yeniden çizmek pencereyi bir an
       kapatıp açıyordu. Onun yerine yalnız çıktı bloğunu tazeliyoruz. */
    const y = el("cdCiktiYuva");
    if (y) y.innerHTML = ciktiHtml();
  },
  defterAc(){
    if (!D.sorular.length){ uyar("Önce soruları hazırla."); return; }
    D.anlAdim = 0;
    const e = el("ekranCevrimdisi"); if (e) e.innerHTML = anlatimHtml();
  },
  defterBasla(){ D.yanAcik = true; COFF.sunumAc(); },
  /* Kart: ilk seferde akış anlatımı, sonrasında doğrudan yarışma. */
  yansitBasla(){
    if (!D.sorular.length){ uyar("Önce soruları hazırla."); return; }
    if (!D.anlatimGoruldu){ D.anlatimGoruldu = true; COFF.defterAc(); return; }
    COFF.sunumAc();
  },
  anlatimGit(i){
    D.anlAdim = Math.max(0, i);
    const e = el("ekranCevrimdisi"); if (e) e.innerHTML = anlatimHtml();
  },
  anlatimBitir(){ D.anlatimGoruldu = true; D.yanAcik = true; COFF.sunumAc(); },
  /* Sunum açılır açılmaz 3 · 2 · 1 · Başla! sayımı; bitince süre işlemeye başlar. */
  _geriSayim(){
    const k = el("cdSunum"); if (!k) return;
    const eski = k.querySelector(".cd-gerisayim"); if (eski) eski.remove();
    if (D.gsT){ clearTimeout(D.gsT); D.gsT = null; }
    const ov = document.createElement("div");
    ov.className = "cd-gerisayim";
    ov.innerHTML = '<span class="cd-gs-sayi">3</span>' + CIZ.yazanlar;
    k.appendChild(ov);
    const sayi = ov.querySelector(".cd-gs-sayi");
    let n = 3;
    const vur = () => { sayi.classList.remove("vur"); void sayi.offsetWidth; sayi.classList.add("vur"); };
    vur(); sesBaslaTik(3);
    D.gsId = setInterval(() => {
      n--;
      if (n > 0){ sayi.textContent = String(n); vur(); sesBaslaTik(n); return; }
      if (n === 0){
        sayi.textContent = "Başla!"; sayi.classList.add("bas"); vur(); sesBaslaTik(0);
        ov.classList.add("yaziyor");               // kalemler işlemeye başlasın
        return;
      }
      clearInterval(D.gsId); D.gsId = null;
      /* Yazma anı bir saniye kadar ekranda kalsın, sonra sahne çekilsin. */
      ov.classList.add("kalem");
      D.gsT = setTimeout(() => {
        D.gsT = null;
        ov.classList.add("bitti");
        setTimeout(() => { if (ov.parentNode) ov.remove(); }, 260);
        if (!D.sayacId) COFF.sayacBasDur();        // süre kendiliğinden başlasın
      }, 1000);
    }, 900);
  },
  takimDegis(d){
    D.takimSayi = Math.max(2, Math.min(enFazlaTakim(), D.takimSayi + d));
    listeKur(); COFF.ciz();
  },
  sayiDegis(alan, d){
    if (alan === "sure") D.sure = Math.max(10, Math.min(180, D.sure + d));
    else D.soruSayisi = Math.max(1, Math.min(50, D.soruSayisi + d));
    COFF.ciz();
  },
  bicimAcKapa(b){
    const acik = Object.keys(D.bicimSecim).filter(x => D.bicimSecim[x]);
    if (D.bicimSecim[b] && acik.length === 1) return;      // en az bir biçim kalsın
    try {
      if (BIY.bicimToggle) BIY.bicimToggle(b);             // canlı taraf da haberdar olsun
      else D.bicimSecim[b] = !D.bicimSecim[b];
    } catch(e){ D.bicimSecim[b] = !D.bicimSecim[b]; }
    COFF.ciz();
  },
  uniteAcKapa(btn){ btn.parentNode.classList.toggle("acik"); },
  konuSec(id){
    const k = konuBul(id);
    /* Canlı tarafın kendi yöntemlerini kullanıyoruz: ünite, havuz ve menü
       durumu orada doğru şekilde güncellensin. Erişilemezse elle yazarız. */
    try {
      if (k && k.unite && state.uniteNo !== k.unite && BIY.uniteSec) BIY.uniteSec(k.unite);
      if (BIY.konuSec) BIY.konuSec(id); else D.konuId = id;
    } catch(e){ D.konuId = id; }
    if (D.konuId !== id) D.konuId = id;
    COFF.ciz();
  },
  listeKur(){ D.tasinan = null; listeKur(); COFF._katTazele(); sayacTazele(); },
  /* --- takım kadrosu: numaraları elle dağıt --- */
  _katTazele(){
    const k = el("cdKat"); if (k) k.innerHTML = katHtml();
  },
  _takimBul(no){ return D.katilim.find(k => (k.uyeler || []).indexOf(no) >= 0) || null; },
  /* numaraya dokun: al / bırak / yer değiştir */
  noSec(no){
    no = Number(no);
    if (D.tasinan == null){ D.tasinan = no; COFF._katTazele(); return; }
    if (D.tasinan === no){ D.tasinan = null; COFF._katTazele(); return; }
    COFF.noDegistir(D.tasinan, no);
    D.tasinan = null;
    COFF._katTazele();
  },
  /* iki numaranın takımlarını değiştir (takım mevcutları korunur) */
  noDegistir(a, b){
    a = Number(a); b = Number(b);
    const ta = COFF._takimBul(a), tb = COFF._takimBul(b);
    if (!ta || !tb || ta === tb) return;
    const ia = ta.uyeler.indexOf(a), ib = tb.uyeler.indexOf(b);
    ta.uyeler[ia] = b; tb.uyeler[ib] = a;
    ta.uyeler.sort((x, y) => x - y); tb.uyeler.sort((x, y) => x - y);
    ta.alt = ta.uyeler.join(" · "); tb.alt = tb.uyeler.join(" · ");
  },
  /* numarayı başka takıma taşı (mevcutlar değişir) */
  noTasi(no, hedefId){
    no = Number(no);
    const kaynak = COFF._takimBul(no);
    const hedef = D.katilim.find(k => k.id === hedefId);
    if (!hedef || !kaynak || kaynak === hedef) return false;
    if (kaynak.uyeler.length <= 1){ uyar("Bir takım boş kalamaz."); return false; }
    kaynak.uyeler.splice(kaynak.uyeler.indexOf(no), 1);
    hedef.uyeler.push(no);
    hedef.uyeler.sort((x, y) => x - y);
    kaynak.alt = kaynak.uyeler.join(" · ");
    hedef.alt = hedef.uyeler.join(" · ");
    return true;
  },
  takimaTasi(hedefId){
    if (D.tasinan == null) return;
    COFF.noTasi(D.tasinan, hedefId);
    D.tasinan = null;
    COFF._katTazele();
  },
  /* --- fare ile sürükle-bırak --- */
  _suruklBasla(e, no){
    D.tasinan = Number(no);
    try { e.dataTransfer.setData("text/plain", String(no)); e.dataTransfer.effectAllowed = "move"; } catch(x){}
    const t = e.currentTarget || e.target;
    if (t && t.classList) t.classList.add("tasiniyor");
  },
  _suruklBitir(){
    D.tasinan = null;
    document.querySelectorAll(".cdw-takim.hedef").forEach(x => x.classList.remove("hedef"));
    COFF._katTazele();
  },
  _uzerinde(e, kart){
    if (D.tasinan == null) return;
    e.preventDefault();
    try { e.dataTransfer.dropEffect = "move"; } catch(x){}
    if (kart && kart.dataset.tkm !== (COFF._takimBul(D.tasinan) || {}).id) kart.classList.add("hedef");
  },
  _birak(e, kart, hedefId){
    e.preventDefault();
    if (kart) kart.classList.remove("hedef");
    let no = D.tasinan;
    try { const v = e.dataTransfer.getData("text/plain"); if (v) no = Number(v); } catch(x){}
    if (no == null) return;
    /* doğrudan bir numaranın üstüne bırakıldıysa yer değiştir */
    const ust = e.target && e.target.closest ? e.target.closest(".cdw-no") : null;
    if (ust && ust.dataset && ust.dataset.no && Number(ust.dataset.no) !== Number(no))
      COFF.noDegistir(no, Number(ust.dataset.no));
    else COFF.noTasi(no, hedefId);
    D.tasinan = null;
    COFF._katTazele();
  },

  /* --- sınıf sistemi: adları elle ekle / sil --- */
  sinifEkle(){
    const g = el("cdSinifAd"); if (!g) return;
    const ad = String(g.value || "").trim();
    if (!ad){ uyar("Önce sınıf adını yaz."); g.focus(); return; }
    const var_ = sinifAdlari();
    if (var_.some(x => x.toLocaleLowerCase("tr") === ad.toLocaleLowerCase("tr"))){
      uyar("Bu sınıf zaten listede."); g.value = ""; g.focus(); return;
    }
    if (var_.length >= 24){ uyar("En fazla 24 sınıf eklenebilir."); return; }
    var_.push(ad);
    D.sinifAdlari = var_.join(", ");
    listeKur();
    COFF.ciz();
    const y = el("cdSinifAd"); if (y){ y.value = ""; y.focus(); }
  },
  sinifSil(i){
    const var_ = sinifAdlari();
    if (i < 0 || i >= var_.length) return;
    var_.splice(i, 1);
    D.sinifAdlari = var_.join(", ");
    listeKur();
    COFF.ciz();
  },

  turKur(){
    if (!setKur()){ uyar("Bu derste seçtiğin çeşitlerde soru yok."); return false; }
    COFF.ciz();
  },

  /* ---- sunum ---- */
  sunumAc(){
    if (!D.sorular.length) return;
    D.aktif = 0; D.cevapAcik = false; D.siralamaAcik = false; D.bitti = false;
    D.sureEk = 0;
    D.sayacKalan = soruSuresi(D.sorular[0]);
    COFF._sunumCiz();
    document.addEventListener("keydown", COFF._tus);
    COFF._geriSayim();
  },
  /* Yarışmadan çıkmadan önce sor: puanlar kaybolacak. */
  cikSor(){
    const k = el("cdSunum"); if (!k) return;
    if (k.querySelector(".cd-cik-onay")) return;
    COFF._sayacDur();
    const ov = document.createElement("div");
    ov.className = "cd-cik-onay";
    ov.innerHTML = `
      <div class="cd-onay-kutu">
        <h3>Yarışmadan çıkılsın mı?</h3>
        <p>Bu turun puanları silinir ve kurulum ekranına dönersin.
           Sorular duruyor, istersen yeniden başlatabilirsin.</p>
        <div class="cd-onay-tuslar">
          <button class="cd-tus" onclick="COFF.cikVazgec()">Vazgeç</button>
          <button class="cd-tus cd-tus-kirmizi" onclick="COFF.sunumKapat()">Evet, çık</button>
        </div>
      </div>`;
    k.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add("gorun"));
  },
  siralamaKapat(){ D.siralamaAcik = false; COFF._sunumCiz(); },
  siralamaAc(){
    /* Son sorunun ardından doğrudan kapanış sıralaması gelsin. */
    if (D.aktif + 1 >= SORULAR().length){ COFF.bitir(); return; }
    D.siralamaAcik = true;
    COFF._sunumCiz();
    sesCal([{ f: 523, t: 0, d: 0.12 }, { f: 784, t: 0.10, d: 0.22 }], 0.16);
  },
  /* Son sorudan sonra: kapanış sıralaması */
  bitir(){
    if (D.mac){ COFF.macBitir(); return; }
    D.siralamaAcik = true; D.bitti = true;
    COFF._sunumCiz();
    sesCal([{ f: 523, t: 0, d: 0.14 }, { f: 659, t: 0.12, d: 0.14 },
            { f: 784, t: 0.24, d: 0.14 }, { f: 1047, t: 0.36, d: 0.34 }], 0.2);
  },
  cikVazgec(){
    const o = document.querySelector(".cd-cik-onay");
    if (o){ o.classList.remove("gorun"); setTimeout(() => o.remove(), 200); }
  },
  sunumKapat(){
    if (D.gsId){ clearInterval(D.gsId); D.gsId = null; }
    if (D.gsT){ clearTimeout(D.gsT); D.gsT = null; }
    if (D.pkT){ clearTimeout(D.pkT); D.pkT = null; }
    COFF._sayacDur();
    document.removeEventListener("keydown", COFF._tus);
    const s = el("cdSunum"); if (s) s.remove();
    D.cevapAcik = false; D.siralamaAcik = false; D.bitti = false;
    if (D.turnuva){ D.mac = null; COFF.turnuvaCiz(); return; }
    COFF.ciz();
  },
  _sunumCiz(){
    if (D.pkT){ clearTimeout(D.pkT); D.pkT = null; }
    const eski = el("cdSunum"); if (eski) eski.remove();
    document.body.insertAdjacentHTML("beforeend", sunumHtml());
  },
  _tus(e){
    const k = e.key;
    const pk = document.querySelector(".cd-pankart-ov");
    if (pk && (k === " " || k === "Escape" || k === "Enter")){
      e.preventDefault();
      if (pk.classList.contains("kaldirma") && k !== "Escape") COFF.pankartIleri();
      else COFF.pankartKapat();
      return;
    }
    if (k === " "){ e.preventDefault(); COFF.cevapAc(); }
    else if (k === "s" || k === "S"){ COFF.sayacBasDur(); }
    else if (k === "p" || k === "P"){ COFF.yanAcKapa(); }
    else if (k === "Escape"){ COFF.cikSor(); }
  },
  cevapAc(){
    if (D.cevapAcik) return;
    D.cevapAcik = true;
    D.yanAcik = true;              // soru biter, puan tablosu açılır
    COFF._sayacDur();
    COFF._sunumCiz();
    COFF._pankartAc();
  },
  /* Cevap iki perdede açılır: önce öğrenciler defterlerini kaldırır, sonra
     doğru cevap pankartta açılır. Pankart kendiliğinden kapanmaz — öğretmen
     "Puanlara geç" deyince ya da ekrana dokununca kapanır. */
  _pankartAc(){
    const k = el("cdSunum"); if (!k) return;
    const s = SORULAR()[D.aktif]; if (!s) return;
    const metin = dogruMetin(s);
    if (!metin) return;
    const esle = (s.bicim === "eslestir") && (s.ciftler || []).length;
    const govde = esle
      ? ciftlerHtml(s, "cd-pk")
      : `<span class="cd-pk-metin${arMi(metin) ? " ar" : ""}${
          metin.length > 96 ? " cok-uzun" : (metin.length > 52 ? " uzun" : "")
        }" dir="auto">${kacisi(metin)}</span>`;
    if (D.pkT){ clearTimeout(D.pkT); D.pkT = null; }
    const eski = k.querySelector(".cd-pankart-ov"); if (eski) eski.remove();
    const kimNot = D.bicim === "kisi" ? "Herkes cevabını göstersin!"
                 : D.bicim === "sinif" ? (D.katilim.length > 1
                     ? "Sınıflar cevaplarını göstersin!" : "Sınıf cevabını göstersin!")
                 : "Takımlar cevaplarını göstersin!";
    const ov = document.createElement("div");
    ov.className = "cd-pankart-ov kaldirma";
    ov.innerHTML = `
      <div class="cd-pk-perde cd-pk-perde1" onclick="COFF.pankartIleri()">
        ${CIZ.kaldiranlar}
        <span class="cd-pk-not">${kacisi(kimNot)}</span>
      </div>
      <div class="cd-pk-perde cd-pk-perde2" onclick="COFF.pankartKapat()">
        <div class="cd-pankart">
          ${CIZ.pankart}
          <div class="cd-pk-yazi${esle ? " esle" : ""}">
            <span class="cd-pk-etiket">Doğru cevap</span>
            ${govde}
          </div>
        </div>
        <button type="button" class="cd-tus cd-tus-ana cd-pk-kapat"
                onclick="event.stopPropagation();COFF.pankartKapat()">Puanlara geç ›</button>
      </div>`;
    k.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add("gorun"));
    sesCal([{ f: 494, t: 0, d: 0.1 }, { f: 659, t: 0.1, d: 0.18 }], 0.14);
    D.pkT = setTimeout(() => { D.pkT = null; COFF.pankartIleri(); }, 1900);
  },
  /* 1. perdeden 2. perdeye: pankart açılır ve açık kalır. */
  pankartIleri(){
    if (D.pkT){ clearTimeout(D.pkT); D.pkT = null; }
    const o = document.querySelector(".cd-pankart-ov");
    if (!o || !o.classList.contains("kaldirma")) return;
    o.classList.remove("kaldirma");
    o.classList.add("acildi");
    sesCal([{ f: 587, t: 0, d: 0.1 }, { f: 784, t: 0.09, d: 0.1 },
            { f: 988, t: 0.18, d: 0.26 }], 0.15);
  },
  pankartKapat(){
    if (D.pkT){ clearTimeout(D.pkT); D.pkT = null; }
    const o = document.querySelector(".cd-pankart-ov");
    if (!o) return;
    o.classList.remove("gorun", "acildi", "kaldirma");
    o.classList.add("kapaniyor");
    setTimeout(() => { if (o.parentNode) o.remove(); }, 320);
  },
  ileri(){
    /* Cevap gösterilmeden ve herkes değerlendirilmeden sonraki soruya geçilmez. */
    if (!D.siralamaAcik && ileriKilitli()){ uyarSunum(ileriNeden()); return; }
    /* Soru bitti: önce herkesin puanı tam ekranda görünsün. */
    if (D.cevapAcik && !D.siralamaAcik){ COFF.siralamaAc(); return; }
    D.siralamaAcik = false;
    if (D.aktif + 1 >= SORULAR().length){ COFF.bitir(); return; }
    D.aktif++; D.cevapAcik = false; D.yanAcik = false; D.siralamaAcik = false;
    D.sureEk = 0;
    D.sayacKalan = soruSuresi(SORULAR()[D.aktif]);
    COFF._sayacDur(); COFF._sunumCiz(); COFF._sayacBaslat();
  },
  geri(){
    if (!D.aktif) return;
    D.aktif--; D.cevapAcik = false; D.yanAcik = false; D.siralamaAcik = false;
    D.sureEk = 0;
    D.sayacKalan = soruSuresi(SORULAR()[D.aktif]);
    COFF._sayacDur(); COFF._sunumCiz(); COFF._sayacBaslat();
  },
  sayacBasDur(){
    if (D.sayacId){ COFF._sayacDur(); }
    else {
      D.sayacId = setInterval(() => {
        D.sayacKalan--;
        const s = el("cdSayac");
        if (s){ s.textContent = cdSure(D.sayacKalan); s.classList.toggle("az", D.sayacKalan <= 10); }
        const c = document.querySelector("#cdSunum .cd-ilerleme");
        if (c){
          const tam = toplamSure(SORULAR()[D.aktif]);
          const i = c.querySelector("i");
          if (i) i.style.width = Math.max(0, Math.min(100, (D.sayacKalan / tam) * 100)) + "%";
          c.classList.toggle("az", D.sayacKalan <= 10);
        }
        if (D.sayacKalan > 0 && D.sayacKalan <= 5) sesTik(D.sayacKalan);
        if (D.sayacKalan <= 0){ sesSureBitti(); COFF._sayacDur(); COFF.cevapAc(); }
      }, 1000);
    }
    const t = el("cdSayacTus"); if (t) t.textContent = D.sayacId ? "⏸ Duraklat" : "▶ Süreyi başlat";
  },
  _sayacDur(){ if (D.sayacId){ clearInterval(D.sayacId); D.sayacId = null; } },
  /* Yeni soru açılınca süre beklemeden işlemeye başlasın. */
  _sayacBaslat(){ if (!D.sayacId && !D.cevapAcik && D.sayacKalan > 0) COFF.sayacBasDur(); },
  /* Sınıfın işi yetişmediyse öğretmen süreye 15 saniye ekleyebilir. */
  sureEkle(n){
    if (D.cevapAcik) return;
    D.sureEk = (D.sureEk || 0) + n;
    D.sayacKalan += n;
    const s = el("cdSayac");
    if (s){ s.textContent = cdSure(D.sayacKalan); s.classList.toggle("az", D.sayacKalan <= 10); }
    const c = document.querySelector("#cdSunum .cd-ilerleme");
    if (c){
      const tam = toplamSure(SORULAR()[D.aktif]);
      const i = c.querySelector("i");
      if (i) i.style.width = Math.max(0, Math.min(100, (D.sayacKalan / tam) * 100)) + "%";
      c.classList.toggle("az", D.sayacKalan <= 10);
    }
    const e = el("cdSureEkTus");
    if (e){ e.classList.remove("vur"); void e.offsetWidth; e.classList.add("vur"); }
    COFF._sayacBaslat();
  },
  yanAcKapa(){
    D.yanAcik = !D.yanAcik;
    const y = el("cdYan"); if (y) y.classList.toggle("acik", D.yanAcik);
    const k = el("cdSunum"); if (k) k.classList.toggle("yan-acik", D.yanAcik);
  },
  /* + doğru demek, − yanlışlıkla verilen doğruyu geri almak demektir.
     Puan hiçbir zaman eksiye düşmez. */
  puan(id, yon){
    if (yon > 0) COFF.isaretle(id, "d", true);
    else COFF.geriAl(id);
  },
  geriAl(id){
    const k = YAR().find(x => x.id === id); if (!k) return;
    const t = turIsaret();
    const art  = soruPuani(SORULAR()[D.aktif]);
    const eksi = yanlisPuani();
    if (t[id] === "d"){ k.puan -= art; delete t[id]; }
    else if (t[id] === "y"){ k.puan += eksi; delete t[id]; }
    else if (t[id]){ delete t[id]; }              // "bilemedi" işaretini kaldır
    else k.puan -= art;                           // önceki turlardan kalan fazlalık
    if (!eksi) k.puan = Math.max(0, k.puan);      // eksi puan kapalıysa sıfırın altına inmesin
    COFF._panelTazele();
  },
  /* Doğru / bilemedi işareti. ✓ ve ✗ tuşlarında aynı tuşa yeniden basınca
     işaret kalkar; + tuşundan gelindiğinde (zorla=true) doğrudan işaretlenir. */
  isaretle(id, tip, zorla){
    const k = YAR().find(x => x.id === id); if (!k) return;
    const t = turIsaret();
    const eski = t[id] || "";
    const yeni = (!zorla && eski === tip) ? "" : tip;
    const art  = soruPuani(SORULAR()[D.aktif]);
    const eksi = yanlisPuani();
    if (eski === "d") k.puan -= art;               // eski doğruyu geri al
    if (eski === "y") k.puan += eksi;              // eski yanlışın cezasını geri al
    if (yeni === "d") k.puan += art;
    if (yeni === "y") k.puan -= eksi;
    if (!eksi) k.puan = Math.max(0, k.puan);
    if (yeni) t[id] = yeni; else delete t[id];
    COFF._panelTazele();
  },
  _panelTazele(){
    const y = el("cdYan"); if (!y) return;
    const p = y.querySelector(".cd-puan"); if (p) p.innerHTML = puanHtml();
    const n = y.querySelector(".cd-isaret-yuva"); if (n) n.innerHTML = isaretNotu();
    const i = el("cdIleriTus");
    if (i){
      const kilit = ileriKilitli();
      const yeniAcildi = !kilit && i.classList.contains("kilitli");
      i.disabled = kilit;
      i.classList.toggle("kilitli", kilit);
      i.classList.toggle("hazir", !kilit);
      i.title = kilit ? ileriNeden() : "Herkes değerlendirildi — sonraki soruya geçebilirsin";
      /* Son takım da işaretlendiği an tuş bir kez sıçrasın. */
      if (yeniAcildi){
        i.classList.remove("yeni"); void i.offsetWidth; i.classList.add("yeni");
      } else if (kilit) i.classList.remove("yeni");
    }
  },

  /* ---- turnuva ---- */
  turnuvaAc(){
    if (!D.sorular.length){ uyar("Önce soruları hazırla."); return; }
    if (D.katilim.length < 2){ uyar("Turnuva için en az iki yarışmacı gerekir."); return; }
    D.katilim.forEach(k => k.puan = 0);
    D.turPuan = {}; D.mac = null;
    turnuvaKur(D.turnuva ? D.turnuva.macSoru : 3);
    COFF.turnuvaCiz();
  },
  turnuvaYenidenKur(){
    D.katilim.forEach(k => k.puan = 0);
    D.turPuan = {}; D.mac = null;
    turnuvaKur(D.turnuva ? D.turnuva.macSoru : 3);
    COFF.turnuvaCiz();
  },
  turnuvaCiz(){
    const e = el("ekranCevrimdisi");
    if (!e || !D.turnuva) return;
    ekranGoster("ekranCevrimdisi");
    e.innerHTML = semaHtml();
  },
  macSoruDegis(fark){
    const t = D.turnuva; if (!t || turnuvaBasladi()) return;
    t.macSoru = Math.max(1, Math.min(9, t.macSoru + fark));
    COFF.turnuvaCiz();
  },
  /* Sıradaki maçı sunum ekranında başlat: yalnız iki rakip puanlanır. */
  macBaslat(){
    const sm = siradakiMac(); if (!sm) return;
    const t = D.turnuva;
    const havuz = D.sorular;
    if (!havuz.length){ uyar("Önce soruları hazırla."); return; }
    const sorular = [];
    for (let i = 0; i < t.macSoru; i++) sorular.push(havuz[(t.soruImleci + i) % havuz.length]);
    t.soruImleci = (t.soruImleci + t.macSoru) % havuz.length;
    D.mac = { ti: sm.ti, mi: sm.mi, yarisan: [sm.m.a, sm.m.b], sorular: sorular, ek: 0, sonuc: null };
    D.turPuan = {};
    D.aktif = 0; D.cevapAcik = false; D.siralamaAcik = false; D.bitti = false; D.yanAcik = true;
    D.sureEk = 0;
    D.sayacKalan = soruSuresi(sorular[0]);
    COFF._sunumCiz();
    document.addEventListener("keydown", COFF._tus);
    COFF._geriSayim();
  },
  /* Maçın son sorusu bitti: doğruları say, kazananı üst tura taşı.
     Berabereyse maç bitmez — bir "altın soru" eklenir. */
  macBitir(){
    const t = D.turnuva;
    const m = t.turlar[D.mac.ti][D.mac.mi];
    const s = macSkor();
    m.sa = s.sa; m.sb = s.sb;
    if (s.sa === s.sb){
      const havuz = D.sorular;
      D.mac.sorular.push(havuz[t.soruImleci % havuz.length]);
      t.soruImleci = (t.soruImleci + 1) % havuz.length;
      D.mac.ek++;
      D.aktif = D.mac.sorular.length - 1;
      D.cevapAcik = false; D.siralamaAcik = false; D.yanAcik = false;
      D.sureEk = 0;
      D.sayacKalan = soruSuresi(D.mac.sorular[D.aktif]);
      COFF._sayacDur(); COFF._sunumCiz(); COFF._sayacBaslat();
      uyarSunum("Berabere! Altın soru — bileni maçı kazanır.");
      sesCal([{ f:392, t:0, d:0.12 }, { f:523, t:0.11, d:0.2 }], 0.16);
      return;
    }
    const kaz = (s.sa > s.sb) ? m.a : m.b;
    m.kazanan = kaz; m.bitti = true;
    turnuvaYukselt(D.mac.ti, D.mac.mi, kaz);
    turnuvaBaylariGec();
    D.mac.sonuc = { kazanan: kaz, sa: s.sa, sb: s.sb };
    D.siralamaAcik = true; D.bitti = true;
    COFF._sayacDur(); COFF._sunumCiz();
    sesCal([{ f:523, t:0, d:0.14 }, { f:659, t:0.12, d:0.14 },
            { f:784, t:0.24, d:0.14 }, { f:1047, t:0.36, d:0.34 }], 0.2);
  },
  macKapat(){ COFF.sunumKapat(); },
  /* Şemadan çıkış: yarıda kalmışsa önce sor. */
  turnuvaKapat(){
    if (D.turnuva && turnuvaBasladi() && !D.turnuva.sampiyon){
      const k = el("ekranCevrimdisi"); if (!k) return;
      if (k.querySelector(".cd-cik-onay")) return;
      const ov = document.createElement("div");
      ov.className = "cd-cik-onay";
      ov.innerHTML = `
        <div class="cd-onay-kutu">
          <h3>Turnuva kapatılsın mı?</h3>
          <p>Eşleşmeler ve maç sonuçları silinir, kurulum ekranına dönersin.
             Sorular duruyor, istersen yeni bir turnuva kurabilirsin.</p>
          <div class="cd-onay-tuslar">
            <button class="cd-tus" onclick="COFF.turnuvaVazgec()">Vazgeç</button>
            <button class="cd-tus cd-tus-kirmizi" onclick="COFF.turnuvaBitir()">Evet, kapat</button>
          </div>
        </div>`;
      k.appendChild(ov);
      requestAnimationFrame(() => ov.classList.add("gorun"));
      return;
    }
    COFF.turnuvaBitir();
  },
  turnuvaVazgec(){
    const o = document.querySelector("#ekranCevrimdisi .cd-cik-onay");
    if (o){ o.classList.remove("gorun"); setTimeout(() => o.remove(), 200); }
  },
  turnuvaBitir(){
    D.turnuva = null; D.mac = null; D.turPuan = {};
    D.katilim.forEach(k => k.puan = 0);
    COFF.adimGit(adimNo("bas"));
  },

  /* ---- pdf ---- */
  pdf(tur){
    /* Ders sekmesinden de çıktı alınabiliyor: soru seti hazır değilse
       (ya da seçimler değiştiyse) önce burada kurulur. */
    if (!D.konuId || !seciliSorular().length){ uyar("Önce bir ders seç."); return; }
    if (turGerekli() && !setKur()){ uyar("Bu derste seçtiğin çeşitlerde soru yok."); return; }
    if (!D.katilim.length) listeKur();
    CDPDF.uret(tur, D);
    const n1 = el("cdPdfDurum1");
    if (n1){ n1.className = "cdw-pdf-durum ok";
      n1.textContent = D.sorular.length + " soruluk PDF hazırlandı."; }
  },

  _D: D
};

window.CDTR = { unite: UNITE_TR, ders: DERS_TR, soruBaslik: soruBaslik };
window.COFF = COFF;

/* Bu dosya bilgiyarismasi.js'ten sonra yüklenir; mod kapısı zaten çizildiyse
   Türkçe ünite notunu yerine oturtmak için bir kez daha çizdiriyoruz. */
(function(){
  /* Mod kapısı kaldırıldı: açılışta doğrudan ortak kurulum gelir,
     çevrimiçi/çevrimdışı seçimi 1. adımdaki büyük anahtarla yapılır.
     Açılış bir yerde takılırsa "Yükleniyor" ekranda kalmasın diye
     bir de gecikmeli emniyet kontrolü var. */
  const gorunur = id => { const e = el(id); return e && !e.classList.contains("gizli"); };
  const kurulumGerekli = () => {
    if (gorunur("ekranKatil") || gorunur("ekranTakim")) return false;   // öğrenci tarafı
    if (gorunur("ekranOyunAdmin") || gorunur("ekranTakimlar")) return false; // oyun sürüyor
    if (gorunur("ekranCevrimdisi")) return false;                       // zaten açık
    return true;
  };
  const emniyet = () => { if (kurulumGerekli()) COFF.ac(D.mod); };

  const yaz = () => {
    const k = el("ekranMod");
    if ((k && !k.classList.contains("gizli")) || gorunur("ekranYukleniyor")) COFF.ac(D.mod);
    setTimeout(emniyet, 1500);
    setTimeout(emniyet, 4000);
    switchTazele("canli");
    /* Ders listesi açılışta CDTR sözlüğü yüklenmeden çizilmiş olabilir;
       Türkçe adların yerine oturması için bir kez yeniden çizdiriyoruz. */
    try { if (BIY._konulariHazirla) BIY._konulariHazirla(); } catch(e){}
    /* Lobiden ya da oyundan çıkınca eski Arapça menü yerine ortak kuruluma
       dönülsün — kurulum tek sayfa kalsın. */
    /* Akordiyonda bir üniteye basınca başlığı listenin tepesine yumuşakça çek. */
    try {
      if (BIY.uniteAc && !BIY.uniteAc._cdSarmal){
        const eskiAc = BIY.uniteAc;
        const sarmalAc = function(no){
          const r = eskiAc.apply(BIY, arguments);
          setTimeout(() => {
            if (state.uniteAcik !== no) return;          // kapandıysa kaydırma
            const bas = document.querySelector(
              '#konuSeciciListe .biy-ak-satir[data-u="' + no + '"]');
            if (!bas) return;
            const kap = bas.closest("#konuSeciciListe");
            if (!kap) return;
            const hedef = kap.scrollTop + bas.getBoundingClientRect().top
                        - kap.getBoundingClientRect().top;
            yumusakKaydir(kap, hedef, 420);
          }, 40);
          return r;
        };
        sarmalAc._cdSarmal = true;
        BIY.uniteAc = sarmalAc;
      }
    } catch(e){ console.warn("[CD] ünite kaydırma:", e); }
    try {
      if (BIY.anasayfa && !BIY.anasayfa._cdSarmal){
        const eski = BIY.anasayfa;
        const sarmal = function(){
          const r = eski.apply(BIY, arguments);
          ekranGoster("ekranCevrimdisi"); COFF.ciz();
          return r;
        };
        sarmal._cdSarmal = true;
        BIY.anasayfa = sarmal;
      }
    } catch(e){ console.warn("[CD] anasayfa sarmalı:", e); }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", yaz);
  else setTimeout(yaz, 0);
})();
window.__CDD = D;   // test kancası
})();
