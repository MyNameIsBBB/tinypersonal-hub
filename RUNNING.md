# วิธีรัน TinyPersonal Hub

โปรเจกต์มีสคริปต์สำหรับรัน 2 รูปแบบ:

- Docker: `start-docker.sh`
- Docker Compose: `start-compose.sh`
- PM2: `start-pm2.sh`

ทั้งสองรูปแบบจะ build ทุก workspace, เปิด Personal App และเปิด Tailscale Funnel ให้โดยอัตโนมัติ

> หมายเหตุ: หาก Funnel เคยชี้ไปพอร์ตอื่น (เช่น `3002`) สคริปต์ใหม่จะรีเซ็ตและตั้งให้ชี้พอร์ตของแอปปัจจุบันอัตโนมัติ

## รันแบบ Development บนเครื่อง

โหมด Development เหมาะสำหรับแก้ไขโค้ดบนเครื่อง เพราะ Next.js จะ reload หน้าเว็บให้อัตโนมัติเมื่อไฟล์เปลี่ยนแปลง โดยไม่จำเป็นต้องใช้ Docker หรือ PM2

### สิ่งที่ต้องติดตั้ง

- Git
- Node.js 22 หรือใหม่กว่า
- npm 11 (ติดตั้งมากับ Node.js)
- Tailscale เฉพาะกรณีที่ต้องการเปิดให้เข้าถึงจากอินเทอร์เน็ต

ตรวจสอบเวอร์ชัน:

```bash
node --version
npm --version
```

### macOS

เปิด Terminal แล้วเข้า directory ของโปรเจกต์:

```bash
cd /path/to/tinypersonal-hub
```

ติดตั้ง dependencies:

```bash
npm ci
```

สร้างและแก้ไขไฟล์ `.env`:

```bash
cp .env.example .env
```

ใส่ Gemini API key ใน `.env`:

```dotenv
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.5-flash-lite
DATABASE_URL="file:./dev.db"
VAULT_MASTER_KEY=base64_encoded_32_byte_key
PERSONAL_API_TOKEN=random_private_api_token
APP_AUTH_USERNAME=your_workspace_username
APP_AUTH_PASSWORD=your_workspace_login_password
SESSION_SIGNING_KEY=random_string_at_least_32_characters
VAULT_REVEAL_PASSWORD=separate_step_up_password
```

คัดลอก environment ให้ Next.js และ Prisma ซึ่งทำงานจาก directory ของแต่ละ package:

```bash
cp .env packages/personal-app/.env.local
cp .env packages/backend-api/.env
```

Generate Prisma Client แล้วเปิด dev server:

```bash
npm run db:generate
npm run dev
```

คำสั่งนี้เปิดทั้ง Next.js และ chat generation runner เพื่อไม่ให้งาน AI ค้างในคิว แม้ไม่ได้ตั้ง `CRON_SECRET` ใน `.env` (ระบบจะสร้าง secret ชั่วคราวเฉพาะ process)

ถ้าต้องการเปิดจากมือถือผ่าน Tailscale Funnel:

```bash
npm run dev:mobile
```

