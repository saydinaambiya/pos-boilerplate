# Business Requirements Document — POS Boilerplate

| Atribut         | Nilai              |
| --------------- | ------------------ |
| Versi dokumen   | 0.16.0 (draft)     |
| Tanggal         | 2026-09-29         |
| Pemilik         | Owner              |
| Status          | Menunggu review    |
| Dokumen terkait | [PRD.md](./PRD.md) |

## Riwayat Perubahan

| Versi  | Tanggal    | Perubahan                                                                                                                                             |
| ------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1.0  | 2026-09-25 | Draft pertama                                                                                                                                         |
| 0.2.0  | 2026-09-25 | Keputusan Q-01 (delegasi approval), Q-02 (harga exclusive), Q-03 (tanpa pembulatan; uang diterima & kembalian tidak disimpan)                         |
| 0.3.0  | 2026-09-25 | Varian warna produk masuk scope v1                                                                                                                    |
| 0.4.0  | 2026-09-25 | Pengaturan tampilan dipindah ke satu file config di kode                                                                                              |
| 0.5.0  | 2026-09-25 | Identitas toko & logo diatur lewat file config oleh developer                                                                                         |
| 0.6.0  | 2026-09-25 | Profil toko (alamat, kontak, NPWP, footer invoice) kembali dikelola owner                                                                             |
| 0.7.0  | 2026-09-28 | Masukan user v1.0: nama pembeli, batas perangkat login, jam buka toko, barang bawaan sales (BR-24..27, Q-05..Q-08)                                    |
| 0.8.0  | 2026-09-28 | Detail produk merk, motif, dan ukuran (BR-28, Q-09, Q-10); istilah "laku" menjadi "terjual"                                                           |
| 0.9.0  | 2026-09-28 | Kategori produk tidak dipakai lagi; pengelompokan produk memakai merk (BR-28, Q-11)                                                                   |
| 0.10.0 | 2026-09-29 | Masukan user v1.1: ketebalan, roll & potongan (BR-28, BR-29, Q-12..Q-15), peran sales dipisah dan kasir sales sampai malam (BR-24, BR-27, Q-16, Q-17) |
| 0.11.0 | 2026-09-29 | QRIS, transfer tanpa referensi, harga manual pesanan online, penulisan satuan (Q-18..Q-21)                                                            |
| 0.12.0 | 2026-09-29 | Daftar motif & warna tetap, barang cacat dari potong roll (Q-22..Q-24)                                                                                |
| 0.13.0 | 2026-09-29 | Tanpa harga modal & laba; pengeluaran harian karyawan (Q-25..Q-28)                                                                                    |
| 0.14.0 | 2026-09-29 | Beranda untuk semua role (Q-29)                                                                                                                       |
| 0.15.0 | 2026-09-29 | Sales tanpa akses kasir (Q-30)                                                                                                                        |
| 0.16.0 | 2026-09-29 | Perangkat login sebagai modal (Q-31)                                                                                                                  |

---

## 1. Latar Belakang

Usaha kecil–menengah (retail/F&B) umumnya mencatat penjualan offline, pesanan marketplace, dan hutang pelanggan (kas bon) secara terpisah — di buku, spreadsheet, dan chat. Akibatnya stok tidak sinkron, hutang sulit ditagih, dan owner tidak punya gambaran penjualan yang akurat.

Proyek ini membangun **POS boilerplate** single-tenant: satu deployment untuk satu toko, dengan identitas (nama, logo, warna, layout) yang cukup diubah lewat konfigurasi. Boilerplate menjadi fondasi yang bisa dikustomisasi per klien tanpa menulis ulang inti sistem.

## 2. Tujuan Bisnis

