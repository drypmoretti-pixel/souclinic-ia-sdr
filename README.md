# SouClinic — IA SDR

Backend do agente de SDR via WhatsApp da SouClinic. Ver `../SPEC-IA-SDR.md` pra contexto completo do projeto (decisões, pendências, dados da clínica).

Repo: `github.com/drypmoretti-pixel/souclinic-ia-sdr` (privado).

## Setup

```bash
npm install
cp .env.example .env   # preencher OPENAI_API_KEY, credenciais do Google Calendar
npm run ingest          # popula a base de conhecimento (clinic_documents) no Supabase
```

Supabase já está provisionado (projeto `lnnytmpegreuiceydmuc`, schema aplicado) — as chaves já estão no `.env`.

## Rodar

```bash
npm run dev          # sobe o servidor Fastify (webhook + /dev/chat + dashboard em /admin)
npm run chat -- +5561999999999 "Nome do lead"   # CLI de teste local, sem WhatsApp
```

## Dashboard (`/admin`)

Depois de rodar, acesse `/admin` e entre com a senha do `ADMIN_TOKEN`. Duas abas: visão geral (métricas) e conversas (inbox). Não tem edição de prompt por ali de propósito — o prompt é fixo em `src/agent/systemPrompt.ts`, ajustado direto no código.

## Deploy

Rodando em produção na VPS StayCloud (`srv5224724.stayx.cloud`, IP `136.0.53.133`), via `pm2` (processo `souclinic-sdr`). Pra atualizar depois de um push:

```bash
ssh root@136.0.53.133
cd /opt/souclinic-ia-sdr && git pull && npm install && npm run build && pm2 restart souclinic-sdr
```

**Atenção**: essa VPS tem só 4GB de RAM e já roda o n8n nela — fica apertado. Se ficar instável, considerar upgrade de plano ou mover pra uma VPS separada.

## Pendências pra produção
- `GOOGLE_CLIENT_EMAIL` / `GOOGLE_PRIVATE_KEY` / `GOOGLE_CALENDAR_ID`: credenciais do Google Calendar de teste do Igor.
- Framework comercial (em `src/agent/systemPrompt.ts`) é uma proposta do Igor — falta validar com o cliente.
