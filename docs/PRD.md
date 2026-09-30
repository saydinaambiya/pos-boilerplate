# Product Requirements Document — POS Boilerplate

| Atribut         | Nilai              |
| --------------- | ------------------ |
| Versi dokumen   | 0.24.0 (draft)     |
| Tanggal         | 2026-09-30         |
| Pemilik         | Owner              |
| Status          | Menunggu review    |
| Dokumen terkait | [BRD.md](./BRD.md) |

## Riwayat Perubahan

| Versi  | Tanggal    | Perubahan                                                                                                                                                                                                                                                                                     |
| ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1.0  | 2026-09-25 | Draft pertama                                                                                                                                                                                                                                                                                 |
| 0.2.0  | 2026-09-25 | Delegasi approval per jenis via permission; total tanpa pembulatan; uang diterima & kembalian tidak disimpan                                                                                                                                                                                  |
| 0.3.0  | 2026-09-25 | Varian warna produk: model varian, stok per varian, pemilih varian di POS, perubahan model data                                                                                                                                                                                               |
| 0.4.0  | 2026-09-25 | Pengaturan tampilan hanya lewat src/config/appearance.ts; daftar nilai yang tersedia                                                                                                                                                                                                          |
| 0.5.0  | 2026-09-25 | Identitas toko & logo dipindah ke config; appearance.ts digabung menjadi src/config/app.config.ts                                                                                                                                                                                             |
| 0.6.0  | 2026-09-25 | Alamat, telepon, email, NPWP, dan footer invoice kembali ke menu Pengaturan owner                                                                                                                                                                                                             |
| 0.7.0  | 2026-09-25 | Budget JS disesuaikan dengan baseline Next.js 16 yang terukur (NFR-PERF-02); contoh config memakai tipe `AppConfig`                                                                                                                                                                           |
| 0.8.0  | 2026-09-26 | Keputusan auth (ADR-0006) dan akses database (ADR-0005); tabel `roles` punya `is_active` untuk FR-RBAC-01                                                                                                                                                                                     |
| 0.9.0  | 2026-09-26 | Kas bon (ADR-0012): permission `kasbon:pay` untuk FR-KSB-03, pelanggan unik per no. HP, cicilan tunai masuk kas shift                                                                                                                                                                         |
| 0.10.0 | 2026-09-28 | Masukan user v1.0: FR-POS-11 (nama pembeli), FR-AUTH-09/10 (batas & daftar perangkat), FR-SET-09 (jam buka), FR-UX-08 (loading global), akun di atas sidebar, §3.16 barang bawaan sales (ADR-0019, ADR-0020)                                                                                  |
| 0.11.0 | 2026-09-28 | Detail produk: merk (FR-CAT-02), motif & ukuran (FR-PRD-06), filter merk & ukuran; istilah "laku" di menu Sales menjadi "terjual" (ADR-0021)                                                                                                                                                  |
| 0.12.0 | 2026-09-28 | Kategori dihapus: filter kasir, daftar produk dan rekap memakai merk; izin `category:manage` menjadi `brand:manage` (ADR-0022)                                                                                                                                                                |
| 0.13.0 | 2026-09-29 | Masukan user v1.1: ketebalan mm (FR-PRD-06), kolom motif, §3.1.2 Roll & potongan (FR-ROL-01..04, ADR-0023); peran Sales dipisah dan izin `pos:after-hours` (FR-CSG-01/04, FR-SET-09, ADR-0024)                                                                                                |
| 0.14.0 | 2026-09-29 | QRIS dengan rekening tujuan otomatis dan bank sumber wajib (FR-PAY-07); No. referensi transfer dihapus (FR-PAY-04); harga manual per barang di pesanan online (FR-ONL-08); satuan tanpa spasi (FR-UI-12) (ADR-0025)                                                                           |
| 0.15.0 | 2026-09-29 | Motif & warna dari daftar tetap dengan dropdown yang bisa dicari (FR-PRD-06, FR-VAR-01); potongan cacat dan filter stok cacat (FR-ROL-05) (ADR-0026)                                                                                                                                          |
| 0.16.0 | 2026-09-29 | Harga modal & laba dihapus; §3.17 pengeluaran harian karyawan (FR-EXP-01..03); warna pertama saat tambah produk; dropdown bisa discroll (ADR-0027)                                                                                                                                            |
| 0.17.0 | 2026-09-29 | Beranda di `/` untuk semua role (FR-HOME-01); dasbor pindah ke `/dashboard` (ADR-0028)                                                                                                                                                                                                        |
| 0.18.0 | 2026-09-29 | Sales punya shift sendiri tanpa akses kasir; hanya bisa menjual barang bawaan (FR-CSG-01/04, ADR-0029)                                                                                                                                                                                        |
| 0.19.0 | 2026-09-29 | Daftar perangkat login sebagai modal di atas halaman (FR-AUTH-10, ADR-0030)                                                                                                                                                                                                                   |
| 0.20.0 | 2026-09-30 | Rekap uang masuk harian/bulanan ke rekening dan kasir, setoran tunai ke ATM dengan sisa kas berjalan, rekap khusus Admin (FR-RPT-06..08); housekeeping minimal 1 bulan (FR-HK-01); menu Pengeluaran di bawah Kasir; sisa laci otomatis masuk modal shift berikutnya (FR-SHF-02/03) (ADR-0032) |
| 0.21.0 | 2026-09-30 | Pilihan "Lainnya" dengan isian teks di dropdown motif dan warna, divalidasi ketat (FR-PRD-06, FR-VAR-01) (ADR-0034)                                                                                                                                                                           |
| 0.22.0 | 2026-09-30 | Cicilan kas bon langsung mengurangi saldo bila dicatat di shift kasir yang buka dan dalam jam buka toko; selain itu tetap lewat persetujuan (FR-KSB-03/04) (ADR-0035)                                                                                                                         |
| 0.23.0 | 2026-09-30 | Semua transaksi karyawan di luar jam buka ditolak, termasuk cicilan kas bon dan pengeluaran, dengan tombol "Tutup shift sekarang" (FR-SET-09) (ADR-0036)                                                                                                                                      |
| 0.24.0 | 2026-09-30 | Owner ganti password, kode pemulihan untuk lupa password, dan perintah reset untuk developer (FR-AUTH-11..13) (ADR-0037)                                                                                                                                                                      |

Konvensi: **MUST** = wajib v1, **SHOULD** = diusahakan v1, **MAY** = opsional. ID requirement dirujuk dari issue, commit, dan test.

---

## Daftar Isi

