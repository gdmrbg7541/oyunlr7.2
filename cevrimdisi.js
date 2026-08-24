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
  katilim: [],                 // {id, ad, alt, renk, puan}
  sorular: [],
  aktif: 0, cevapAcik: false, sayacKalan: 0, sayacId: null, sure: 30,
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
    if (k && BIY.konuSec) BIY.konuSec(k.id);
    if (BIY.setSoruSayisi && D.soruSayisi) BIY.setSoruSayisi(D.soruSayisi);
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

/* Süre artık zorluğa göre: 4. adımdaki yıldız akordiyonunda elle ayarlanır. */
function soruSuresi(s){
  try { if (BIY._soruSuresi) return BIY._soruSuresi(s); } catch(e){}
  return D.sure;
}
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
  koy("cdPanelSure", PANEL.sure);
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

function switchBuyukHtml(){
  const yol = [
    ["cevrimdisi", "Çevrimdışı", "Sınıfta kâğıt ve tahta ile. İnternet gerekmez.", CIZ.modCevrimdisi],
    ["canli",      "Canlı",      "Öğrenciler karekodu telefonla okutup katılır.",  CIZ.modCanli]
  ];
  return `
  <div class="cdw-mod" role="group" aria-label="Yarışma modu">
    ${yol.map(([v, ad, not, ciz]) => `
      <button type="button" class="cdw-mod-yol${D.mod === v ? " ac" : ""}"
              onclick="COFF.modDegis('${v}')" aria-pressed="${D.mod === v}">
        <span class="cdw-mod-tik">✓</span>
        ${ciz}
        <b>${ad}</b>
        <small>${not}</small>
      </button>`).join("")}
  </div>`;
}

/* ---------- küçük mod anahtarı (üst çubuk) ---------- */
function switchHtml(aktif, pasif){
  const yol = [["cevrimdisi","Çevrimdışı","Kâğıt ve tahta"], ["canli","Canlı","Telefonla katılım"]];
  const ipucu = pasif ? "Mod 1. adımda seçilir" : "";
  return `<div class="cdw-switch${pasif?" pasif":""}" role="group" aria-label="Yarışma modu"
       title="${ipucu}">
    ${yol.map(([v, ad, not]) => `<button type="button" class="cdw-sw${aktif===v?" ac":""}"
        ${pasif ? "disabled" : `onclick="COFF.modDegis('${v}')"`}
        aria-pressed="${aktif===v}" title="${pasif ? ipucu : not}">
        <span class="cdw-sw-ad">${ad}</span></button>`).join("")}
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
const ADIM_CD    = [["bicim","Kimler yarışacak?"], ["liste","Sınıf listesi"],
                    ["ders","Ders ve sorular"], ["bas","Başlat"]];
const ADIM_CANLI = [["bicim","Kimler yarışacak?"],
                    ["ders","Ders ve sorular"], ["bas","Başlat"]];
function adimlar(){
  if (D.mod === "canli") return ADIM_CANLI;
  /* Sınıf sisteminde 2. adım sıra numarası değil, sınıf adları alır. */
  if (D.bicim === "sinif")
    return ADIM_CD.map(a => a[0] === "liste" ? ["liste","Yarışan sınıflar"] : a);
  return ADIM_CD;
}
function adimAnahtar(){ const a = adimlar()[D.adim - 1]; return a ? a[0] : "bicim"; }
function adimNo(anahtar){
  const i = adimlar().findIndex(a => a[0] === anahtar);
  return i >= 0 ? i + 1 : 1;
}

function kurulumHtml(){
  const yol = adimlar();
  const son = D.adim >= yol.length;
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
      <ol class="cdw-yol">
        ${yol.map(([k, a], i) => {
          const n = i + 1;
          const durum = n < D.adim ? "bitti" : (n === D.adim ? "simdi" : "");
          return `<li class="${durum}">
            <button type="button" class="cdw-yol-tus" ${n <= D.adim ? "" : "disabled"}
                    onclick="COFF.adimGit(${n})">
              <span class="cdw-yol-no">${n < D.adim ? "✓" : n}</span>
              <span class="cdw-yol-ad">${a}</span>
            </button></li>`;
        }).join("")}
      </ol>
      ${D.adim === 1 ? "" : switchHtml(D.mod, true)}
    </div>

    <div class="cdw-govde cdw-govde-${adimAnahtar()}">${adimHtml()}</div>

    <div class="cdw-alt">
      <span class="cdw-adim-not">${D.adim}. adım / ${yol.length}</span>
      <span class="cdw-uyari" id="cdUyari"></span>
      <span class="cdw-bosluk"></span>
      ${son ? `<span class="cdw-bitti-not">Her şey hazır 🎉</span>`
            : `<button type="button" class="cdw-tus cdw-tus-ana" onclick="COFF.adimIleri()">
                 ${adimAnahtar() === "ders" ? "Soruları hazırla ›" : "İleri ›"}</button>`}
    </div>
  </div>`;
}