| ID   | Tujuan                                                    | Indikator keberhasilan                                                                                                                                                                                         |
| ---- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G-01 | Mempercepat transaksi kasir                               | Transaksi cash standar selesai ≤ 30 detik, ≤ 5 interaksi dari keranjang ke invoice                                                                                                                             |
| G-02 | Satu sumber kebenaran untuk stok offline & online         | Selisih stok sistem vs fisik saat stock opname ≤ 1%                                                                                                                                                            |
| G-03 | Mengontrol hutang pelanggan (kas bon)                     | 100% pelunasan/cicilan tercatat dengan approval approver                                                                                                                                                       |
| G-04 | Mengontrol diskon                                         | 100% voucher aktif telah melalui approval approver                                                                                                                                                             |
| G-05 | Owner memahami performa usaha tanpa rekap manual          | Rekap harian/bulanan tersedia real-time                                                                                                                                                                        |
| G-06 | Boilerplate dapat di-rebrand untuk toko lain dengan cepat | Rebranding ≤ 15 menit oleh developer lewat satu file config (nama, logo, palette, layout, bahasa & tema default); owner cukup melengkapi profil toko (alamat, kontak, NPWP, footer invoice) di menu Pengaturan |
| G-07 | Biaya operasional minimal                                 | Berjalan di free tier database                                                                                                                                                                                 |

## 3. Stakeholder & Persona

| Persona         | Deskripsi                                                                                       | Kebutuhan utama                                                             |
| --------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Owner**       | Pemilik usaha. Satu akun super, tidak bisa dihapus/diturunkan hak aksesnya.                     | Approval, rekap, kontrol karyawan, pengaturan toko, housekeeping            |
| **Karyawan**    | Kasir/staf toko. Login dengan username + PIN.                                                   | Transaksi cepat, input order online, buat voucher, catat pembayaran kas bon |
| **Role kustom** | Opsional (mis. Supervisor, Gudang). Hak akses ditentukan dinamis oleh owner per halaman & aksi. | Sesuai konfigurasi owner                                                    |
| **Pelanggan**   | Tidak login. Menerima invoice (cetak / file PDF).                                               | Invoice jelas dan mudah disimpan                                            |
| **Developer**   | Pihak yang mengkustomisasi boilerplate untuk klien.                                             | Kode bersih, terdokumentasi, mudah diperluas                                |

## 4. Ruang Lingkup

### 4.1 In scope (v1)

1. Manajemen produk (termasuk **varian warna** dan merk), stok per varian (berbasis ledger), dan karyawan.
2. Role & permission dinamis (per halaman dan per aksi).
3. Transaksi POS dengan diskon manual per item dan voucher per transaksi.
4. Pembayaran: **cash**, **transfer bank** (pencatatan manual), **marketplace** (input kode order), dan **kas bon** (bisa dicicil).
5. PPN dan service charge yang dapat diaktifkan/dinonaktifkan.
6. Invoice cetak (thermal 58 mm, thermal 80 mm, A4) dan file PDF yang dapat dibagikan.
7. Dashboard pesanan online: diproses, dalam perjalanan, diterima, retur, komplain.
8. Shift kasir (modal awal, closing, selisih kas).
9. Rekap penjualan.
10. Housekeeping: ekspor CSV data ≥ 3 bulan dan penandaan (tag) data yang sudah diekspor.
11. Peringatan kapasitas database.
12. Audit log untuk seluruh aksi penting.
13. Multi-bahasa (English / Bahasa Indonesia), tema terang/gelap, desktop & mobile.
14. Nama, logo, palette warna, dan layout yang dapat diparameterisasi lewat satu file config (dikelola developer); profil toko dikelola owner di menu Pengaturan.
15. Nama pembeli di setiap transaksi (no. HP opsional).
16. Batas perangkat login per akun, dengan daftar perangkat dan keluarkan perangkat.
17. Jam buka toko per hari yang membatasi kasir untuk karyawan.
18. Barang bawaan sales: ambil barang, setor yang terjual, dan kembalikan yang tidak terjual.

### 4.2 Out of scope (v1) — kandidat pengembangan lanjutan