1. [Ringkasan Produk](#1-ringkasan-produk)
2. [Model Akses](#2-model-akses)
3. [Kebutuhan Fungsional](#3-kebutuhan-fungsional)
4. [State Machine](#4-state-machine)
5. [Aturan Perhitungan](#5-aturan-perhitungan)
6. [Invoice & Dokumen](#6-invoice--dokumen)
7. [UI/UX](#7-uiux)
8. [Standar API](#8-standar-api)
9. [Kebutuhan Non-Fungsional](#9-kebutuhan-non-fungsional)
10. [Arsitektur](#10-arsitektur)
11. [Model Data](#11-model-data)
12. [Release & Deployment](#12-release--deployment)
13. [Roadmap Lanjutan](#13-roadmap-lanjutan)
14. [Milestone v1](#14-milestone-v1)

---

## 1. Ringkasan Produk

POS web single-tenant berbasis Next.js (monolith) untuk toko retail/F&B, dengan fokus pada kecepatan transaksi, kontrol owner (approval), dan kemudahan rebranding melalui konfigurasi.

## 2. Model Akses

### 2.1 Autentikasi

| ID         | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Prioritas |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| FR-AUTH-01 | Owner login dengan username + password (min. 12 karakter).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | MUST      |
| FR-AUTH-02 | Karyawan login dengan username + PIN 6 digit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | MUST      |
| FR-AUTH-03 | PIN/password di-hash dengan Argon2id; tidak pernah dicatat di log.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | MUST      |
| FR-AUTH-04 | 5 kali gagal login → akun terkunci 15 menit; rate limit juga per IP. Percobaan tercatat di audit log.                                                                                                                                                                                                                                                                                                                                                                                                                                                   | MUST      |
| FR-AUTH-05 | Session di cookie `HttpOnly`, `Secure`, `SameSite=Lax`; idle timeout dapat diatur (default 8 jam).                                                                                                                                                                                                                                                                                                                                                                                                                                                      | MUST      |
| FR-AUTH-06 | Owner dapat mereset PIN karyawan; karyawan wajib mengganti PIN saat login pertama/setelah reset.                                                                                                                                                                                                                                                                                                                                                                                                                                                        | MUST      |
| FR-AUTH-07 | Re-autentikasi (password Owner / PIN approver) sebelum memutus approval dan housekeeping (step-up, berlaku 10 menit).                                                                                                                                                                                                                                                                                                                                                                                                                                   | SHOULD    |
| FR-AUTH-08 | Tombol "ganti kasir" untuk logout cepat tanpa menutup shift.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | SHOULD    |
| FR-AUTH-09 | Satu akun login di maksimal `operations.maxDevicesPerUser` perangkat (default 3, 1–10). Login berikutnya ditolak dengan pesan jelas dan tercatat di audit log (BRD BR-25, ADR-0019).                                                                                                                                                                                                                                                                                                                                                                    | MUST      |
| FR-AUTH-10 | Halaman **Perangkat login** (dari kartu akun): daftar sesi aktif (browser, OS, IP, waktu login, terakhir aktif, penanda perangkat ini) dan tombol keluarkan per perangkat. Pemegang `employee:manage` melakukan hal yang sama untuk karyawan di halaman karyawan; perangkat Owner hanya dapat dikeluarkan Owner. Dari kartu akun, daftar perangkat terbuka sebagai modal di atas halaman yang sedang dibuka (ADR-0030).                                                                                                                                 | MUST      |
| FR-AUTH-11 | Owner mengganti password dari tab **Pengaturan → Akun & keamanan** (hanya tampil untuk Owner) dengan memasukkan password sekarang; perangkat lain otomatis keluar. Password sekarang yang salah dihitung seperti gagal login ([ADR-0037](./adr/0037-owner-password-recovery.md)).                                                                                                                                                                                                                                                                       | MUST      |
| FR-AUTH-12 | Owner membuat 8 **kode pemulihan** sekali pakai (perlu password sekarang), ditampilkan sekali dengan salin dan unduh .txt; kode baru menggantikan yang lama, hanya hash yang disimpan. Banner tampil selama tidak ada kode yang tersisa. "Lupa password?" di langkah password membuka halaman pemulihan: username + kode + password baru. Kode salah dihitung ke penguncian akun dan batas per IP (FR-AUTH-04); jawaban sama untuk user tak dikenal, akun PIN, dan kode salah. Berhasil → kode terpakai, semua perangkat keluar, tercatat di audit log. | MUST      |
| FR-AUTH-13 | Jalan terakhir bila password dan kode hilang: developer menjalankan `pnpm owner:reset-password`, yang mencetak password sementara acak, membuka kunci, mengeluarkan semua perangkat, dan tercatat di audit log.                                                                                                                                                                                                                                                                                                                                         | MUST      |

### 2.2 Otorisasi (RBAC dinamis)

- Permission berbentuk `resource:action`, contoh: `product:create`, `voucher:request`, `report:view`, `order.online:update-status`.
- Daftar permission didefinisikan di kode (katalog tetap); **role dan pemetaan role → permission** diatur owner lewat UI.
- Permission halaman (`page:*`) mengontrol menu dan akses route; permission aksi mengontrol tombol **dan** divalidasi ulang di server.
- Owner adalah role sistem dengan semua permission; tidak dapat diubah atau dihapus.
- Role default `Karyawan` disediakan (seed) dan dapat diubah owner.
- Permission approval dipisah per jenis: `approval.kasbon:decide`, `approval.voucher:decide`, `approval.void:decide`. Default hanya Owner; Owner dapat memberikannya ke role lain (BRD BR-21).
- Master merk: `brand:manage` (tab Merk di Produk, FR-CAT-02).
- Barang bawaan sales (§3.16, ADR-0024): `page:consignments` (menu), `consignment:pickup` (catat barang yang diambil sales, mis. Admin), `consignment:return` (catat barang yang dikembalikan, mis. Pramuniaga), `consignment:sell` (sales: jual barang bawaan sendiri). Role `Admin`, `Pramuniaga`, dan `Sales` disediakan (seed) dan dapat diubah owner.
- Kasir di luar jam toko: `pos:after-hours` (FR-SET-09); diberikan ke role Sales secara bawaan.
- Potong roll: `page:cutting` (menu Potong Roll, FR-ROL-03).

| ID         | Requirement                                                                                          | Prioritas |
| ---------- | ---------------------------------------------------------------------------------------------------- | --------- |
| FR-RBAC-01 | Owner dapat membuat, mengubah, menonaktifkan role, dan mencentang permission per role dalam matriks. | MUST      |
| FR-RBAC-02 | Setiap server action dan endpoint API memeriksa permission; UI yang disembunyikan bukan pengganti.   | MUST      |
| FR-RBAC-03 | Perubahan permission berlaku pada request berikutnya tanpa perlu login ulang.                        | MUST      |
| FR-RBAC-04 | Setiap user memiliki tepat satu role.                                                                | MUST      |

## 3. Kebutuhan Fungsional

### 3.1 Produk & Merk

| ID        | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Prioritas |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| FR-PRD-01 | CRUD produk: nama, warna pertama (produk baru), merk, motif, ketebalan, harga jual, satuan, lacak stok (ya/tidak), status aktif. SKU, stok, dan stok minimum berada di level varian (§3.1.1). Produk roll: harga per meter dan harga per ukuran (§3.1.2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | MUST      |
| FR-PRD-02 | ~~Harga modal dan margin~~ tidak dipakai: toko hanya mencatat hasil transaksi (ADR-0027).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | —         |
| FR-PRD-03 | Produk tidak dihapus bila sudah pernah bertransaksi; hanya dinonaktifkan.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | MUST      |
| FR-PRD-04 | Pencarian produk (nama, merk, motif, warna, SKU) dan filter merk, respons < 200 ms untuk ≤ 5.000 produk. Motif dan ketebalan tampil sebagai kolom sendiri di daftar produk.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | MUST      |
| FR-PRD-05 | Import/ekspor produk via CSV (satu baris per varian) dengan validasi per baris dan laporan error.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | SHOULD    |
| FR-PRD-06 | Detail produk: **merk** (dari daftar merk), **motif** (dipilih dari daftar tetap di kode lewat dropdown yang bisa dicari; 3D punya sub-motif, mis. "3D Catur"; atau "Lainnya" lalu diketik, hanya huruf, angka, spasi, dan `.,'&()/-`, [ADR-0034](./adr/0034-other-motif-and-colour.md)), dan **ketebalan** dalam mm (angka, boleh desimal). Ketiganya wajib untuk produk baru; produk lama boleh kosong. **Ukuran** P × L cm dari daftar tetap 93×47, 100×70, 50×140, 100×140 ada di potongan (§3.1.2). Warna dan SKU tetap di varian (§3.1.1). Detail tampil di daftar produk, kasir, pencarian barang, dan dibekukan di baris struk/invoice ([ADR-0021](./adr/0021-product-details.md), [ADR-0023](./adr/0023-roll-stock.md)). | MUST      |
| FR-CAT-02 | CRUD merk (nama unik) oleh pemegang `brand:manage`; merk yang dipakai produk tidak bisa dihapus.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | MUST      |

#### 3.1.1 Varian warna

Setiap produk memiliki minimal satu varian. Produk tanpa varian memakai satu **varian default** tersembunyi, sehingga stok, transaksi, dan laporan selalu merujuk ke varian dan tidak ada dua jalur logika.

| ID        | Requirement                                                                                                                                                                                                                                                                                                                                  | Prioritas |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| FR-VAR-01 | Owner/role dengan `product:update` dapat mengaktifkan varian pada produk dan menambah varian warna: nama warna (wajib, dipilih dari daftar tetap di kode atau "Lainnya" lalu diketik dengan aturan yang sama dengan motif, unik per produk; swatch hex terisi otomatis untuk warna dari daftar), SKU (unik global), stok awal, stok minimum. | MUST      |
| FR-VAR-02 | Harga jual dan harga modal diwarisi dari produk; dapat di-override per varian.                                                                                                                                                                                                                                                               | MUST      |
| FR-VAR-03 | Swatch hex divalidasi ketat (`^#[0-9a-fA-F]{6}$`) dan dirender sebagai atribut `fill` SVG, bukan inline style, agar tetap patuh CSP. Tanpa hex → swatch netral dengan inisial warna.                                                                                                                                                         | MUST      |
| FR-VAR-04 | Pemilih varian di POS: daftar swatch + nama warna + sisa stok; varian habis stok dinonaktifkan (kecuali `allowNegativeStock`). Satu tap memasukkan ke keranjang.                                                                                                                                                                             | MUST      |
| FR-VAR-05 | Varian yang sudah bertransaksi tidak dapat dihapus, hanya dinonaktifkan. Varian default tidak dapat dinonaktifkan selama produk aktif.                                                                                                                                                                                                       | MUST      |
| FR-VAR-06 | Mengaktifkan varian pada produk yang sudah punya stok: stok varian default dipindahkan ke varian pertama melalui pergerakan `ADJUSTMENT` tercatat.                                                                                                                                                                                           | MUST      |
| FR-VAR-07 | Pencarian POS mencocokkan nama produk, nama warna, dan SKU varian.                                                                                                                                                                                                                                                                           | MUST      |
| FR-VAR-08 | Urutan tampil varian dapat diatur (drag & drop di desktop, tombol naik/turun di mobile).                                                                                                                                                                                                                                                     | SHOULD    |

#### 3.1.2 Roll & potongan

Barang masuk dalam bentuk **roll** (satuan meter, lebar selalu 140 cm) lalu dipotong menjadi **potongan** siap jual (satuan pcs) dalam 4 ukuran tetap. Roll dan potongannya adalah satu produk; satu roll = satu warna ([ADR-0023](./adr/0023-roll-stock.md), BRD BR-29).

| ID        | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Prioritas |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| FR-ROL-01 | Setiap produk baru adalah produk roll. Setiap warna (atau varian default tersembunyi) punya satu stok **roll** dalam meter (disimpan dalam cm) dan satu stok **potongan** per ukuran dalam pcs, dengan SKU `SKU-ukuran` yang dibuat otomatis. Barang masuk dicatat pada roll dalam meter.                                                                                                                                                                                                                                                  | MUST      |
| FR-ROL-02 | Harga jual dan harga modal produk roll **per meter**. Harga jual per potong diisi per ukuran di produk dan sama untuk semua warna. Modal potongan = modal per meter × pemakaian roll ukurannya.                                                                                                                                                                                                                                                                                                                                            | MUST      |
| FR-ROL-03 | **Potong Roll**: isi panjang roll yang dipotong dalam meter (mis. 8 m) dan jumlah potongan yang dihasilkan per ukuran. Roll berkurang sepanjang yang diisi dan stok potongan bertambah, lewat pergerakan `CUT` dengan referensi yang sama; sisa kain terbuang adalah selisihnya. Bila jumlah potongan biasanya butuh lebih dari panjang yang dipotong (100×140 = 1,00 m; 50×140 = 0,50 m; 100×70 = 0,50 m; 93×47 = 0,47 m), form memberi peringatan tanpa menolak. Roll tidak boleh minus. Stok potongan hanya bertambah lewat pemotongan. | MUST      |
| FR-ROL-04 | Di kasir, pembeli dapat membeli potongan per ukuran atau **potongan custom** per cm/meter (mis. 90 cm, 1,5 m) yang langsung mengurangi stok roll. Harga potongan custom = harga per meter × panjang, dibulatkan ke rupiah. Roll tidak dibawa sales dan tidak dijual lewat pesanan online; hanya potongan.                                                                                                                                                                                                                                  | MUST      |
| FR-ROL-05 | **Barang cacat**: di Potong Roll, centang "Barang cacat" untuk mencatat semua potongan pemotongan itu sebagai potongan cacat pada produk yang sama (per ukuran, ditandai), dengan harga cacat per ukuran di produk (sama untuk semua warna). Potongan cacat tampil terpisah di kasir dengan label "Cacat", dan menu Stok punya filter stok cacat (ADR-0026).                                                                                                                                                                               | MUST      |

### 3.2 Stok

| ID        | Requirement                                                                                                                                                                                                                                                                                | Prioritas |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| FR-STK-01 | Stok dikelola per **varian**. Semua perubahan stok melalui tabel pergerakan (`stock_movements`) bertipe: `IN`, `SALE`, `ONLINE_SALE`, `RETURN`, `WRITE_OFF`, `ADJUSTMENT`, `VOID`, `CONSIGNMENT_OUT`, `CONSIGNMENT_RETURN` (§3.16), `CUT` (§3.1.2). Stok roll dalam cm, lainnya dalam pcs. | MUST      |
| FR-STK-02 | Stok saat ini = hasil agregasi pergerakan, disimpan juga sebagai kolom terdenormalisasi yang diperbarui dalam transaksi DB yang sama.                                                                                                                                                      | MUST      |
| FR-STK-03 | Pengurangan stok memakai update bersyarat (`stock >= qty`) agar aman dari race condition; gagal → transaksi dibatalkan dengan pesan jelas.                                                                                                                                                 | MUST      |
| FR-STK-04 | Pengaturan `allowNegativeStock` (default `false`).                                                                                                                                                                                                                                         | MUST      |
| FR-STK-05 | Penyesuaian stok (stock opname) wajib alasan.                                                                                                                                                                                                                                              | MUST      |
| FR-STK-06 | Riwayat pergerakan per varian (dan agregat per produk) dengan filter tanggal dan tipe.                                                                                                                                                                                                     | MUST      |
| FR-STK-07 | Indikator stok menipis per varian di dashboard.                                                                                                                                                                                                                                            | MUST      |

### 3.3 Karyawan

| ID        | Requirement                                                                        | Prioritas |
| --------- | ---------------------------------------------------------------------------------- | --------- |
| FR-EMP-01 | Owner membuat karyawan: nama, username (unik, immutable), role, PIN awal.          | MUST      |
| FR-EMP-02 | Karyawan dapat dinonaktifkan/diaktifkan; tidak dapat dihapus.                      | MUST      |
| FR-EMP-03 | Profil karyawan menampilkan ringkasan aktivitas (transaksi, shift) dari audit log. | SHOULD    |
| FR-EMP-04 | Preferensi per user: bahasa dan tema.                                              | MUST      |

### 3.4 Shift Kasir

| ID        | Requirement                                                                                                                                                                                                                         | Prioritas |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| FR-SHF-01 | Transaksi POS hanya bisa dibuat saat user memiliki shift terbuka.                                                                                                                                                                   | MUST      |
| FR-SHF-02 | Buka shift: kasir input modal awal kas; shift kasir otomatis ditambah **sisa laci** dari shift kasir terakhir (kas fisik saat tutup − setoran sesudahnya), satu kali. Toko punya satu laci; shift Sales tidak ikut laci (ADR-0032). | MUST      |
| FR-SHF-03 | Tutup shift: sistem menampilkan kas seharusnya (sisa laci + modal + total pembayaran cash + cicilan kas bon tunai − pengeluaran harian − setoran ATM selama shift); kasir input kas fisik; selisih tercatat.                        | MUST      |
| FR-SHF-04 | Laporan shift: total per metode pembayaran, jumlah transaksi, void, selisih kas.                                                                                                                                                    | MUST      |

### 3.5 Transaksi POS

| ID        | Requirement                                                                                                                                                                                                                                  | Prioritas |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| FR-POS-01 | Layar POS: grid produk (chip filter merk + pencarian) dan panel keranjang. Di mobile, keranjang menjadi bottom sheet. Produk bervarian membuka pemilih varian (§3.1.1); produk tanpa varian langsung masuk keranjang.                        | MUST      |
| FR-POS-02 | Ubah qty, hapus item, diskon manual per item (persentase atau nominal) dengan permission `pos:item-discount`.                                                                                                                                | MUST      |
| FR-POS-03 | Terapkan satu voucher per transaksi; sistem memvalidasi status, periode, minimum belanja, kuota.                                                                                                                                             | MUST      |
| FR-POS-04 | Ringkasan total real-time sesuai [§5](#5-aturan-perhitungan).                                                                                                                                                                                | MUST      |
| FR-POS-05 | Keranjang tersimpan di sisi klien (per perangkat) agar tidak hilang saat refresh; dikosongkan setelah transaksi selesai.                                                                                                                     | SHOULD    |
| FR-POS-06 | Tahan transaksi (hold) dan lanjutkan kemudian, maksimal 10 per shift.                                                                                                                                                                        | SHOULD    |
| FR-POS-07 | Nomor invoice unik dan berurutan tanpa celah per hari: `INV/{YYYYMMDD}/{seq:4}` (format dapat diatur).                                                                                                                                       | MUST      |
| FR-POS-08 | Submit transaksi idempoten (`Idempotency-Key`), sehingga double-click atau retry tidak membuat transaksi ganda.                                                                                                                              | MUST      |
| FR-POS-09 | Void transaksi: wajib alasan dan approval (`approval.void:decide`); stok dikembalikan lewat pergerakan `VOID`.                                                                                                                               | MUST      |
| FR-POS-10 | Shortcut keyboard di desktop: fokus pencarian (`/`), bayar (`F2`), kosongkan keranjang (`Esc` + konfirmasi).                                                                                                                                 | SHOULD    |
| FR-POS-11 | Setiap transaksi mencatat **nama pembeli** (wajib, ≤ 80 karakter) dan **no. HP** (opsional, format Indonesia; wajib bila kas bon). Disimpan sebagai snapshot di `sales`, tampil di invoice, detail struk, dan riwayat transaksi (BRD BR-26). | MUST      |

### 3.6 Pembayaran

| ID        | Requirement                                                                                                                                                                                                                                                                                            | Prioritas |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| FR-PAY-01 | Metode: `CASH`, `TRANSFER`, `QRIS`, `MARKETPLACE`, `KASBON`.                                                                                                                                                                                                                                           | MUST      |
| FR-PAY-02 | Split payment: kombinasi cash dan transfer atau QRIS dalam satu transaksi.                                                                                                                                                                                                                             | MUST      |
| FR-PAY-03 | Cash: input uang diterima, sistem menghitung kembalian; tombol nominal cepat (uang pas, 50rb, 100rb). Uang diterima dan kembalian hanya ditampilkan saat checkout dan tidak disimpan; `payments.amount` = nominal yang dialokasikan ke total belanja.                                                  | MUST      |
| FR-PAY-04 | Transfer: pilih rekening tujuan (dari pengaturan); tanpa nomor referensi.                                                                                                                                                                                                                              | MUST      |
| FR-PAY-05 | Sisa tagihan dapat dijadikan kas bon (permission `kasbon:create`), wajib data pelanggan.                                                                                                                                                                                                               | MUST      |
| FR-PAY-06 | Metode pembayaran dimodelkan sebagai _provider_ dengan antarmuka umum, sehingga Midtrans dapat ditambahkan tanpa mengubah alur checkout.                                                                                                                                                               | MUST      |
| FR-PAY-07 | QRIS: masuk ke satu rekening QRIS yang dipilih owner di Pengaturan › Rekening dan terisi otomatis; kasir wajib memilih bank/e-wallet pengirim (daftar + Lainnya). Tersedia di kasir (penuh atau split) dan saat Sales mencatat barang terjual ([ADR-0025](./adr/0025-qris-and-marketplace-prices.md)). | MUST      |

### 3.7 Pesanan Online (Marketplace)

| ID        | Requirement                                                                                                                                                                                                                                                                                     | Prioritas |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| FR-ONL-01 | Input order: marketplace (daftar dapat diatur, mis. Shopee, Tokopedia, TikTok Shop), kode order (unik per marketplace), item (per varian), ongkir opsional, catatan.                                                                                                                            | MUST      |
| FR-ONL-02 | Stok berkurang saat order disimpan (`ONLINE_SALE`).                                                                                                                                                                                                                                             | MUST      |
| FR-ONL-03 | Update status sesuai [§4.2](#42-pesanan-online); setiap perubahan status tercatat dengan waktu dan aktor.                                                                                                                                                                                       | MUST      |
| FR-ONL-04 | Dashboard pesanan online: chip jumlah per status (gaya referensi desain), daftar kartu per status, pencarian kode order.                                                                                                                                                                        | MUST      |
| FR-ONL-05 | Retur: per item pilih kondisi `GOOD` (restock) atau `DAMAGED` (write-off).                                                                                                                                                                                                                      | MUST      |
| FR-ONL-06 | Komplain: catatan komplain dan resolusi (refund, kirim ulang, ditolak).                                                                                                                                                                                                                         | MUST      |
| FR-ONL-07 | Penanda order "tertahan" jika berada di status yang sama lebih lama dari ambang (default 3 hari).                                                                                                                                                                                               | SHOULD    |
| FR-ONL-08 | Harga barang pesanan online diisi manual per barang (wajib), karena berbeda dengan harga toko; barang tetap dipilih dari stok. Harga toko tampil sebagai pembanding dan disimpan; peringatan bila di bawah harga modal (bagi yang boleh melihat modal); harga tercatat di audit log (ADR-0025). | MUST      |

### 3.8 Kas Bon

| ID        | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                      | Prioritas |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| FR-KSB-01 | Data pelanggan kas bon: nama, no. HP (divalidasi format Indonesia), catatan. Pelanggan dapat dipilih ulang untuk kas bon berikutnya.                                                                                                                                                                                                                                                                                                             | MUST      |
| FR-KSB-02 | Kas bon menyimpan total, terbayar (approved), saldo, jatuh tempo opsional.                                                                                                                                                                                                                                                                                                                                                                       | MUST      |
| FR-KSB-03 | Karyawan dengan `kasbon:pay` mencatat cicilan/pelunasan (cash, transfer, atau keduanya). Bila pencatat punya shift kasir yang buka dan toko dalam jam buka (FR-SET-09), cicilan langsung disetujui dan mengurangi saldo; di luar jam buka karyawan ditolak; selain itu (tanpa shift kasir, atau di luar jam buka dengan `pos:after-hours`) → `PENDING_APPROVAL`, belum mengurangi saldo ([ADR-0035](./adr/0035-installments-at-the-cashier.md)). | MUST      |
| FR-KSB-04 | Approver (`approval.kasbon:decide`) menyetujui/menolak cicilan yang menunggu (dengan catatan). Disetujui → saldo berkurang; bila saldo 0 → `SETTLED`.                                                                                                                                                                                                                                                                                            | MUST      |
| FR-KSB-05 | Nominal cicilan tidak boleh melebihi saldo dikurangi cicilan pending lainnya.                                                                                                                                                                                                                                                                                                                                                                    | MUST      |
| FR-KSB-06 | Daftar kas bon dengan aging (0–30, 31–60, > 60 hari) dan penanda jatuh tempo.                                                                                                                                                                                                                                                                                                                                                                    | MUST      |
| FR-KSB-07 | Cetak/unduh riwayat kas bon per pelanggan.                                                                                                                                                                                                                                                                                                                                                                                                       | SHOULD    |

### 3.9 Voucher

| ID        | Requirement                                                                                                                                                                                                        | Prioritas |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| FR-VCH-01 | Field: kode (unik, huruf besar), nama, tipe (`PERCENT` / `FIXED`), nilai, minimum belanja (opsional), maksimum potongan (opsional, hanya untuk `PERCENT`), periode berlaku (opsional), kuota pemakaian (opsional). | MUST      |
| FR-VCH-02 | Karyawan dengan `voucher:request` dapat membuat voucher → `PENDING_APPROVAL`.                                                                                                                                      | MUST      |
| FR-VCH-03 | Perubahan voucher disimpan sebagai **revisi**; versi aktif tetap berlaku sampai revisi disetujui.                                                                                                                  | MUST      |
| FR-VCH-04 | Aktivasi ulang memerlukan approval; penonaktifan berlaku langsung.                                                                                                                                                 | MUST      |
| FR-VCH-05 | Validasi: `PERCENT` 1–100; `FIXED` > 0; potongan tidak melebihi subtotal.                                                                                                                                          | MUST      |
| FR-VCH-06 | Riwayat pemakaian voucher per transaksi.                                                                                                                                                                           | MUST      |

### 3.10 Approval (generik)

Satu mekanisme approval dipakai bersama oleh kas bon, voucher, dan void untuk menghindari duplikasi logika.

| ID        | Requirement                                                                                                                    | Prioritas |
| --------- | ------------------------------------------------------------------------------------------------------------------------------ | --------- |
| FR-APR-01 | Entitas approval: tipe, target, snapshot payload, pengaju, status, pemutus, waktu, catatan.                                    | MUST      |
| FR-APR-02 | Inbox approval dengan badge jumlah pending di navigasi dan dashboard; setiap approver hanya melihat jenis yang menjadi haknya. | MUST      |
| FR-APR-03 | Pengaju tidak dapat memutus pengajuannya sendiri; pengajuan oleh Owner otomatis disetujui.                                     | MUST      |
| FR-APR-04 | Pengajuan dapat dibatalkan pengaju selama masih pending.                                                                       | MUST      |
| FR-APR-05 | Keputusan approval memakai optimistic locking agar tidak diputus dua kali.                                                     | MUST      |

### 3.11 Dashboard & Rekap

| ID         | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Prioritas |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| FR-DSH-01  | Dashboard: penjualan hari ini, jumlah transaksi, rata-rata nilai transaksi, chip status pesanan online, stok menipis, approval pending, saldo kas bon, peringatan kapasitas DB.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | MUST      |
| FR-HOME-01 | Beranda (`/`) terbuka untuk semua akun yang login: sapaan, status jam toko hari ini, shift kasir (bila punya akses kasir), dan pintasan ke setiap halaman yang boleh dibuka role-nya. Dasbor ada di `/dashboard` (ADR-0028).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | MUST      |
| FR-RPT-01  | Rekap penjualan dengan filter rentang tanggal: per hari, per metode pembayaran, per produk, per varian, per merk (produk tanpa merk digabung sebagai "Tanpa merk"), per karyawan.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | MUST      |
| FR-RPT-02  | ~~Laba kotor~~ tidak ditampilkan; rekap berisi hasil transaksi, pengeluaran, dan sisa (ADR-0027).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | —         |
| FR-RPT-03  | Rekap voucher (pemakaian dan total potongan) dan diskon manual.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | MUST      |
| FR-RPT-04  | Rekap PPN dan service charge.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | MUST      |
| FR-RPT-05  | Ekspor rekap ke CSV (langsung diunduh).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | MUST      |
| FR-RPT-06  | Rekap per **hari** atau per **bulan** (pilih bulan). Uang masuk dibagi: **ke rekening** (transfer + QRIS, juga per rekening) dan **tunai di kasir**; marketplace di baris sendiri, tidak ikut total. Rincian penjualan (FR-RPT-01..05) dilipat di bawah "Rincian lainnya". Per bulan ada tabel per hari (ADR-0032).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | MUST      |
| FR-RPT-07  | **Kas tunai** mengikuti uang fisik di laci: sisa sebelumnya + modal ditambahkan + tunai masuk − pengeluaran − disetor ke ATM ± selisih hitung = **sisa di laci**, yang otomatis jadi modal shift kasir berikutnya. Pemegang `cash:deposit` mencatat setoran (tanggal, rekening, jumlah yang diterima ATM, catatan); uang yang ditolak ATM tetap di laci. Setoran mengurangi shift kasir yang sedang buka, atau sisa laci shift terakhir. Setoran yang datanya salah **diubah** dengan alasan wajib, dan setiap perubahan (sebelum → sesudah, alasan, siapa, kapan) tampil di riwayat setoran. Jumlah hanya bisa diubah selama belum dihitung di shift yang ditutup atau terbawa ke shift berikutnya; tanggal, rekening, dan catatan selalu bisa. Setoran yang tidak pernah terjadi dibatalkan, juga dengan alasan. Tunai Sales dicatat di menu Sales, tampil terpisah dan tidak masuk laci. | MUST      |
| FR-RPT-08  | Rekap hanya untuk Owner dan role Admin (`page:reports`, `report:view`, `cash:deposit`); role lain tidak mendapatkannya kecuali diberi Owner.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | MUST      |

### 3.12 Housekeeping

| ID       | Requirement                                                                                                                                                            | Prioritas |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| FR-HK-01 | Owner memilih rentang bulan; hanya bulan yang berakhir ≥ 1 bulan lalu (dapat diatur, minimum 1) yang bisa dipilih.                                                     | MUST      |
| FR-HK-02 | CSV di-stream langsung ke browser; tidak disimpan di server. Satu file per entitas (transaksi, item, pembayaran, pergerakan stok, order online, kas bon), dikemas ZIP. | MUST      |
| FR-HK-03 | Setelah unduhan selesai, record ditandai `archived_at` dan `archive_batch_id`. Batch tercatat (rentang, jumlah baris, checksum SHA-256 per file, aktor).               | MUST      |
| FR-HK-04 | Data yang ditandai tetap bisa dibaca di rekap; daftar transaksi default menyembunyikannya (dapat ditampilkan dengan filter).                                           | MUST      |
| FR-HK-05 | Kas bon yang belum lunas tidak ikut ditandai meskipun dalam rentang.                                                                                                   | MUST      |
| FR-HK-06 | Rentang yang sudah diarsip tampil dengan tag "Archived" dan dapat diunduh ulang.                                                                                       | MUST      |
| FR-HK-07 | Ekspor diproses per bulan agar tidak melewati batas durasi function.                                                                                                   | MUST      |

### 3.13 Monitoring Kapasitas Database

| ID        | Requirement                                                                                    | Prioritas |
| --------- | ---------------------------------------------------------------------------------------------- | --------- |
| FR-CAP-01 | Batas kapasitas dikonfigurasi (`DB_STORAGE_LIMIT_MB`) karena kuota free tier dapat berubah.    | MUST      |
| FR-CAP-02 | Ukuran dibaca via `pg_database_size()` (di-cache 1 jam).                                       | MUST      |
| FR-CAP-03 | Tingkat peringatan: ≥ 70% info, ≥ 85% warning, ≥ 95% critical (banner di semua halaman owner). | MUST      |
| FR-CAP-04 | Widget menampilkan ukuran per tabel terbesar sebagai petunjuk housekeeping.                    | SHOULD    |

### 3.14 Pengaturan

| ID         | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Prioritas |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| FR-SET-01  | Owner mengelola profil toko di menu Pengaturan: alamat (≤ 200 karakter), telepon (E.164, mis. `+6281234567890`), email (opsional), NPWP (opsional, 16 digit; tampil di invoice bila PPN aktif), footer invoice per bahasa (`id` & `en`, ≤ 120 karakter, teks polos). Disimpan di DB settings dan tercatat di audit log.                                                                                                                                                                                                                                                                                                                      | MUST      |
| FR-SET-01a | Nama aplikasi, nama toko, dan logo diatur developer di `src/config/app.config.ts` (§10.3); tidak dapat diubah dari aplikasi.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | MUST      |
| FR-SET-01b | Selama profil toko belum lengkap (alamat/telepon kosong), dashboard owner menampilkan pengingat; invoice tetap bisa dicetak tanpa field tersebut.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | MUST      |
| FR-SET-02  | Logo berupa file di `public/brand/` yang dirujuk config; tidak ada upload logo dari aplikasi.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | MUST      |
| FR-SET-03  | Tampilan (palette, layout, bahasa default, tema default) diatur di file yang sama (§10.3); tidak ada UI untuk mengubahnya.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | MUST      |
| FR-SET-04  | Pajak: PPN on/off + tarif; service charge on/off + tarif; harga inclusive/exclusive PPN.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | MUST      |
| FR-SET-05  | Rekening bank untuk transfer (CRUD).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | MUST      |
| FR-SET-06  | Daftar marketplace (CRUD).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | MUST      |
| FR-SET-07  | Format nomor invoice, ukuran kertas default, stok minus, ambang order tertahan, retensi housekeeping, batas perangkat per akun (FR-AUTH-09).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | MUST      |
| FR-SET-09  | Jam buka toko per hari (Senin–Minggu: jam buka, jam tutup, atau libur), dapat diaktifkan/dinonaktifkan (default nonaktif). Di luar jam buka menurut zona waktu toko, karyawan tidak dapat membuka kasir, membuka shift, mencatat transaksi (penjualan, cicilan kas bon, pengeluaran), atau mencatat barang sales; transaksi ditolak dengan tombol "Tutup shift sekarang" bila shift masih terbuka ([ADR-0036](./adr/0036-no-transactions-after-hours.md)). Menutup shift dan mencatat setoran ATM tetap bisa. Owner dan role dengan `pos:after-hours` (mis. Sales yang bekerja sampai malam) tidak dibatasi (BRD BR-24, ADR-0019, ADR-0024). | MUST      |
| FR-SET-08  | Tiga sumber konfigurasi yang tidak saling tumpang tindih: **file config** (nama, logo & tampilan, oleh developer), **DB settings** (profil toko, pajak, rekening, marketplace, operasional, oleh owner), **environment variable** (secret & koneksi).                                                                                                                                                                                                                                                                                                                                                                                        | MUST      |

### 3.15 Audit Log

| ID        | Requirement                                                                                                                            | Prioritas |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| FR-AUD-01 | Append-only: aktor, aksi, entitas, id entitas, diff sebelum/sesudah (field sensitif dimasking), IP, user agent, request id, waktu.     | MUST      |
| FR-AUD-02 | Dicatat untuk: login (sukses/gagal), CRUD master data, transaksi, void, approval, perubahan role/permission, pengaturan, housekeeping. | MUST      |
| FR-AUD-03 | Owner dapat melihat dan memfilter audit log (aktor, aksi, tanggal).                                                                    | MUST      |
| FR-AUD-04 | Tidak ada endpoint untuk mengubah atau menghapus audit log.                                                                            | MUST      |

### 3.16 Barang Bawaan Sales

Sales membawa barang keluar toko untuk dijual. Petugas toko mencatat barang yang diambil dan yang dikembalikan; sales hanya menerima, menjual, dan melihat riwayatnya ([ADR-0020](./adr/0020-field-sales-consignments.md), [ADR-0024](./adr/0024-consignment-roles.md), BRD BR-27).

| ID        | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Prioritas |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| FR-CSG-01 | Sales adalah akun aktif dengan role yang memegang `consignment:sell` (atau Owner). Pemegang `consignment:pickup` mencatat pengambilan dan pemegang `consignment:return` mencatat pengembalian, untuk semua sales, dan melihat semua bawaan. Sales hanya melihat bawaannya sendiri dan tidak dapat mengubah stok selain mencatat barang terjual; role Sales tidak punya akses kasir, sehingga tidak dapat menjual stok toko (ADR-0029).                                                                                                                                                                                                                                       | MUST      |
| FR-CSG-02 | **Ambil barang**: pilih varian dan jumlah; stok langsung berkurang lewat `CONSIGNMENT_OUT` dengan aturan stok yang sama seperti penjualan (FR-STK-03/04). Pengambilan berikutnya (mis. besok) masuk ke bawaan yang sama sebagai catatan baru; catatan lama tidak berubah. Idempoten.                                                                                                                                                                                                                                                                                                                                                                                         | MUST      |
| FR-CSG-03 | Per barang tampil: diambil, terjual, dikembalikan, dan **masih dibawa** = diambil − terjual − dikembalikan. Riwayat pengambilan dan setoran dikelompokkan per tanggal.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | MUST      |
| FR-CSG-04 | **Catat terjual** (sales, `consignment:sell`): isi jumlah terjual per barang (≤ masih dibawa). Barang terjual menjadi satu transaksi POS (nama pembeli wajib, FR-POS-11) dengan pembayaran penuh **tunai**, **transfer**, **QRIS**, atau **kas bon**, atau **tunai + QRIS/transfer** (jumlah tunai diisi, sisanya lewat QRIS/transfer; ADR-0033), di shift terbuka sales (dibuka/ditutup di panel "Shift saya" pada halaman Sales, tanpa akses kasir); transaksi tidak memotong stok lagi. **Catat pengembalian** (`consignment:return`): barang yang dikembalikan menambah stok lewat `CONSIGNMENT_RETURN`. Sisa tetap dibawa sales. Masing-masing dalam satu transaksi DB. | MUST      |
| FR-CSG-05 | Halaman **Sales**: daftar bawaan yang sedang dibawa (sales, sejak, aktivitas terakhir, jumlah & nilai barang) dan yang sudah selesai. Bawaan selesai otomatis saat semua barang terjual atau dikembalikan; pengambilan berikutnya membuka bawaan baru.                                                                                                                                                                                                                                                                                                                                                                                                                       | MUST      |
| FR-CSG-06 | Transaksi hasil setoran tidak dapat di-void, karena stoknya sudah keluar saat pengambilan; koreksi dilakukan lewat penyesuaian stok.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | MUST      |

### 3.17 Pengeluaran Harian

Uang yang diambil dari kas laci untuk karyawan atau keperluan lain, misalnya uang makan, uang bensin, dan donasi ([ADR-0027](./adr/0027-sales-only-and-staff-expenses.md), BRD Q-26..Q-28).

| ID        | Requirement                                                                                                                                                                                                                                                         | Prioritas |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| FR-EXP-01 | Pemegang `expense:record` mencatat pengeluaran di shift terbukanya: jenis (Uang makan, Uang bensin, Donasi, Lainnya; daftar tetap di kode), karyawan penerima (wajib kecuali Donasi/Lainnya), jumlah, keterangan (wajib untuk Lainnya). Catatan tidak dapat diubah. | MUST      |
| FR-EXP-02 | Halaman **Pengeluaran** (`page:expenses`) menampilkan pengeluaran per tanggal beserta totalnya. Rekap mengurangkan pengeluaran dari kas tunai (FR-RPT-07) dan merincinya per jenis. Menu Pengeluaran ada tepat di bawah Kasir.                                      | MUST      |
| FR-EXP-03 | Pengeluaran mengurangi kas seharusnya pada shift tempat dicatat.                                                                                                                                                                                                    | MUST      |

---

## 4. State Machine

### 4.1 Transaksi POS

```
DRAFT (klien) ──submit──▶ COMPLETED ──void (approval)──▶ VOIDED
                    └──▶ COMPLETED_WITH_KASBON ──▶ (mengikuti kas bon)
```

### 4.2 Pesanan online

```
PROCESSING ─▶ IN_TRANSIT ─▶ DELIVERED ─▶ COMPLETED
     │             │             │
     ▼             ├─▶ COMPLAINT ◀┘ ─▶ (RESOLVED → COMPLETED | RETURN_REQUESTED)
 CANCELLED         └─▶ RETURN_REQUESTED ─▶ RETURNED
```

- `CANCELLED` hanya dari `PROCESSING`; stok dikembalikan otomatis.
- `RETURNED` memicu pencatatan kondisi item (restock / write-off).

### 4.3 Kas bon

```
OPEN ─▶ PARTIALLY_PAID ─▶ SETTLED
```

Pembayaran kas bon: `PENDING_APPROVAL ─▶ APPROVED | REJECTED | CANCELLED`, atau langsung `APPROVED` di shift kasir dalam jam buka (ADR-0035)

### 4.4 Voucher

```
PENDING_APPROVAL ─▶ ACTIVE ⇄ INACTIVE
        │              │
        ▼              └─ revisi ─▶ (revisi PENDING_APPROVAL; versi aktif tetap berlaku)
    REJECTED
```

Voucher `ACTIVE` yang melewati periode berlaku dianggap `EXPIRED` saat dibaca (tanpa cron).

### 4.5 Barang bawaan sales

```
(ambil barang) ─▶ OPEN ──ambil lagi / setor sebagian──▶ OPEN
                    └──setor sampai masih dibawa = 0──▶ CLOSED
```

Satu bawaan `OPEN` per sales; pengambilan setelah `CLOSED` membuka bawaan baru.

---

## 5. Aturan Perhitungan

Semua nilai uang disimpan sebagai **integer rupiah** (`bigint`), tidak memakai float.

Urutan perhitungan (harga exclusive PPN):

```
1. line_total      = unit_price × qty − item_discount
2. subtotal        = Σ line_total
3. voucher_disc    = voucher(subtotal)           // dibatasi max_discount dan ≤ subtotal
4. net             = subtotal − voucher_disc
5. service_charge  = net × service_rate          // bila aktif
6. tax_base        = net + service_charge
7. ppn             = tax_base × ppn_rate         // bila aktif
8. grand_total     = net + service_charge + ppn
```

- Pembulatan: half-up ke rupiah terdekat di setiap langkah yang menghasilkan pecahan. Tidak ada pembulatan total untuk pembayaran cash (BRD BR-22).
- Harga inclusive PPN: `tax_base = total / (1 + ppn_rate)`, lalu `ppn = total − tax_base`.
- Diskon item persentase dihitung per baris, bukan per unit, agar tidak terjadi selisih pembulatan.
- Tarif dan konfigurasi pajak di-_snapshot_ ke transaksi agar perubahan pengaturan tidak mengubah transaksi lama.
- Fungsi perhitungan berupa _pure function_ tunggal yang dipakai klien (preview) dan server (sumber kebenaran). Server selalu menghitung ulang; total dari klien diabaikan.

---

## 6. Invoice & Dokumen

### 6.1 Format cetak

| Format       | Lebar area cetak | Karakter/baris (monospace) | Catatan                              |
| ------------ | ---------------- | -------------------------- | ------------------------------------ |
| Thermal 58mm | ± 48 mm          | 32                         | `logo.print` kecil; nama produk wrap |
| Thermal 80mm | ± 72 mm          | 48                         | Kolom qty × harga sejajar kanan      |
| A4           | 210 × 297 mm     | —                          | Layout tabel, header toko lengkap    |

| ID        | Requirement                                                                                                                                                                                                                                                                                                                      | Prioritas |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| FR-INV-01 | Cetak lewat dialog print browser dengan CSS `@page` sesuai ukuran; kasir memilih ukuran (default dari pengaturan).                                                                                                                                                                                                               | MUST      |
| FR-INV-02 | Tidak ada overflow: teks panjang di-wrap (`overflow-wrap: anywhere`), angka tidak terpotong, tabel A4 berpindah halaman dengan header berulang.                                                                                                                                                                                  | MUST      |
| FR-INV-03 | Test visual (Playwright snapshot) untuk ketiga format dengan data ekstrem: nama produk 120 karakter, 50 item, nominal miliaran.                                                                                                                                                                                                  | MUST      |
| FR-INV-04 | Isi invoice: identitas toko, nomor, tanggal/jam, kasir, item (nama produk + varian, mis. "Kaos Polos — Hitam"), diskon, voucher, service, PPN, total, pembayaran, sisa kas bon (bila ada), footer. Uang diterima & kembalian hanya tercetak pada struk saat checkout; cetak ulang dan PDF tidak memuatnya karena tidak disimpan. | MUST      |
| FR-INV-05 | Label invoice mengikuti bahasa yang dipilih saat cetak.                                                                                                                                                                                                                                                                          | MUST      |

### 6.2 PDF & berbagi

| ID        | Requirement                                                                                                                                                                                                      | Prioritas |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| FR-PDF-01 | PDF dibuat on-demand di server (`@react-pdf/renderer`) dan di-stream sebagai respons; **tidak disimpan**.                                                                                                        | MUST      |
| FR-PDF-02 | Tombol **Unduh PDF**: `Content-Disposition: attachment; filename="INV-20260925-0001.pdf"`.                                                                                                                       | MUST      |
| FR-PDF-03 | Tombol **Bagikan**: di perangkat yang mendukung Web Share API untuk file, PDF dibagikan langsung sebagai file (WhatsApp, email, dll). Fallback: unduh.                                                           | MUST      |
| FR-PDF-04 | **Tautan unduh**: server membuat URL bertanda tangan (HMAC, berisi id invoice + expiry, default 7 hari). Saat dibuka, PDF dibuat ulang dan langsung terunduh. Tidak ada file maupun record tautan yang disimpan. | MUST      |
| FR-PDF-05 | Tautan unduh publik: rate limit, `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`, dan tidak membuka data lain selain invoice tersebut.                                                               | MUST      |
| FR-PDF-06 | Rotasi secret penandatangan membatalkan semua tautan aktif (didokumentasikan).                                                                                                                                   | SHOULD    |

---

## 7. UI/UX

### 7.1 Design system

Referensi: gaya dashboard "Kitchen" (kartu lembut, sudut membulat, chip status berwarna pastel).

| Token             | Light (preset `sage`, dari referensi)                   | Keterangan                   |
| ----------------- | ------------------------------------------------------- | ---------------------------- |
| `--color-ink`     | `#323130`                                               | Teks utama, tombol/nav aktif |
| `--color-success` | `#dff4ce`                                               | Chip sukses, kartu "fastest" |
| `--color-warning` | `#fff1d8`                                               | Chip proses/peringatan       |
| `--color-surface` | `#f5f6f7`                                               | Latar belakang area konten   |
| `--color-card`    | `#ffffff`                                               | Kartu                        |
| Font              | **Outfit** (via `next/font`, self-hosted, subset latin) |                              |

| ID       | Requirement                                                                                                                                                                                                 | Prioritas |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| FR-UI-01 | Semua warna melalui semantic token (CSS variables); komponen dilarang memakai hex langsung (dijaga lint).                                                                                                   | MUST      |
| FR-UI-02 | Preset palette: `sage` (referensi), `sand`, `ocean`, `slate`; masing-masing light & dark.                                                                                                                   | MUST      |
| FR-UI-03 | Dark mode memakai latar abu gelap netral (bukan hitam pekat) dan aksen pastel yang di-desaturasi agar nyaman dilihat lama.                                                                                  | MUST      |
| FR-UI-04 | Kontras teks memenuhi WCAG 2.2 AA (4.5:1 teks normal, 3:1 teks besar/komponen); diverifikasi otomatis di CI.                                                                                                | MUST      |
| FR-UI-05 | Status tidak hanya dibedakan warna, tapi juga ikon/label.                                                                                                                                                   | MUST      |
| FR-UI-06 | Preset layout: `sidebar` (referensi), `topbar`, `compact` (sidebar ikon saja). Pada `sidebar`, kartu akun (nama, role, perangkat, keluar) berada tepat di bawah logo toko; tema dan bahasa di bagian bawah. | MUST      |
| FR-UI-07 | Preset aktif dipilih di `src/config/app.config.ts`; menambah preset cukup satu objek di `palettes.ts` / `layouts.ts` (§10.3).                                                                               | MUST      |
| FR-UI-08 | Komponen primitif reusable di `src/components/ui` (Button, Input, Card, Chip, Dialog, Sheet, Table, EmptyState, Skeleton); komponen fitur menyusun primitif, tidak menduplikasi gaya.                       | MUST      |

### 7.2 Tema & bahasa

| ID       | Requirement                                                                                                                                                                                                                     | Prioritas |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| FR-UI-09 | Tema: `light` / `dark` / `system`, disimpan di cookie + preferensi user; dirender dari server tanpa kedipan (FOUC).                                                                                                             | MUST      |
| FR-UI-10 | Bahasa `id` / `en` via `next-intl`; locale di segmen URL (`/id/...`, `/en/...`); tidak ada teks hard-coded di komponen (dijaga lint).                                                                                           | MUST      |
| FR-UI-11 | Format angka, mata uang, dan tanggal memakai `Intl` sesuai locale; zona waktu mengikuti pengaturan toko.                                                                                                                        | MUST      |
| FR-UI-12 | Satuan ditulis tanpa spasi: `12cm`, `38,5m`, `2mm`; ukuran `93cm x 47cm` (ADR-0025).                                                                                                                                            | MUST      |
| FR-UI-13 | Menu sidebar diurutkan dari yang paling sering dipakai: Beranda, Kasir, Pengeluaran, Pesanan Online, Sales, Stok, Potong Roll, Produk, Persetujuan, Kas Bon, Rekap, Dasbor, Voucher, Karyawan, Pengaturan, Housekeeping, Audit. | SHOULD    |

### 7.3 Responsif & UX

| ID       | Requirement                                                                                                                                             | Prioritas |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| FR-UX-01 | Breakpoint: mobile < 768 px (bottom navigation, kartu), tablet 768–1279 px (sidebar collapsible), desktop ≥ 1280 px.                                    | MUST      |
| FR-UX-02 | Target sentuh minimal 44 × 44 px.                                                                                                                       | MUST      |
| FR-UX-03 | Setiap daftar memiliki state loading (skeleton), kosong, dan error.                                                                                     | MUST      |
| FR-UX-04 | Aksi destruktif memakai konfirmasi; aksi yang bisa dibatalkan memakai toast + undo.                                                                     | MUST      |
| FR-UX-05 | Form: validasi inline, pesan error dalam bahasa aktif, fokus otomatis ke field error pertama.                                                           | MUST      |
| FR-UX-06 | Navigasi keyboard penuh dan dukungan screen reader (label, landmark, fokus terlihat).                                                                   | MUST      |
| FR-UX-07 | Menghormati `prefers-reduced-motion`.                                                                                                                   | MUST      |
| FR-UX-08 | Indikator loading global: bar tipis di atas layar selama navigasi halaman, filter, dan aksi server berlangsung; diumumkan ke screen reader ("Memuat…"). | MUST      |

---

## 8. Standar API

### 8.1 Pola akses

Business logic berada di **service layer** yang sama untuk dua pintu masuk:

- **UI internal** → React Server Components (baca) dan Server Actions (tulis). JS klien minimal.
- **REST API `/api/v1`** → untuk integrasi eksternal, aplikasi mobile, dan otomasi.

### 8.2 Konvensi REST

| Aspek       | Standar                                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Base path   | `/api/v1`; perubahan breaking → `/api/v2`                                                                                    |
| Resource    | Kata benda jamak, kebab-case: `/products`, `/online-orders/{id}/status-transitions`                                          |
| Field JSON  | camelCase; tanggal ISO 8601 UTC; uang integer rupiah                                                                         |
| `GET`       | Ambil resource / daftar dengan filter sederhana lewat query string                                                           |
| `QUERY`     | Pencarian kompleks dengan body (safe & idempotent). Fallback: `POST /{resource}/search` dengan semantik identik              |
| `POST`      | Membuat resource atau memicu aksi (`/vouchers/{id}/approvals`)                                                               |
| `PATCH`     | Update parsial (JSON Merge Patch, RFC 7396)                                                                                  |
| `PUT`       | Ganti penuh (mis. matriks permission role)                                                                                   |
| `DELETE`    | Hapus/nonaktifkan sesuai aturan bisnis                                                                                       |
| Error       | **RFC 9457 Problem Details** (`application/problem+json`) dengan `type`, `title`, `status`, `detail`, `instance`, `errors[]` |
| Pagination  | Cursor-based: `?limit=&cursor=`; respons `{ data, meta: { nextCursor } }`                                                    |
| Idempotensi | Header `Idempotency-Key` wajib untuk `POST` transaksi & pembayaran; disimpan 24 jam                                          |
| Concurrency | `ETag` pada `GET`; `If-Match` wajib pada `PATCH`/`PUT` master data → `412` bila konflik                                      |
| Rate limit  | Header `RateLimit` / `RateLimit-Policy`; `429` + `Retry-After`                                                               |
| Status code | `200`, `201` + `Location`, `204`, `400`, `401`, `403`, `404`, `409`, `412`, `422`, `428`, `429`                              |
| Autentikasi | Session cookie (UI); API token per user dengan scope untuk integrasi (SHOULD)                                                |
| Dokumentasi | OpenAPI 3.1 digenerate dari skema Zod                                                                                        |
| Tracing     | Header `X-Request-Id` di setiap respons, dicatat di log & audit                                                              |

> **Catatan `QUERY`:** route handler Next.js tidak mengekspor method `QUERY`. Implementasinya melalui proxy/middleware yang meneruskan `QUERY` ke handler pencarian internal. Dukungan method ini di edge Vercel perlu diverifikasi lewat technical spike di Milestone 0; jika tidak didukung, fallback `POST /search` menjadi jalur utama tanpa mengubah kontrak lain.

---

## 9. Kebutuhan Non-Fungsional

### 9.1 Keamanan

| ID         | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-SEC-01 | Mengacu OWASP ASVS Level 2 dan OWASP Top 10.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| NFR-SEC-02 | **Validasi input**: setiap input (form, query, body, header, params) diparse dengan skema Zod `.strict()`, sehingga field yang tidak dikenal ditolak (mencegah mass assignment / field injection).                                                                                                                                                                                                                                                                         |
| NFR-SEC-03 | **SQL injection**: hanya query ter-parameterisasi via Drizzle; `sql.raw` dilarang (dijaga lint).                                                                                                                                                                                                                                                                                                                                                                           |
| NFR-SEC-04 | **XSS / script injection**: output di-escape oleh React; `dangerouslySetInnerHTML` dilarang (lint); teks user dinormalisasi & dibatasi panjangnya; CSV ekspor dinetralkan dari formula injection (prefix `'` untuk nilai berawalan `= + - @`).                                                                                                                                                                                                                             |
| NFR-SEC-05 | **Security headers**: `Content-Security-Policy` (nonce untuk halaman dinamis, `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`), `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (kamera, mikrofon, geolokasi dimatikan), `Cross-Origin-Opener-Policy: same-origin`, `X-Frame-Options: DENY`. |
| NFR-SEC-06 | **CSRF**: Server Actions memakai pemeriksaan origin bawaan Next.js; route handler yang memakai cookie memvalidasi `Origin`/`Sec-Fetch-Site`.                                                                                                                                                                                                                                                                                                                               |
| NFR-SEC-07 | **Otorisasi** di setiap service call (bukan hanya di UI/middleware); akses berbasis id dicek kepemilikan/permission (anti IDOR).                                                                                                                                                                                                                                                                                                                                           |
| NFR-SEC-08 | Secret hanya dari environment variable; divalidasi saat boot dengan Zod; tidak ada `NEXT_PUBLIC_*` untuk data sensitif.                                                                                                                                                                                                                                                                                                                                                    |
| NFR-SEC-09 | `server-only` diimpor di seluruh modul server agar tidak ikut ter-bundle ke klien.                                                                                                                                                                                                                                                                                                                                                                                         |
| NFR-SEC-10 | Dependency scanning (Dependabot + `pnpm audit`) dan secret scanning di CI.                                                                                                                                                                                                                                                                                                                                                                                                 |
| NFR-SEC-11 | Pesan error ke klien generik; detail hanya di log server dengan request id.                                                                                                                                                                                                                                                                                                                                                                                                |

### 9.2 Performa

| ID          | Target                                                                                                                                                                                                                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-PERF-01 | Core Web Vitals (p75, perangkat mobile menengah, 4G): LCP < 2.5 s, INP < 200 ms, CLS < 0.1.                                                                                                                                                                                                    |
| NFR-PERF-02 | Budget JS first-load (gzip) per route ≤ 240 KB; halaman POS ≤ 280 KB. Baseline framework (Next.js 16 + React 19, aplikasi kosong) terukur 179 KB pada 2026-09-25, sehingga kode aplikasi mendapat ruang ± 60 KB per route. Dicek di CI oleh `e2e/performance.spec.ts` (gagal bila terlampaui). |
| NFR-PERF-03 | API p95 < 300 ms (warm), checkout p95 < 500 ms.                                                                                                                                                                                                                                                |
| NFR-PERF-04 | Default Server Component; `"use client"` hanya untuk komponen interaktif (keranjang, dialog, toggle tema).                                                                                                                                                                                     |
| NFR-PERF-05 | Index database untuk semua kolom filter/sort yang dipakai; query N+1 dilarang.                                                                                                                                                                                                                 |
| NFR-PERF-06 | Koneksi DB via driver serverless + connection pooling.                                                                                                                                                                                                                                         |
| NFR-PERF-07 | Pencarian produk di POS memakai data yang sudah dimuat + filter di klien bila produk ≤ 1.000; di atas itu, pencarian server dengan debounce.                                                                                                                                                   |

### 9.3 Kualitas kode

| ID          | Requirement                                                                                                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-CODE-01 | TypeScript `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.                                                                                                                                                        |
| NFR-CODE-02 | ESLint dengan `typescript-eslint` `strictTypeChecked` + `stylisticTypeChecked`; tanpa `any`, tanpa non-null assertion; Prettier untuk format. Lint & typecheck wajib lulus sebelum merge.                                             |
| NFR-CODE-03 | DRY: logika bisnis hanya di service layer; skema Zod menjadi sumber tipe tunggal (form, API, OpenAPI).                                                                                                                                |
| NFR-CODE-04 | **Kebijakan komentar**: TSDoc untuk modul/fungsi publik dan referensi keputusan (link ke ADR/RFC/requirement ID). Hindari komentar satu baris yang mengulang isi kode. Keputusan arsitektur dicatat di `docs/adr/`.                   |
| NFR-CODE-05 | Testing: unit (Vitest) untuk perhitungan, state machine, permission — coverage ≥ 90% untuk `src/features/**/service.ts` & `src/lib/money`; integration test service ke Postgres (Testcontainers); E2E (Playwright) untuk alur kritis. |
| NFR-CODE-06 | Conventional Commits, divalidasi commitlint.                                                                                                                                                                                          |
| NFR-CODE-07 | Commit dan PR **tidak** mencantumkan AI agent sebagai co-author.                                                                                                                                                                      |

### 9.4 Keandalan & observabilitas

| ID         | Requirement                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| NFR-REL-01 | Operasi multi-tabel (checkout, approval, housekeeping) dalam satu transaksi DB.                               |
| NFR-REL-02 | Logging terstruktur (JSON) dengan request id; tanpa PII/secret.                                               |
| NFR-REL-03 | Endpoint `GET /api/health` (liveness + koneksi DB).                                                           |
| NFR-REL-04 | Backup: mengandalkan point-in-time restore provider + ekspor housekeeping; prosedur restore didokumentasikan. |

---

## 10. Arsitektur

### 10.1 Stack

| Lapisan    | Teknologi                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------- |
| Framework  | Next.js (App Router, versi stabil terbaru), React, TypeScript                                   |
| Styling    | Tailwind CSS + CSS variables (token), shadcn/ui (Radix)                                         |
| Database   | PostgreSQL — Neon free tier (driver postgres.js, [ADR-0005](./adr/0005-database-access.md))     |
| ORM        | Drizzle ORM + Drizzle Kit (migrasi)                                                             |
| Validasi   | Zod                                                                                             |
| Auth       | Implementasi session sendiri + Argon2id ([ADR-0006](./adr/0006-authentication-and-sessions.md)) |
| i18n       | next-intl                                                                                       |
| PDF        | @react-pdf/renderer                                                                             |
| Rate limit | Upstash Redis (free tier)                                                                       |
| Testing    | Vitest, Testcontainers, Playwright                                                              |
| Tooling    | pnpm, ESLint, Prettier, commitlint, lefthook                                                    |
| CI/CD      | GitHub Actions → Vercel CLI                                                                     |

### 10.2 Struktur folder

```
src/
├── app/
│   ├── [locale]/
│   │   ├── (auth)/login/
│   │   └── (app)/                 # dashboard, pos, orders, consignments, products,
│   │                              # stock, employees, vouchers, kasbon, approvals,
│   │                              # reports, housekeeping, audit, settings, devices
│   └── api/v1/                    # REST route handlers (tipis, delegasi ke service)
├── features/<module>/
│   ├── components/                # UI spesifik modul
│   ├── actions.ts                 # Server Actions (tipis)
│   ├── schemas.ts                 # Zod: sumber tipe tunggal
│   ├── service.ts                 # Business logic + otorisasi
│   └── repository.ts              # Akses data (Drizzle)
├── components/ui/                 # Primitif reusable
├── lib/
│   ├── auth/  db/  http/          # http: problem details, idempotency, etag
│   ├── i18n/  money/  pdf/
│   ├── rbac/  security/  audit/
├── config/
│   ├── env.ts                     # Validasi env (Zod)
│   ├── app.config.ts  palettes.ts  layouts.ts  permissions.ts
├── db/
│   ├── schema/
│   └── migrations/
├── messages/{en,id}.json
└── proxy.ts / middleware.ts       # locale, security headers, CSP nonce, QUERY routing
docs/
├── BRD.md  PRD.md
└── adr/
```

Aturan dependensi: `app → features → lib → db`. `features` tidak saling mengimpor `repository` modul lain; interaksi lintas modul lewat `service`.

### 10.3 Konfigurasi aplikasi

Identitas merek (nama & logo) dan tampilan **hanya** diatur developer lewat satu file: `src/config/app.config.ts`. Owner menerima aplikasi yang sudah siap pakai; tidak ada menu untuk mengubah nilai ini, tidak disimpan di database, dan tidak memakai env variable. Perubahan berlaku setelah deploy (tag baru).

```ts
// src/config/app.config.ts
import type { AppConfig } from "./app-config.schema";

/**
 * Konfigurasi merek & tampilan per toko. Daftar key dan nilai yang
 * valid: PRD §10.3. Divalidasi saat typecheck (tipe) dan saat build
 * (`assertAppConfig` di next.config.ts, memakai Zod).
 */
export const appConfig: AppConfig = {
  brand: {
    appName: "Kasir Kita",
    storeName: "Toko Contoh",
    logo: {
      light: "/brand/logo-light.svg",
      dark: "/brand/logo-dark.svg",
      print: "/brand/logo-print.png",
      icon: "/brand/icon.png",
    },
  },
  appearance: {
    palette: "sage",
    layout: "sidebar",
    defaultLocale: "id",
    defaultTheme: "system",
  },
};
```

#### `brand`

| Key          | Tipe / format                          | Wajib | Dipakai di                                                              |
| ------------ | -------------------------------------- | ----- | ----------------------------------------------------------------------- |
| `appName`    | string, 1–40 karakter                  | Ya    | Judul tab, halaman login, manifest PWA, email/metadata                  |
| `storeName`  | string, 1–60 karakter                  | Ya    | Header invoice, PDF, sidebar                                            |
| `logo.light` | path di `public/brand/` (SVG/PNG/WebP) | Ya    | Aplikasi mode terang                                                    |
| `logo.dark`  | path di `public/brand/` (SVG/PNG/WebP) | Tidak | Aplikasi mode gelap; fallback ke `logo.light`                           |
| `logo.print` | path PNG monokrom, lebar ≥ 384 px      | Tidak | Struk thermal & PDF; tanpa nilai → hanya nama toko                      |
| `logo.icon`  | path PNG persegi 512 × 512 px          | Ya    | Favicon, ikon PWA, apple-touch-icon (ukuran lain digenerate saat build) |

- Aset logo berasal dari repo (sumber tepercaya), jadi SVG diperbolehkan. Build gagal bila file tidak ada atau format tidak sesuai.
- Data kontak dan footer invoice **bukan** bagian dari config ini; dikelola owner di menu Pengaturan (FR-SET-01).

#### `appearance`

| Key             | Nilai yang tersedia               | Keterangan                                                                                              |
| --------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `palette`       | `"sage"`                          | Referensi desain: ink `#323130`, hijau `#dff4ce`, cream `#fff1d8`, surface `#f5f6f7`. Default.          |
|                 | `"sand"`                          | Hangat: aksen krem/terakota lembut, cocok untuk kafe & bakery.                                          |
|                 | `"ocean"`                         | Sejuk: aksen biru/teal pastel, cocok untuk retail umum.                                                 |
|                 | `"slate"`                         | Netral: abu kebiruan dengan aksen minim, cocok untuk toko yang ingin tampilan formal.                   |
| `layout`        | `"sidebar"`                       | Sidebar kiri dengan label (seperti referensi desain). Default.                                          |
|                 | `"topbar"`                        | Navigasi horizontal di atas, area konten lebih lebar.                                                   |
|                 | `"compact"`                       | Sidebar ikon saja (label muncul sebagai tooltip), cocok untuk layar tablet/kasir kecil.                 |
| `defaultLocale` | `"id"` / `"en"`                   | Bahasa awal untuk user yang belum memilih bahasa. Default `"id"`.                                       |
| `defaultTheme`  | `"light"` / `"dark"` / `"system"` | Tema awal untuk user yang belum memilih. `"system"` mengikuti pengaturan perangkat. Default `"system"`. |

- Semua palette memiliki varian light & dark dan lolos cek kontras WCAG 2.2 AA.
- Di mobile, layout `sidebar` dan `compact` otomatis menjadi bottom navigation; `topbar` menjadi menu hamburger.
- User tetap dapat mengganti bahasa dan tema miliknya sendiri; `defaultLocale` dan `defaultTheme` hanya nilai awal.
- Menambah palette/layout baru: tambah satu entri di `src/config/palettes.ts` / `src/config/layouts.ts`; tipe konfigurasi diturunkan otomatis dari kedua file tersebut, sehingga nilai baru langsung tersedia di `app.config.ts`.

---

## 11. Model Data

Semua tabel memiliki `id` (UUIDv7), `created_at`, `updated_at`; tabel transaksional memiliki `archived_at`, `archive_batch_id`.

| Entitas               | Field utama                                                                                                                                                                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`               | username, name, role_id, password_hash / pin_hash, is_active, locale, theme, failed_attempts, locked_until, must_change_pin                                                                                                                                                         |
| `roles`               | name, is_system, is_active                                                                                                                                                                                                                                                          |
| `role_permissions`    | role_id, permission                                                                                                                                                                                                                                                                 |
| `sessions`            | user_id, token_hash, expires_at, last_seen_at, ip, user_agent                                                                                                                                                                                                                       |
| `brands`              | name (unik, tanpa beda huruf besar/kecil)                                                                                                                                                                                                                                           |
| `products`            | name, brand_id, motif, thickness, is_roll, size_prices, price, cost, unit, track_stock, has_variants, is_active                                                                                                                                                                     |
| `product_variants`    | product_id, parent_id (roll dari potongan), size, sku (unik), attributes (jsonb, divalidasi Zod: `{ color: { name, hex? } }`), price_override, cost_override, stock_qty, min_stock, sort_order, is_default, is_active                                                               |
| `stock_movements`     | variant_id, type, qty_delta, stock_after, reference_type, reference_id, reason, actor_id                                                                                                                                                                                            |
| `shifts`              | user_id, opened_at, opening_cash, closed_at, expected_cash, counted_cash, variance                                                                                                                                                                                                  |
| `sales`               | invoice_no, shift_id, cashier_id, customer_id, customer_name, customer_phone, consignment_id, status, subtotal, item_discount_total, voucher_id, voucher_discount, service_rate, service_amount, ppn_rate, ppn_amount, price_includes_tax, grand_total, paid_total, idempotency_key |
| `sale_items`          | sale_id, variant_id, name_snapshot, variant_snapshot, details_snapshot, unit_price, qty, length_cm (potongan custom), discount_type, discount_value, line_total                                                                                                                     |
| `payments`            | sale_id / kasbon_id, method, amount, bank_account_id, reference, status, provider_payload                                                                                                                                                                                           |
| `customers`           | name, phone, note                                                                                                                                                                                                                                                                   |
| `kasbons`             | sale_id, customer_id, total, paid_total, balance, due_date, status                                                                                                                                                                                                                  |
| `online_orders`       | marketplace_id, order_code, status, shipping_fee, note, status_changed_at                                                                                                                                                                                                           |
| `online_order_items`  | order_id, variant_id, qty, unit_price, return_condition                                                                                                                                                                                                                             |
| `online_order_events` | order_id, from_status, to_status, note, actor_id                                                                                                                                                                                                                                    |
| `vouchers`            | code, status, active_revision_id, usage_count                                                                                                                                                                                                                                       |
| `voucher_revisions`   | voucher_id, name, type, value, min_purchase, max_discount, starts_at, ends_at, quota, status                                                                                                                                                                                        |
| `approvals`           | type, target_type, target_id, payload, requested_by, status, decided_by, decided_at, note, version                                                                                                                                                                                  |
| `bank_accounts`       | bank_name, account_no, account_name, is_active                                                                                                                                                                                                                                      |
| `marketplaces`        | name, is_active                                                                                                                                                                                                                                                                     |
| `settings`            | key, value (jsonb, divalidasi skema per key)                                                                                                                                                                                                                                        |
| `invoice_counters`    | date, last_seq                                                                                                                                                                                                                                                                      |
| `idempotency_keys`    | key, user_id, request_hash, response, expires_at                                                                                                                                                                                                                                    |
| `consignments`        | salesperson_id, status (`OPEN`/`CLOSED`), closed_at                                                                                                                                                                                                                                 |
| `consignment_batches` | consignment_id, kind (`TAKE`/`SETTLE`), actor_id, sale_id, idempotency_key, note                                                                                                                                                                                                    |
| `consignment_items`   | batch_id, consignment_id, variant_id, kind (`TAKE`/`SOLD`/`RETURN`), qty, name_snapshot, variant_snapshot, unit_price                                                                                                                                                               |
| `archive_batches`     | period_start, period_end, entity_counts, checksums, actor_id                                                                                                                                                                                                                        |
| `audit_logs`          | actor_id, action, entity, entity_id, diff, ip, user_agent, request_id                                                                                                                                                                                                               |

ERD detail dan index disusun di ADR tersendiri saat implementasi Milestone 1.

---

## 12. Release & Deployment

### 12.1 Versioning

- **Semantic Versioning 2.0.0**: `MAJOR` untuk perubahan breaking (API/skema tanpa migrasi kompatibel), `MINOR` untuk fitur, `PATCH` untuk perbaikan.
- `CHANGELOG.md` format **Keep a Changelog**, digenerate dari Conventional Commits oleh **release-please**.

### 12.2 Alur

```
feature branch ─PR─▶ main          (CI: lint, typecheck, test, build, bundle budget, a11y)
main ─▶ release-please membuka "Release PR" (bump versi + CHANGELOG)
merge Release PR ─▶ tag vX.Y.Z dibuat
push tag v*.*.*  ─▶ workflow deploy: migrasi DB ─▶ vercel build ─▶ vercel deploy --prebuilt --prod
tag vX.Y.Z-rc.N  ─▶ deploy ke environment preview/staging
```

- Auto-deploy Git Vercel dimatikan (`git.deploymentEnabled: false`), sehingga **hanya tag** yang memicu deploy.
- Migrasi DB bersifat _expand–contract_ agar rollback aman: rollback = deploy ulang tag sebelumnya.
- Secret deploy (`VERCEL_TOKEN`, `DATABASE_URL`) disimpan di GitHub Environments dengan proteksi.

### 12.3 Environment

| Environment | Pemicu       | Database                |
| ----------- | ------------ | ----------------------- |
| Local       | `pnpm dev`   | Postgres lokal (Docker) |
| Staging     | tag `-rc.N`  | Neon branch `staging`   |
| Production  | tag `vX.Y.Z` | Neon branch `main`      |

---

## 13. Roadmap Lanjutan

| Item                                    | Catatan desain yang sudah disiapkan v1                                                                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Midtrans (QRIS, VA, e-wallet)**       | Provider pembayaran pluggable (FR-PAY-06); `payments.status` & `provider_payload` sudah ada; butuh webhook endpoint dengan verifikasi signature dan idempotensi. |
| Integrasi API marketplace               | `online_orders.order_code` + `marketplace_id` sudah unik; sinkronisasi status via webhook/polling.                                                               |
| Purge data arsip                        | `archive_batches` + checksum sebagai bukti ekspor sebelum hapus.                                                                                                 |
| Barcode scanner                         | Field `sku` dapat dipakai sebagai barcode.                                                                                                                       |
| Atribut varian tambahan (ukuran, bahan) | Tambah key baru pada skema `attributes`; kombinasi multi-atribut perlu generator varian.                                                                         |
| Gambar produk / per varian              | Butuh object storage.                                                                                                                                            |
| Multi-cabang                            | Tambah `outlet_id` pada entitas transaksional.                                                                                                                   |

---

## 14. Milestone v1

| Milestone                    | Isi                                                                                                                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0 — Fondasi**             | Scaffold, lint/typecheck strict, CI, tag-based deploy, security headers, env validation, i18n, tema, design tokens + preset, komponen UI primitif, spike method `QUERY`. Rilis `v0.1.0`. |
| **M1 — Akses & master data** | Auth (password & PIN), RBAC dinamis, audit log, pengaturan, kategori (dihapus di v0.12, diganti merk), produk + varian warna, karyawan, stok ledger.                                     |
| **M2 — Transaksi**           | Shift, POS, perhitungan, pembayaran cash/transfer/split, invoice cetak 3 format, PDF + share + tautan unduh.                                                                             |
| **M3 — Approval & kontrol**  | Approval generik, kas bon + cicilan, voucher + revisi, void.                                                                                                                             |
| **M4 — Online & insight**    | Pesanan marketplace + dashboard status, retur/komplain, dashboard, rekap, housekeeping, monitoring kapasitas DB. Rilis `v1.0.0`.                                                         |
