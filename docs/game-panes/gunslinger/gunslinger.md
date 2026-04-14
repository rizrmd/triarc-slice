Renzo, the Gunslinger - Ammo & Shoot

## Resource Utama

### Ammo (0–3 bullet)
- Tiap action card yang dimainkan **memuat 1 bullet** ke chamber sesuai elemen kartu
- Kapasitas maksimum **3 bullet**
- Bullet disusun tumpuk: yang terakhir dimuat ada di **puncak**

## Payoff: Shoot

Renzo hanya punya **satu aksi payoff: Shoot**.

- Melepas **semua bullet** yang sedang dimuat sekaligus
- **Damage** = jumlah bullet yang dilepas (1x / 2x / 3x)
- **Efek elemen** = elemen bullet **paling atas** (yang terakhir dimuat)
- Setelah Shoot, chamber reset ke kosong

## Element Bullet Types

| Element | Efek (saat jadi bullet puncak) |
|---------|-------------------------------|
| 🔥 Fire | Ledakan kecil, damage bonus |
| 💨 Wind | Tembakan menembus, bonus tempo |
| 🪨 Earth | Impact berat, stagger |
| ✨ Light | Akurasi+, mark target untuk follow-up |
| 🌑 Shadow | Execution damage, anti-heal |
| ❄️ Ice | Slow, pin target |

## Keputusan Pemain

Hanya dua keputusan inti setiap turn:

1. **Tembak sekarang atau load lagi?** — jab cepat vs. burst besar
2. **Elemen apa yang ditaruh di puncak sebelum Shoot?** — karena itu yang menentukan efek

## Contoh Urutan Main

### Skenario A — Quick Pressure
Chamber mulai kosong: `[ _ _ _ ]`

1. Turn 1: main kartu Fire 🔥 → `[🔥 _ _]`
2. Turn 2: **Shoot** → lepas 1 bullet, damage kecil, efek Fire (ledakan kecil). Reset `[_ _ _]`
3. Turn 3: main kartu Wind 💨 → `[💨 _ _]`, lalu Shoot lagi kalau perlu tempo

→ Gaya **jab cepat**, tiap turn tembak.

### Skenario B — Load Penuh (Sniper)

1. Turn 1: main Earth 🪨 → `[🪨 _ _]`
2. Turn 2: main Shadow 🌑 → `[🪨 🌑 _]`
3. Turn 3: main Fire 🔥 → `[🪨 🌑 🔥]` (penuh)
4. Turn 4: **Shoot** → 3x damage, efek puncak = **Fire** (ledakan besar). Reset `[_ _ _]`

→ Gaya **sniper**, nahan 3 turn buat burst besar.

### Skenario C — Ganti Elemen Puncak di Detik Terakhir

1. Turn 1: Fire 🔥 → `[🔥 _ _]`
2. Turn 2: Fire 🔥 → `[🔥 🔥 _]` (niatnya ledakan besar)
3. Turn 3: musuh tiba-tiba lari → main Ice ❄️ → `[🔥 🔥 ❄️]`
4. **Shoot** → 3x damage, efek puncak = **Ice** (slow/pin), musuh ketangkap

→ Keputusan real: *"elemen apa yang aku taruh terakhir?"* karena itu yang keluar.

## Edge Case — Ammo Penuh

Kalau chamber sudah `[🔥 🔥 🔥]` dan pemain memainkan kartu baru:

- **Forced Shoot**: chamber otomatis dilepas dulu (damage 3x, efek = puncak lama), lalu kartu baru masuk ke chamber 1.

Aturan ini dipilih supaya tidak ada state tersembunyi — pemain selalu tahu persis isi chamber.

## Inti Gameplay

Chamber Renzo menjaga identitas **marksman teknis** tanpa beban menghafal resep kombinasi. Kekuatan datang dari dua hal sederhana:

- **Timing** — kapan melepas peluru
- **Elemen puncak** — elemen apa yang berada di atas saat ditembak

Dua keputusan ini cukup untuk menghasilkan tension antara *jab cepat* dan *burst besar*, tanpa perlu grid kompleks atau daftar combo.