| Item                                      | Catatan                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Payment gateway (QRIS, VA, e-wallet)      | Integrasi **Midtrans** direncanakan. Model data pembayaran v1 disiapkan agar provider baru bisa ditambah sebagai metode pembayaran tanpa migrasi besar. |
| Integrasi API marketplace                 | v1 input manual kode order & status.                                                                                                                    |
| Barcode scanner                           | Tidak dibutuhkan v1.                                                                                                                                    |
| Mode offline                              | v1 full online.                                                                                                                                         |
| Multi-tenant / multi-cabang               | v1 single-tenant.                                                                                                                                       |
| Atribut varian selain warna (mis. ukuran) | Model varian v1 sudah disiapkan agar atribut baru bisa ditambah tanpa migrasi besar.                                                                    |
| Upload gambar produk                      | v1 memakai avatar inisial. Butuh object storage bila ditambahkan.                                                                                       |
| Purge (hapus permanen) data arsip         | v1 hanya menandai. Purge terkontrol bisa ditambah kemudian.                                                                                             |
| Program loyalitas / member                | —                                                                                                                                                       |

## 5. Proses Bisnis

### 5.1 Penjualan di toko (POS)

```
Buka shift ─▶ Pilih produk ─▶ (Diskon item) ─▶ (Voucher) ─▶ Hitung PPN/service
          ─▶ Pilih pembayaran ─▶ Stok berkurang ─▶ Invoice (cetak / PDF) ─▶ Selesai
```

- Pembayaran dapat dipecah (split), mis. sebagian cash, sebagian transfer.
- Jika pembayaran kurang dari total dan pelanggan setuju berhutang, sisa menjadi **kas bon** (wajib data pelanggan).
- Setiap transaksi mencatat nama pembeli; no. HP opsional (BR-26).
- Di luar jam buka toko, karyawan tidak dapat memakai kasir (BR-24).

### 5.2 Pesanan marketplace

```
Input kode order + item ─▶ Stok berkurang ─▶ Diproses ─▶ Dalam perjalanan ─▶ Diterima ─▶ Selesai
                                                              │                 │
                                                              └──▶ Komplain ◀───┘
                                                              └──▶ Retur ─▶ Retur diterima ─▶ (Restock / Write-off)
```

- Stok dipotong **saat order diinput**, karena barang dianggap sudah meninggalkan gudang.
- Status diperbarui manual oleh karyawan.

### 5.3 Kas bon (hutang pelanggan)

```
Transaksi dengan sisa tagihan ─▶ Kas bon OPEN
Karyawan catat cicilan/pelunasan ─▶ Menunggu approval ─▶ Disetujui ─▶ Saldo berkurang
                                                              └▶ Ditolak ─▶ Saldo tetap
Saldo = 0 ─▶ Kas bon LUNAS
```

### 5.4 Voucher

```
Karyawan buat/ubah voucher ─▶ Menunggu approval ─▶ Disetujui approver ─▶ Berlaku
                                                 └▶ Ditolak
```

- Perubahan pada voucher yang sudah aktif wajib di-approve ulang; selama menunggu, versi lama tetap berlaku.

### 5.5 Shift kasir

```
Buka shift (modal awal) ─▶ Transaksi ─▶ Tutup shift (hitung kas fisik) ─▶ Selisih tercatat
```

### 5.6 Barang bawaan sales

```
Admin catat barang diambil sales (hari ini) ─▶ Stok berkurang ─▶ (besok) Tambah barang ─▶ Stok berkurang lagi
Sales catat barang terjual ─▶ Transaksi (tunai / transfer / kas bon)
Pramuniaga catat barang sisa sales ─▶ Stok bertambah
Sisa tetap dibawa sales; semua barang terjual atau dikembalikan ─▶ Bawaan selesai
```

- Setiap pengambilan, penjualan, dan pengembalian tercatat per tanggal; catatan sebelumnya tidak berubah (BR-27).
- Sales hanya menerima dan menjual: ia melihat barang yang diterima dan dikembalikan, tetapi tidak dapat mengubah stok (BR-27).