function adimHtml(){
  const k = adimAnahtar();
  if (k === "bicim") return adim1();
  if (k === "liste") return adim2();
  if (k === "ders")  return adim3();
  return D.mod === "canli" ? adimCanliBas() : adim5();
}

/* --- 1 · yarışma biçimi ---
   Canlı taraftaki üç kartın ta kendisi: aynı çizimler, aynı Arapça adlar.
   Artık iki modda da bu ekran geliyor; tıklayınca yalnız seçim yapılır. */
const menuKartlar = () => [
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
        <span class="biy-menu-ad">Sınıf sistemi</span>
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
        <span class="biy-menu-ad">Takım sistemi</span>
        <span class="biy-menu-ar">نِظام الفِرَق</span>
        <span class="biy-menu-desc">Her takıma bir karekod · takımlar yarışır</span>
        <span class="cdw-menu-tik">✓</span>
      </button>`,
  `<button class="biy-menu-kart${D.bicim==='kisi'?' cdw-secili':''}${
        D.mod === "cevrimdisi" ? " cdw-kart-pasif" : ""}"
        ${D.mod === "cevrimdisi" ? 'disabled title="Bireysel sistem yalnız çevrimiçi yarışmada kullanılır"' : ""}
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
        <span class="biy-menu-ad">Bireysel sistem</span>
        <span class="biy-menu-ar">نِظام الأَفْراد</span>
        <span class="biy-menu-desc">${D.mod === "cevrimdisi"
          ? "Yalnız çevrimiçi · puanı sistem işler"
          : "Tek karekod · herkes kendi adıyla girer"}</span>
        ${D.mod === "cevrimdisi"
          ? `<span class="cdw-menu-kilit">Çevrimiçine geç</span>` : `<span class="cdw-menu-tik">✓</span>`}
      </button>`
];

function adim1(){
  return `
  <div class="cdw-sahne cdw-genis">
    ${switchBuyukHtml()}
    <h2 class="cdw-bas cdw-bas-ince">Kimler yarışacak?</h2>
    <p class="cdw-alt-bas cdw-alt-ar">نِظام المُسابَقَة</p>
    <div class="biy-menu cdw-menu" dir="rtl">
      ${menuKartlar().join("")}
    </div>
  </div>`;
}

/* --- 2 · sınıf listesi --- */
function adim2(){
  const takimMi = D.bicim === "takim";
  const sinifMi = D.bicim === "sinif";
  const yokSay = String(D.yok || "").split(/[^0-9]+/).filter(Boolean).length;
  const toplam = Math.max(0, Math.max(D.bas, D.son) - Math.max(1, D.bas) + 1) - yokSay;
  const kacSinif = sinifAdlari().length;
  return `
  <div class="cdw-sahne cdw-genis">
    <h2 class="cdw-bas">${sinifMi ? "Yarışan sınıflar" : "Sınıf listesi"}</h2>
    <p class="cdw-alt-bas">${sinifMi
      ? "Hangi sınıflar yarışacak? Adını yaz, ekle; istemediğini ✕ ile çıkar."
      : "Sıra numaralarını yaz, listeyi kuralım."}</p>

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
function adim3(){
  const havuz  = seciliSorular().length;
  const secili = (typeof state !== "undefined" && state.secilenSet) ? state.secilenSet.size : 0;
  return `
  <div class="cdw-sahne cdw-genis cdw-ust-hizali">
    <h2 class="cdw-bas">Hangi dersten soru gelsin?</h2>
    <p class="cdw-alt-bas">Dersi seç; soru sayısını, türünü, zorluğunu ve süreyi de burada ayarla.</p>
    <div class="cdw-panel" id="cdPanelDers"></div>
    <div class="cdw-panel cdw-panel-ayar" id="cdPanelAyar"></div>
    <div class="cdw-panel" id="cdPanelSure"></div>
    <p class="cdw-bilgi">${D.konuId
      ? `Seçtiğin derste <b>${havuz}</b> uygun soru var${secili ? `, havuzdan <b>${secili}</b> soru seçili` : ""}.${
          zorlukOzet() ? ` Zorluk süzgeci: <b>${kacisi(zorlukOzet())}</b>.` : ""}`
      : `Henüz ders seçmedin — yukarıdan bir ders ya da ünitenin tamamını seç.`}
    </p>
  </div>`;
}

