# SouClinic — IA SDR

Backend do agente de SDR via WhatsApp da SouClinic. Ver `../SPEC-IA-SDR.md` pra contexto completo do projeto (decisões, pendências, dados da clínica).

## Setup

```bash
npm install
cp .env.example .env   # preencher ANTHROPIC_API_KEY, VOYAGE_API_KEY, credenciais do Google Calendar
npm run ingest          # popula a base de conhecimento (clinic_documents) no Supabase
```

Supabase já está provisionado (projeto `lnnytmpegreuiceydmuc`, schema aplicado) — as chaves já estão no `.env`.

## Rodar

```bash
npm run dev          # sobe o servidor Fastify (webhook + /dev/chat + dashboard em /admin)
npm run chat -- +5561999999999 "Nome do lead"   # CLI de teste local, sem WhatsApp
```

## Dashboard (`/admin`)

Depois de `npm run dev`, acesse `http://localhost:3000/admin` e entre com a senha do `ADMIN_TOKEN` (já tem um valor gerado no `.env`, pode trocar). Três abas: visão geral (métricas), conversas (inbox) e prompt da IA (editável, salva na tabela `agent_settings`). Compartilhe a URL + senha com o cliente quando estiver em produção.

> **Nota (2026-08-12):** não consegui validar `npm run dev` rodando de ponta a ponta nessa sessão — a máquina estava com pouquíssima memória livre e tanto `tsc` quanto `tsx` ficaram travando. O código passou no primeiro type-check limpo antes disso, mas vale rodar `npm run dev` numa hora com mais memória livre antes de confiar que está tudo certo.

## Pendências pra produção
- `GOOGLE_CLIENT_EMAIL` / `GOOGLE_PRIVATE_KEY` / `GOOGLE_CALENDAR_ID`: credenciais do Google Calendar de teste do Igor.
- `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` / `EVOLUTION_INSTANCE`: instância WhatsApp, criada quando o Igor decidir.
- `VOYAGE_API_KEY`: embeddings pra base de conhecimento (RAG).
- Framework comercial (seção do prompt em `src/agent/systemPrompt.ts`) é uma proposta do Igor — falta validar com o cliente.