### 5.6a Roll & potong

```
Roll masuk (mis. 40 m) ─▶ Potong Roll: isi meter dipotong (mis. 8 m) + hasil per ukuran ─▶ Roll berkurang 8 m ─▶ Potongan (pcs) bertambah
Kasir: jual potongan per ukuran, atau potong custom (mis. 90 cm / 1,5 m) langsung dari roll
```

- Roll dan potongannya adalah satu produk; roll dalam meter, potongan dalam pcs (BR-29).

### 5.7 Housekeeping

```
Owner pilih rentang (data ≥ 3 bulan) ─▶ Unduh CSV langsung ─▶ Data ditandai "archived"
```

- File tidak disimpan di server.
- Dashboard menampilkan peringatan jika penggunaan database mendekati batas.

## 6. Aturan Bisnis

| ID    | Aturan                                                                                                                                                                                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BR-01 | Hanya ada satu akun Owner. Owner memiliki semua permission dan tidak dapat dinonaktifkan.                                                                                                                                                                                |
| BR-02 | Karyawan login menggunakan **username + PIN**. Setiap aksi tercatat atas nama akun yang login.                                                                                                                                                                           |
| BR-03 | Role selain Owner bersifat opsional; permission per halaman dan aksi diatur owner.                                                                                                                                                                                       |
| BR-04 | Akun karyawan tidak dihapus, hanya dinonaktifkan, agar jejak audit tetap utuh.                                                                                                                                                                                           |
| BR-05 | Stok berkurang saat transaksi POS diselesaikan atau saat order marketplace diinput.                                                                                                                                                                                      |
| BR-06 | Setiap perubahan stok dicatat sebagai pergerakan stok (masuk, jual, retur, penyesuaian) beserta alasannya.                                                                                                                                                               |
| BR-07 | Secara default, stok tidak boleh minus (dapat diubah di pengaturan).                                                                                                                                                                                                     |
| BR-08 | Diskon manual per item dan satu voucher per transaksi dapat digabung. Diskon tidak boleh membuat total menjadi negatif.                                                                                                                                                  |
| BR-09 | Voucher dapat berupa persentase atau nominal. Minimum belanja dan maksimum potongan bersifat opsional.                                                                                                                                                                   |
| BR-10 | Voucher baru, perubahan voucher, dan pengaktifan kembali voucher wajib di-approve approver. Penonaktifan berlaku langsung.                                                                                                                                               |
| BR-11 | Kas bon wajib mencantumkan nama dan nomor HP pelanggan; jatuh tempo opsional.                                                                                                                                                                                            |
| BR-12 | Kas bon dapat dicicil. Setiap cicilan/pelunasan baru mengurangi saldo setelah di-approve approver.                                                                                                                                                                       |
| BR-13 | Pengaju tidak dapat menyetujui pengajuannya sendiri. Aksi yang dilakukan Owner sendiri otomatis disetujui.                                                                                                                                                               |
| BR-14 | PPN dan service charge dapat diaktifkan/dinonaktifkan dan tarifnya dapat diatur.                                                                                                                                                                                         |
| BR-15 | Metode pembayaran v1: cash, transfer bank, marketplace, kas bon.                                                                                                                                                                                                         |
| BR-16 | Invoice dapat dicetak sebagai thermal 58 mm, thermal 80 mm, atau A4, dan dibagikan sebagai file PDF. File tidak disimpan di server.                                                                                                                                      |
| BR-17 | Transaksi yang sudah selesai tidak dapat diubah. Koreksi dilakukan melalui pembatalan (void) dengan alasan dan approval approver.                                                                                                                                        |
| BR-18 | Hanya data berusia ≥ 3 bulan yang dapat di-housekeeping. Data yang sudah diekspor ditandai, tidak dihapus.                                                                                                                                                               |
| BR-19 | Retur marketplace: barang kondisi baik dikembalikan ke stok, barang rusak dicatat sebagai write-off.                                                                                                                                                                     |
| BR-20 | Setiap transaksi terikat ke shift kasir yang sedang terbuka.                                                                                                                                                                                                             |
| BR-21 | **Approver** adalah Owner atau role yang diberi permission approval oleh Owner. Permission approval dipisah per jenis (kas bon, voucher, void).                                                                                                                          |
| BR-22 | Total belanja tidak dibulatkan. Untuk cash, kasir input uang diterima dan sistem menampilkan kembalian; yang disimpan hanya nominal pembayaran sebesar total belanja.                                                                                                    |
| BR-23 | Produk dapat memiliki varian warna. Setiap varian memiliki SKU dan stok sendiri; harga dan harga modal mengikuti produk kecuali di-override per varian.                                                                                                                  |
| BR-24 | Owner mengatur jam buka toko per hari. Di luar jam buka, karyawan tidak dapat membuka kasir, membuka shift, atau mencatat transaksi; menutup shift tetap bisa. Owner dan role yang diberi izin kasir di luar jam toko (mis. Sales) tidak dibatasi.                       |
| BR-25 | Satu akun hanya boleh login di maksimal 3 perangkat sekaligus (dapat diatur owner). Login di perangkat berikutnya ditolak sampai salah satu perangkat dikeluarkan.                                                                                                       |
| BR-26 | Setiap transaksi mencatat nama pembeli (wajib) dan no. HP (opsional; wajib bila kas bon).                                                                                                                                                                                |
| BR-27 | Barang yang dibawa sales mengurangi stok saat diambil. Barang yang terjual menjadi transaksi; barang yang tidak terjual dikembalikan ke stok. Pengambilan dan pengembalian dicatat petugas toko; sales hanya mencatat barang terjual. Riwayat pengambilan tidak diubah.  |
| BR-28 | Setiap produk baru mencatat merk, motif, dan ketebalan (mm). Warna dan SKU dicatat per varian; ukuran (P × L cm: 93×47, 100×70, 50×140, 100×140) dicatat per potongan. Produk dikelompokkan per merk; tidak ada kategori.                                                |
| BR-29 | Barang masuk sebagai roll (meter, lebar 140 cm) dan dipotong menjadi potongan (pcs) dalam 4 ukuran; roll berkurang sepanjang yang dipotong. Roll dan potongannya satu produk, satu roll satu warna. Kasir dapat menjual potongan custom per cm/meter langsung dari roll. |

