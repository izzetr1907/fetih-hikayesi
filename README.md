# FETİH HİKAYESİ

TikTok LIVE için etkileşimli tarayıcı oyunu: kadırga yağlanmış kütüklerin üstünde Galata sırtından karadan Haliç'e yürütülür.

- `server.js`: oyunu sunar ve `tiktok-live-connector` ile TikTok LIVE olaylarını (yorum, beğeni, takip, hediye) WebSocket (`/ws`) üzerinden oyuna aktarır. `/avatar` profil resimlerini CORS'lu olarak vekiller.
- `src/game.js`: oyun kaynağı (three.js). `npm run build:client` ile `public/game.js` üretilir (derlenmiş dosya depoda hazır).
- Menü: ⚙ düğmesi veya Esc. Bağlantı, hediye atamaları (Halatı çek, Fatih ol, Destekle), Müzik (MP3), Ayarlar, Test/Demo.
- İsteğe bağlı ortam değişkeni: `EULER_API_KEY` (Euler Stream imza anahtarı).

Çalıştırma: `npm install && npm start` → http://localhost:3000