/* --- 5 · başlat --- */
function adim5(){
  const kadi = D.bicim === "kisi" ? "Kişi cevap kâğıdı"
             : D.bicim === "sinif" ? "Sınıf cevap kâğıdı" : "Takım yarışma kâğıdı";
  const kacKisi = D.katilim.length;
  const kimNot = D.bicim === "kisi" ? kacKisi + " öğrenci"
               : D.bicim === "sinif" ? (kacKisi > 1 ? kacKisi + " sınıf" : "bütün sınıf")
               : kacKisi + " takım";
  const ders = D.konuId ? dersTr(konuBul(D.konuId) || { id:"", ad:"" }) : "—";
  return `
  <div class="cdw-sahne">
    <h2 class="cdw-bas">Hazır! Şimdi ne yapmak istersin?</h2>
    <div class="cdw-ozet">
      <span><i>Kimler</i>${kacisi(kimNot)}</span>
      <span><i>Ders</i>${kacisi(ders)}</span>
      <span><i>Soru</i>${D.sorular.length} soru</span>
      <span><i>Süre</i>${sureOzet()}</span>
    </div>
    <div class="cdw-secim3 cdw-dort cdw-is">
      <button type="button" class="cdw-kart cdw-is-kart" ${D.sorular.length ? "" : "disabled"}
              onclick="COFF.sunumAc()">
        ${CIZ.perde}
        <b>Tahtaya yansıt</b>
        <small>Sorular tek tek büyük görünür, geri sayım çalışır, cevabı sen açarsın.
          Yazıcı gerekmez; öğrenciler defterine yazar.</small>
        <span class="cdw-is-tus">▶ Başlat</span>
        <span class="cdw-nasil" role="button" tabindex="0"
              onclick="event.stopPropagation();COFF.defterAc()"
              onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();COFF.defterAc();}"
        >Nasıl işler?</span>
      </button>
      <button type="button" class="cdw-kart cdw-is-kart" ${D.sorular.length && D.katilim.length > 1 ? "" : "disabled"}
              onclick="COFF.turnuvaAc()">
        ${CIZ.kupa}
        <b>Turnuva</b>
        <small>Eleme usulü: ikişerli eşleşme, kazanan üst tura. Yarı final, final, kupa.</small>
        <span class="cdw-is-tus">🏆 Şemayı kur</span>
      </button>
      <button type="button" class="cdw-kart cdw-is-kart" ${D.sorular.length ? "" : "disabled"}
              onclick="COFF.pdf('kitapcik')">
        ${CIZ.yazici}
        <b>Soru kitapçığı</b>
        <small>Bütün sorular kâğıtta. Yazıcıdan çıkarıp dağıtabilirsin.</small>
        <span class="cdw-is-tus">⭳ PDF indir</span>
      </button>
      <button type="button" class="cdw-kart cdw-is-kart" ${D.sorular.length ? "" : "disabled"}
              onclick="COFF.pdf('kart')">
        ${CIZ.kart}
        <b>${kacisi(kadi)}</b>
        <small>Boş cevap kâğıdı. Tahtaya yansıtırken cevaplar buraya yazılır.</small>
        <span class="cdw-is-tus">⭳ PDF indir</span>
      </button>
    </div>
    <div class="cdw-pdf-durum" id="cdPdfDurum"></div>
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

function sunumHtml(){
  const s = SORULAR()[D.aktif];
  if (!s) return "";
  const b = (s.bicim || "test");
  let govde = "";
  if (b === "test"){
    const arSik = s.secenekler.some(arMi);
    govde = `<div class="cd-secenekler${arSik?" ar":""}" style="grid-template-columns:repeat(${s.secenekler.length>3?2:1},1fr)">`
      + s.secenekler.map((x,i) => `<div class="cd-secenek${D.cevapAcik && i===s.dogru ? " dogru":""}${arMi(x)?" ar":""}">
          <span class="cd-harf">${HARF[i]}</span><span>${kacisi(x)}</span></div>`).join("") + `</div>`;
  } else if (b === "surukle"){
    const p = D.cevapAcik ? (s.parcalar || []) : (s.karisik || karis(s.parcalar || []));
    govde = `<div class="cd-parcalar">` + p.map(x =>
      `<span class="cd-parca${arMi(x)?" ar":""}">${kacisi(x)}</span>`).join("") + `</div>`;
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
      : `<div class="cd-parcalar">` + (s.tusKarisik || karis(s.tuslar || [])).map(x =>
          `<span class="cd-parca${arMi(x)?" ar":""}">${kacisi(x)}</span>`).join("") + `</div>`;
  }
  const tam = soruSuresi(s) || 1;
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
    <div class="cd-sunum-orta">
      <span class="cd-soru-no" dir="ltr">${D.mac ? kacisi(turAdi(D.mac.ti)) + " · " : ""}Soru ${D.aktif+1} / ${SORULAR().length} · ${kacisi(BICIM_TR[b]||"")}</span>
      <div class="cd-soru${arMi(s.soru)?" ar":""}">${kacisi(s.soru)}</div>
      ${arapcaSatiri(s) ? `<div class="cd-soru ar cd-soru-alt">${kacisi(arapcaSatiri(s))}</div>` : ""}
      ${govde}
    </div>`)}
    <div class="cd-sunum-alt">
      ${ilerlemeHtml()}
      <button class="cd-tus" onclick="COFF.sayacBasDur()" id="cdSayacTus">${D.sayacId?"⏸ Duraklat":"▶ Süreyi başlat"}</button>
      <button class="cd-tus cd-tus-ana" onclick="COFF.cevapAc()">${D.cevapAcik?"Cevap açık":"Cevabı göster"}</button>
      <button class="cd-tus" onclick="COFF.geri()" ${D.aktif?"":"disabled"}>‹ Önceki</button>
      <button class="cd-tus${ileriKilitli() ? " kilitli" : ""}" id="cdIleriTus"
              onclick="COFF.ileri()" ${ileriKilitli() ? "disabled" : ""}
              title="${ileriKilitli() ? kacisi(ileriNeden()) : ""}">
        ${D.aktif+1>=SORULAR().length?(D.mac?"Maçı bitir":"Bitir"):"Sonraki ›"}</button>
      <span class="cd-kisayol">boşluk: cevap · ← →: soru · S: süre · P: puan · +: doğru, −: geri al</span>
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
function isaretNotu(){
  if (!D.cevapAcik)
    return `<span class="cd-isaret-not">Süre bitince <b>Cevabı göster</b>, sonra herkesi işaretle</span>`;
  const n = isaretSayisi(), t = YAR().length;
  const ad = D.bicim === "kisi" ? "öğrenci" : (D.bicim === "sinif" ? "sınıf" : "takım");
  return hepsiIsaretli()
    ? `<span class="cd-isaret-not tamam">Hepsi değerlendirildi · sonraki soruya geçebilirsin</span>`
    : `<span class="cd-isaret-not">${n} / ${t} ${ad} değerlendirildi · ✓ ✗ ya da +/− kullan</span>`;
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
    if (D.adim === 2) sayacTazele();
  },
  bicimSec(v){
    /* Çevrimdışında her öğrenciye tek tek puan vermek zor; bireysel sistem
       yalnız karekodlu (çevrimiçi) yarışmada kullanılabilir. */
    if (v === "kisi" && D.mod === "cevrimdisi"){
      uyar("Bireysel sistem yalnız çevrimiçi yarışmada kullanılır.");
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
    try { BIY.acLobi(BICIM_ES[D.bicim] || "takim"); }
    catch(e){ console.warn("[CD] lobi:", e); uyar("Lobi açılamadı."); }
  },

  /* ---- adım adım gezinme ---- */
  adimGit(n){ D.adim = Math.max(1, Math.min(adimlar().length, n)); COFF.ciz(); },
  adimGeri(){ if (D.adim > 1) COFF.adimGit(D.adim - 1); },
  adimIleri(){
    const k = adimAnahtar();
    if (k === "liste" && D.bicim === "sinif" && !D.katilim.length){
      uyar("En az bir sınıf ekle.");
      const g = el("cdSinifAd"); if (g) g.focus();
      return;
    }
    if (k === "liste" && !D.katilim.length) listeKur();
    if (k === "ders"){
      if (!D.konuId){ uyar("Önce bir ders seç."); return; }
      if (!seciliSorular().length){ uyar("Bu derste seçtiğin çeşitlerde soru yok."); return; }
      D.adim = adimNo("bas");
      COFF.turKur();
      const d5 = el("cdPdfDurum");
      if (d5){ d5.className = "cdw-pdf-durum ok";
        d5.textContent = D.sorular.length + " soru hazırlandı. Yukarıdaki seçeneklerden birini kullan."; }
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
    const e = document.querySelector("#ekranCevrimdisi .cdw-bilgi");
    if (!e){ COFF.ciz(); return; }
    const havuz  = seciliSorular().length;
    const secili = (typeof state !== "undefined" && state.secilenSet) ? state.secilenSet.size : 0;
    e.innerHTML = !D.konuId
      ? `Henüz ders seçmedin — yukarıdan bir ders ya da ünitenin tamamını seç.`
      : `Seçtiğin derste <b>${havuz}</b> uygun soru var${
          secili ? `, havuzdan <b>${secili}</b> soru seçili` : ""}.${
          zorlukOzet() ? ` Zorluk süzgeci: <b>${kacisi(zorlukOzet())}</b>.` : ""}`;
  },
  defterAc(){
    if (!D.sorular.length){ uyar("Önce soruları hazırla."); return; }
    const e = el("ekranCevrimdisi"); if (e) e.innerHTML = defterHtml();
  },
  defterBasla(){ D.yanAcik = true; COFF.sunumAc(); },
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
    const havuz = seciliSorular();
    if (!havuz.length){ uyar("Bu derste seçtiğin çeşitlerde soru yok."); return false; }
    const n = Math.max(1, Math.min(50, D.soruSayisi));
    D.sorular = karis(havuz).slice(0, Math.min(n, havuz.length)).map(soruHazirla);
    D.aktif = 0; D.cevapAcik = false; D.turPuan = {}; D.siralamaAcik = false; D.bitti = false;
    D.katilim.forEach(k => k.puan = 0);
    COFF.ciz();
  },

  /* ---- sunum ---- */
  sunumAc(){
    if (!D.sorular.length) return;
    D.aktif = 0; D.cevapAcik = false; D.siralamaAcik = false; D.bitti = false;
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
    else if (k === "ArrowLeft"){ e.preventDefault(); COFF.ileri(); }
    else if (k === "ArrowRight"){ e.preventDefault(); COFF.geri(); }
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
    D.sayacKalan = soruSuresi(SORULAR()[D.aktif]);
    COFF._sayacDur(); COFF._sunumCiz();
  },
  geri(){
    if (!D.aktif) return;
    D.aktif--; D.cevapAcik = false; D.yanAcik = false; D.siralamaAcik = false;
    D.sayacKalan = soruSuresi(SORULAR()[D.aktif]);
    COFF._sayacDur(); COFF._sunumCiz();
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
          const tam = soruSuresi(SORULAR()[D.aktif]) || 1;
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
    if (t[id] === "d"){ k.puan = Math.max(0, k.puan - 1); delete t[id]; }
    else if (t[id]){ delete t[id]; }              // "bilemedi" işaretini kaldır
    else k.puan = Math.max(0, k.puan - 1);        // önceki turlardan kalan fazlalık
    COFF._panelTazele();
  },
  /* Doğru / bilemedi işareti. ✓ ve ✗ tuşlarında aynı tuşa yeniden basınca
     işaret kalkar; + tuşundan gelindiğinde (zorla=true) doğrudan işaretlenir. */
  isaretle(id, tip, zorla){
    const k = YAR().find(x => x.id === id); if (!k) return;
    const t = turIsaret();
    const eski = t[id] || "";
    const yeni = (!zorla && eski === tip) ? "" : tip;
    if (eski === "d") k.puan = Math.max(0, k.puan - 1);   // eski doğruyu geri al
    if (yeni === "d") k.puan += 1;
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
      i.disabled = kilit;
      i.classList.toggle("kilitli", kilit);
      i.title = kilit ? ileriNeden() : "";
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
      D.sayacKalan = soruSuresi(D.mac.sorular[D.aktif]);
      COFF._sayacDur(); COFF._sunumCiz();
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
  pdf(tur){ CDPDF.uret(tur, D); },

  _D: D
};

window.CDTR = { unite: UNITE_TR, ders: DERS_TR };
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
          if (D.mod === "canli"){ ekranGoster("ekranCevrimdisi"); COFF.ciz(); }
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