## 7. Asumsi

1. Satu toko per deployment; satu mata uang (IDR) dan satu zona waktu per toko.
2. Perangkat kasir selalu terhubung internet.
3. Pencetakan thermal menggunakan dialog print browser ke printer yang sudah terpasang di OS.
4. Pembayaran transfer diverifikasi manual oleh kasir (tanpa rekonsiliasi otomatis ke bank).
5. Tarif PPN dikonfigurasi owner sesuai ketentuan yang berlaku; sistem tidak menentukan tarif.

## 8. Batasan

1. Database Postgres free tier (kapasitas penyimpanan terbatas, compute dapat tidur saat idle).
2. Deployment di Vercel (batas durasi function, batas cron pada paket Hobby).
3. Tidak ada penyimpanan file di server untuk invoice dan hasil ekspor.

## 9. Risiko

| ID   | Risiko                                                         | Dampak | Mitigasi                                                                                            |
| ---- | -------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| R-01 | **Paket Vercel Hobby tidak mengizinkan penggunaan komersial.** | Tinggi | Gunakan paket Pro untuk toko produksi, atau siapkan jalur deploy alternatif. Keputusan per klien.   |
| R-02 | Database penuh karena data hanya ditandai, tidak dihapus.      | Tinggi | Peringatan kapasitas bertingkat; fitur purge terkontrol sebagai pengembangan lanjutan.              |
| R-03 | PIN rentan brute force.                                        | Tinggi | Rate limit per akun & IP, lockout sementara, audit percobaan login.                                 |
| R-04 | Cold start database free tier memperlambat transaksi pertama.  | Sedang | Connection pooling, warm-up saat buka shift.                                                        |
| R-05 | Approver tidak tersedia, pelunasan kas bon tertunda.           | Sedang | Notifikasi pending approval di dashboard; Owner dapat mendelegasikan approval ke role lain (BR-21). |
| R-06 | Ekspor CSV besar melebihi batas durasi function.               | Sedang | Ekspor per rentang bulanan dengan streaming.                                                        |