เปิดเว็บที่ [http://localhost:3000](http://localhost:3000)

ถ้าต้องการเปลี่ยนพอร์ต:

```bash
npm run dev --workspace=@tinypersonal/personal-app -- --port 4000
```

### Windows — PowerShell

เปิด PowerShell แล้วเข้า directory ของโปรเจกต์:

```powershell
cd C:\path\to\tinypersonal-hub
```

ติดตั้ง dependencies:

```powershell
npm ci
```

สร้างไฟล์ `.env`:

```powershell
Copy-Item .env.example .env
```

เปิด `.env` แล้วกำหนดค่า:

```dotenv
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.5-flash-lite
DATABASE_URL="file:./dev.db"
VAULT_MASTER_KEY=base64_encoded_32_byte_key
PERSONAL_API_TOKEN=random_private_api_token
APP_AUTH_USERNAME=your_workspace_username
APP_AUTH_PASSWORD=your_workspace_login_password
SESSION_SIGNING_KEY=random_string_at_least_32_characters
VAULT_REVEAL_PASSWORD=separate_step_up_password
```

คัดลอก environment ให้ Next.js และ Prisma ซึ่งทำงานจาก directory ของแต่ละ package:

```powershell
Copy-Item .env packages\personal-app\.env.local
Copy-Item .env packages\backend-api\.env
```

Generate Prisma Client แล้วเปิด dev server:

```powershell
npm run db:generate
npm run dev
```

เปิดเว็บที่ [http://localhost:3000](http://localhost:3000)

ถ้าต้องการเปลี่ยนพอร์ต:

```powershell
npm run dev --workspace=@tinypersonal/personal-app -- --port 4000
```

สคริปต์ `.sh` ต้องใช้ผ่าน WSL หรือ Git Bash หากต้องการรัน Docker/PM2 script บน Windows โดยตรง แต่สำหรับการพัฒนาทั่วไปให้ใช้คำสั่ง PowerShell ด้านบนได้เลย

### เปิด Tailscale Funnel ในโหมด Development (ไม่บังคับ)

เปิด Terminal หรือ PowerShell อีกหน้าต่างหนึ่ง โดยให้ dev server ยังทำงานอยู่ แล้วรัน:

```bash
tailscale status
tailscale funnel --bg --yes 3000
```

ถ้า dev server ใช้พอร์ตอื่น ให้เปลี่ยน `3000` เป็นพอร์ตนั้น การเปิด Funnel จะทำให้แอปเข้าถึงได้จากอินเทอร์เน็ตแบบสาธารณะ

ปิด Funnel:

```bash
tailscale funnel --https=443 off
```

## 1. เตรียม Environment

สร้างไฟล์ `.env` จากตัวอย่าง:

```bash
cp .env.example .env
```

จากนั้นใส่ค่าที่จำเป็นอย่างน้อย:

```dotenv
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.5-flash-lite
DATABASE_URL="file:./dev.db"
VAULT_MASTER_KEY=base64_encoded_32_byte_key
PERSONAL_API_TOKEN=random_private_api_token
APP_AUTH_USERNAME=your_workspace_username
APP_AUTH_PASSWORD=your_workspace_login_password
SESSION_SIGNING_KEY=random_string_at_least_32_characters
VAULT_REVEAL_PASSWORD=separate_step_up_password
```

ห้าม commit ไฟล์ `.env` หรือ API key ขึ้น Git

สร้างค่า `VAULT_MASTER_KEY` บน macOS/Linux ได้ด้วย:

```bash
openssl rand -base64 32
```

บน Windows PowerShell:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

หากทำ master key สูญหาย จะไม่สามารถถอดรหัสข้อมูลใน Vault เดิมได้ ควรสำรอง key ไว้ใน password manager หรือ secret manager ที่แยกจากฐานข้อมูล

## 2. เตรียม Tailscale

ติดตั้ง Tailscale และเชื่อมต่อบัญชีก่อนรันสคริปต์:

```bash
tailscale status
```

ถ้ายังไม่ได้เชื่อมต่อ ให้รัน:

```bash
tailscale up
```

Tailscale Funnel จะเผยแพร่แอปออกสู่อินเทอร์เน็ตแบบสาธารณะ โปรดตรวจสอบว่าไม่มีข้อมูลหรือฟังก์ชันที่ไม่ต้องการเปิดเผย

## เชื่อม Discord และ Proxmox

สร้าง Discord application แล้วตั้ง **Interactions Endpoint URL** เป็น URL สาธารณะของแอปตามด้วย:

```text
https://your-host.example/api/integrations/discord/interactions
```

กำหนด `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN` และ `DISCORD_ALLOWED_USER_IDS` ใน `.env` โดย allowlist ต้องมี Discord user ID ที่อนุญาตอย่างน้อยหนึ่งรายการ ตั้ง `DISCORD_ALLOWED_CHANNEL_IDS` เพื่อจำกัดคำสั่งไว้เฉพาะห้องที่กำหนดได้ หากต้องการให้ Discord ใช้ประวัติแชทเดียวกับผู้ใช้เว็บ ให้ตั้ง `DISCORD_OWNER_KEY` เป็น owner key เดียวกัน เช่น `user:alice` จากนั้นลงทะเบียน slash commands:

```bash
npm run discord:register
```

สคริปต์จะแสดง Install URL สำหรับเพิ่ม application commands เข้า Discord server หลังลงทะเบียนสำเร็จ

ตั้ง `DISCORD_GUILD_ID` ก่อนรันเพื่อให้คำสั่งปรากฏทันทีใน test server หรือไม่ตั้งเพื่อ register แบบ global คำตอบเป็น ephemeral โดย `/assistant` ส่งข้อความเข้าคิวผู้ช่วยเดิม ส่วน `/vm` เป็นคำสั่งตรงที่ไม่ผ่าน AI: ระบบ validate arguments, แสดงสรุป และเรียก Proxmox หลังผู้ใช้กดปุ่ม Confirm เท่านั้น `/proxmox-status` แสดงสถานะโหนด และ `/vm-status` แสดง VM ทั้งหมดหรือ VM ID ที่ระบุแบบ read-only

สำหรับ Proxmox ให้สร้าง API token ที่มีสิทธิ์ขั้นต่ำสำหรับสร้าง VM บน node/storage ที่ต้องการ แล้วกำหนด:

```dotenv
PROXMOX_BASE_URL=https://proxmox.example.com:8006
PROXMOX_TOKEN_ID=automation@pve!tinypersonal
PROXMOX_TOKEN_SECRET=your_token_secret
```

ใบรับรอง HTTPS ของ Proxmox ต้องเชื่อถือได้จากเครื่องที่รันแอป ระบบไม่ปิด TLS verification คำสั่ง `/vm` ต้องระบุ node, VM ID, name และ storage ส่วน CPU, memory, disk และ bridge มีค่าเริ่มต้นแบบอนุรักษ์นิยม ทุกคำขอถูก validate ซ้ำใน backend และบันทึก audit result

## 3. รันด้วย Docker

`start-docker.sh` เป็นคำสั่งเดียวสำหรับเส้นทาง Docker ปกติ โดยสคริปต์จะ:

1. เปิด host-side Codex worker และชี้ไปที่ repository นี้โดยค่าเริ่มต้น
2. ล้าง Docker build cache ก่อน build
3. build และเปิด application container
4. เปิด coding-job runner ภายใน container เมื่อกำหนด `CRON_SECRET`
5. ตรวจ health และเปิด Tailscale Funnel ตาม configuration

จึงไม่ต้องเปิด Codex worker หรือ coding-job runner แยกอีก หากต้องการให้ coding jobs ทำงาน ต้องกำหนด `CRON_SECRET` ที่ไม่ว่างใน `.env` ก่อนรัน หากต้องการให้ Codex ทำงานกับ repository อื่น ให้กำหนด `HOST_JARVIS_PROJECT_ROOT` เป็น absolute path ของ repository นั้น

สิ่งที่ต้องติดตั้ง:

- Docker
- Tailscale
- `curl`

รันด้วยพอร์ตเริ่มต้น `3000`:

```bash
./start-docker.sh
```

## 3.1 รันด้วย Docker Compose (แนะนำ)

คำสั่งเดียวสำหรับ TinyPersonal และบริการประกอบ:

```bash
./start-compose.sh
```

หรือผ่าน npm script:

```bash
npm run docker:up
```

ตรวจสถานะ:

```bash
docker compose ps
docker compose logs -f app
```

สคริปต์จะดำเนินการดังนี้:

1. Build image `tinypersonal-hub:local`
2. Build ทุก npm workspace และ generate Prisma Client
3. สร้างหรือแทนที่ container ชื่อ `tinypersonal-hub`
4. เก็บฐานข้อมูลใน Docker volume ชื่อ `tinypersonal-hub-data`
5. รอจนแอปตอบสนองที่ `http://127.0.0.1:3000`
6. ล้าง Docker build cache ด้วย `docker builder prune --all --force`
7. เปิด Tailscale Funnel

ตรวจสถานะและ log:

```bash
docker ps --filter name=tinypersonal-hub
docker logs --follow tinypersonal-hub
tailscale funnel status
```

หยุด container:

```bash
docker stop tinypersonal-hub
```

เปิดกลับมาใหม่:

```bash
docker start tinypersonal-hub
```

ลบ container โดยไม่ลบข้อมูลใน volume:

```bash
docker rm --force tinypersonal-hub
```

## 4. รันด้วย PM2

สิ่งที่ต้องติดตั้ง:

- Node.js 22 หรือใหม่กว่า
- npm 11
- PM2
- Tailscale

ตัวอย่างการติดตั้ง PM2:

```bash
npm install --global pm2
```

รันด้วยพอร์ตเริ่มต้น `3000`:

```bash
./start-pm2.sh
```

สคริปต์จะติดตั้ง dependencies, generate Prisma Client, build ทุก workspace, รันแอปด้วย PM2, บันทึก process list และเปิด Tailscale Funnel

ตรวจสถานะและ log:

```bash
pm2 status
pm2 logs tinypersonal-hub
tailscale funnel status
```

รีสตาร์ตแอป:

```bash
pm2 restart tinypersonal-hub
```

หยุดแอป:

```bash
pm2 stop tinypersonal-hub
```

นำแอปออกจาก PM2:

```bash
pm2 delete tinypersonal-hub
pm2 save
```

## 5. เปลี่ยนพอร์ต

ส่งค่า `PORT` ก่อนเรียกสคริปต์ เช่น พอร์ต `4000`:

```bash
PORT=4000 ./start-docker.sh
```

แบบ Docker Compose:

```bash
PORT=4000 ./start-compose.sh
```

## 6. สำรองและกู้คืนข้อมูล Docker

สำรองข้อมูล volume `tinypersonal-hub-data` พร้อมไฟล์ `.env`:

```bash
./scripts/backup-docker-data.sh
```

ระบุปลายทางสำรองได้:

```bash
./scripts/backup-docker-data.sh /path/to/backups
```

กู้คืนจากไฟล์สำรอง:

```bash
./scripts/restore-docker-data.sh /path/to/tinypersonal-backup-YYYYmmdd-HHMMSS.tar.gz
```

หลัง restore เสร็จ ให้เปิดระบบใหม่ด้วย:

```bash
./start-compose.sh
```

## 7. ตรวจสุขภาพ Funnel และ Auto-heal

ตรวจสุขภาพผ่าน URL สาธารณะของ Funnel:

```bash
./scripts/check-funnel-health.sh
```

หรือผ่าน npm:

```bash
npm run funnel:check
```

ติดตั้งงานอัตโนมัติทุก 3 นาที (cron ของ user ปัจจุบัน):

```bash
./scripts/install-funnel-autofix-cron.sh
```

ถ้าเครื่องไม่มี crontab ให้ใช้ systemd user timer แทน:

```bash
./scripts/install-funnel-autofix-systemd.sh
```

หรือผ่าน npm:

```bash
npm run funnel:install-autofix
npm run funnel:install-autofix-systemd
```

ดู log การแก้อัตโนมัติ:

```bash
tail -f logs/funnel-heal.log
```

ถ้า Funnel ถูกปฏิเสธสิทธิ์ ให้ตั้ง operator ก่อน 1 ครั้ง:

```bash
sudo tailscale set --operator=$USER
```

หรือ:

```bash
PORT=4000 ./start-pm2.sh
```

พอร์ตดังกล่าวจะถูกใช้ทั้งสำหรับแอปและ target ของ Tailscale Funnel

## 6. ปิด Tailscale Funnel

ปิด Funnel ที่ HTTPS port เริ่มต้น:

```bash
tailscale funnel --https=443 off
```

หรือล้างการตั้งค่า Serve/Funnel ทั้งหมดบนเครื่องนี้:

```bash
tailscale funnel reset
```

## 7. แก้ปัญหาเบื้องต้น

### Permission denied ตอนเรียกสคริปต์

```bash
chmod +x start-docker.sh start-pm2.sh
```

### พอร์ตถูกใช้งานอยู่

เลือกพอร์ตอื่น:

```bash
PORT=4000 ./start-docker.sh
```

### Docker container เปิดไม่สำเร็จ

```bash
docker logs --tail 100 tinypersonal-hub
```

### PM2 process เปิดไม่สำเร็จ

```bash
pm2 logs tinypersonal-hub --lines 100
```

### Funnel เปิดไม่ได้

ตรวจว่า Tailscale daemon ทำงานและบัญชีเชื่อมต่ออยู่:

```bash
tailscale status
tailscale funnel status
```

Funnel ต้องได้รับอนุญาตใน tailnet policy และจะทำให้แอปเข้าถึงได้จากอินเทอร์เน็ต

## 8. PWA และการ Deploy

Production environment ต้องกำหนดค่าต่อไปนี้ให้ครบก่อน start:

```dotenv
DATABASE_URL="file:/data/dev.db"
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.5-flash-lite
APP_AUTH_USERNAME=your_workspace_username
APP_AUTH_PASSWORD=your_workspace_login_password
SESSION_SIGNING_KEY=random_string_at_least_32_characters
VAULT_MASTER_KEY=base64_encoded_32_byte_key
VAULT_REVEAL_PASSWORD=separate_step_up_password
PERSONAL_API_TOKEN=random_private_api_token_at_least_32_characters
```

สร้าง random secret ได้ด้วย `openssl rand -base64 48` และเก็บค่าจริงไว้นอก repository

Build และตรวจ migration:

```bash
npm ci
npm run db:generate
npm run db:deploy
npm run typecheck
npm run build
```

จากนั้นรันผ่าน `start-docker.sh` หรือ `start-pm2.sh` สคริปต์จะตรวจ production environment และ apply migration ก่อนเปิดแอป

PWA มี Web App Manifest, ไอคอน 192/512, install prompt, offline fallback และแจ้งเตือนอัปเดต โดยจะไม่ cache API, Vault หรือข้อมูล authenticated ทั้งนี้ PWA ต้องเปิดผ่าน HTTPS หรือ `localhost`

หลัง deploy ให้ตรวจ endpoint ต่อไปนี้:

```text
/manifest.webmanifest
/sw.js
/offline
/api/health
```
