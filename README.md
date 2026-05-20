# F-Commerce Backend

বাংলাদেশের F-Commerce ব্যবসায়ীদের জন্য SaaS backend API।

## VPS এ Deploy করার ধাপ

### 1. Code clone করুন
```bash
cd /var/www
git clone https://github.com/YOUR_USERNAME/fcommerce-backend.git
cd fcommerce-backend
```

### 2. Dependencies install করুন
```bash
npm install
```

### 3. .env file তৈরি করুন
```bash
cp .env.example .env
nano .env
```
সব value পূরণ করুন, তারপর Ctrl+X → Y → Enter দিয়ে save করুন।

### 4. Database schema apply করুন
```bash
npm run migrate
```

### 5. PM2 দিয়ে চালু করুন
```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

### 6. Update করার সময় (পরে)
```bash
cd /var/www/fcommerce-backend
git pull
npm install
pm2 restart fcommerce-backend
```

## API Endpoints

- `GET  /api/auth/facebook/url` — Facebook login URL
- `GET  /api/auth/me` — Current user
- `GET  /api/pages` — Connected pages
- `GET  /api/messages/conversations` — Inbox
- `POST /api/messages/reply` — Send reply
- `GET  /api/orders` — Orders
- `POST /api/orders` — Create order
- `GET  /api/orders/stats` — Dashboard stats
- `GET  /api/admin/stats` — Admin overview
- `POST /api/courier/send` — Send to courier