## 10. Keputusan

| ID   | Pertanyaan                                                                     | Keputusan                                                                                                                                                                                            | Status     |
| ---- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Q-01 | Apakah approval kas bon/voucher boleh didelegasikan ke role lain selain Owner? | Bisa, diatur oleh owner sesuai role yang diinginkan (BR-21).                                                                                                                                         | Diputuskan |
| Q-02 | Apakah harga produk termasuk PPN (inclusive) atau belum (exclusive)?           | Dapat dipilih di pengaturan; default exclusive.                                                                                                                                                      | Diputuskan |
| Q-03 | Apakah perlu pembulatan total untuk pembayaran cash (mis. ke Rp100)?           | Tidak ada pembulatan. Cash: input uang diterima, tampilkan kembalian, simpan total belanja saja (BR-22).                                                                                             | Diputuskan |
| Q-04 | Paket Vercel untuk produksi (terkait R-01).                                    | Diputuskan per klien.                                                                                                                                                                                | Terbuka    |
| Q-05 | Apa yang terjadi saat login di perangkat ke-4?                                 | Ditolak; user atau Owner mengeluarkan salah satu perangkat dulu (BR-25).                                                                                                                             | Diputuskan |
| Q-06 | Bagaimana jam buka diatur dan siapa yang dibatasi?                             | Per hari (bisa libur); hanya karyawan yang dibatasi, Owner tidak (BR-24).                                                                                                                            | Diputuskan |
| Q-07 | Siapa sales yang membawa barang?                                               | Karyawan dengan role yang diberi permission bawaan sales; login sendiri (BR-27).                                                                                                                     | Diputuskan |
| Q-08 | Bagaimana uang dari barang sales yang terjual dicatat?                         | Disetor di toko: transaksi dengan tunai, transfer, atau kas bon; sisa barang dikembalikan (BR-27).                                                                                                   | Diputuskan |
| Q-09 | Ukuran disimpan di produk atau di varian?                                      | Di produk; ukuran lain dibuat sebagai produk terpisah. Daftar ukuran tetap, tambah ukuran lewat rilis (BR-28).                                                                                       | Diputuskan |
| Q-10 | Bagaimana merk dan motif diisi?                                                | Merk dipilih dari daftar yang dikelola; motif diketik bebas. Wajib untuk produk baru saja (BR-28).                                                                                                   | Diputuskan |
| Q-11 | Apakah kategori produk masih dipakai?                                          | Tidak. Kategori dihapus; kasir dan rekap mengelompokkan produk per merk (BR-28).                                                                                                                     | Diputuskan |
| Q-12 | Berapa meter roll yang terpakai saat dipotong?                                 | Diisi petugas setiap kali potong (mis. 8 m), bersama jumlah potongan per ukuran yang dihasilkan. Pemakaian per ukuran (lebar roll 140 cm) hanya dipakai untuk peringatan dan modal potongan (BR-29). | Diputuskan |
| Q-13 | Bagaimana hubungan roll, warna, dan ukuran?                                    | Satu roll = satu warna. Produk = merk + motif + ketebalan; ukuran ada di potongan, bukan di produk (menggantikan Q-09) (BR-29).                                                                      | Diputuskan |
| Q-14 | Apakah roll bisa dijual per meter?                                             | Ya, potongan custom per cm/meter di kasir langsung mengurangi roll, dengan harga per meter di produk (BR-29).                                                                                        | Diputuskan |
| Q-15 | Bagaimana harga jual dan modal produk roll?                                    | Harga per ukuran di produk, sama untuk semua warna, plus harga per meter; modal per meter (BR-29).                                                                                                   | Diputuskan |
| Q-16 | Siapa yang mencatat barang sales?                                              | Admin mencatat pengambilan, Pramuniaga mencatat pengembalian; sales hanya mencatat barang terjual (BR-27).                                                                                           | Diputuskan |
| Q-17 | Apakah sales dibatasi jam buka toko?                                           | Tidak; izin "buka kasir di luar jam toko" diberikan ke role Sales dan bisa ke role lain (BR-24).                                                                                                     | Diputuskan |
| Q-18 | Ke rekening mana pembayaran QRIS masuk?                                        | Satu rekening QRIS yang dipilih owner di Pengaturan; terisi otomatis di kasir. Bank/e-wallet pengirim wajib dicatat.                                                                                 | Diputuskan |
| Q-19 | Apakah transfer perlu nomor referensi?                                         | Tidak; kolom dihapus.                                                                                                                                                                                | Diputuskan |
| Q-20 | Harga pesanan online dari mana?                                                | Diisi manual per barang karena berbeda dengan harga toko; harga toko tampil sebagai pembanding, peringatan bila di bawah modal, tercatat di audit log.                                               | Diputuskan |
| Q-21 | Bagaimana penulisan satuan?                                                    | Tanpa spasi: 12cm, 38,5m, 2mm; ukuran 50cm x 100cm.                                                                                                                                                  | Diputuskan |
| Q-22 | Bagaimana motif dan warna diisi?                                               | Dipilih dari daftar tetap di kode lewat dropdown yang bisa dicari; 3D wajib pilih sub-motif (mis. 3D Catur).                                                                                         | Diputuskan |
| Q-23 | Bagaimana harga barang cacat?                                                  | Harga cacat per ukuran di produk, sama untuk semua warna.                                                                                                                                            | Diputuskan |
| Q-24 | Bagaimana barang cacat dicatat?                                                | Checkbox "Barang cacat" per pemotongan: semua potongannya tercatat cacat di produk yang sama; ada filter stok cacat.                                                                                 | Diputuskan |
| Q-25 | Apakah toko perlu harga modal dan laba?                                        | Tidak; cukup hasil transaksi.                                                                                                                                                                        | Diputuskan |
| Q-26 | Dari mana uang makan/bensin/donasi dibayar?                                    | Dari kas laci shift yang sedang buka; mengurangi kas seharusnya.                                                                                                                                     | Diputuskan |
| Q-27 | Jenis pengeluaran dan penerimanya?                                             | Daftar tetap + Lainnya; karyawan penerima wajib kecuali Donasi/Lainnya; dicatat oleh role dengan izin khusus.                                                                                        | Diputuskan |
| Q-28 | Bagaimana pengeluaran tampil di rekap?                                         | Per hari dan per jenis, dengan sisa = total transaksi − pengeluaran.                                                                                                                                 | Diputuskan |
| Q-29 | Ke mana user tanpa akses dasbor setelah login?                                 | Ke Beranda (`/`) yang terbuka untuk semua akun; dasbor pindah ke `/dashboard`.                                                                                                                       | Diputuskan |
| Q-30 | Apakah sales boleh menjual stok toko lewat kasir?                              | Tidak. Sales punya shift sendiri di menu Sales untuk menerima uang barang bawaan, tanpa akses kasir.                                                                                                 | Diputuskan |
| Q-31 | Bagaimana daftar perangkat login dibuka?                                       | Sebagai modal di atas halaman yang sedang dibuka, tanpa pindah halaman.                                                                                                                              | Diputuskan |
