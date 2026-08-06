FROM node:22-bookworm-slim

WORKDIR /app

ENV DATABASE_URL=file:/tmp/build.db

COPY . .
RUN npm ci \
  && npm run db:generate \
  && npm run build

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/data/dev.db

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["sh", "-c", "npm run db:deploy && npm run start --workspace=@tinypersonal/personal-app -- --hostname 0.0.0.0 --port 3000"]
