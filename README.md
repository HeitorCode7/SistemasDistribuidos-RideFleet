# RideFleet — Serviço de Transporte Distribuído

Implementação simplificada dos 5 mecanismos de SD exigidos no projeto da disciplina **SIN 142 — Sistemas Distribuídos (UFV 2026/1)**.

---

## Hierarquia de Pastas

```
ridefleet/
├── config/
│   ├── index.js              # Carrega variáveis de ambiente
│   └── prometheus.yml        # Configuração do Prometheus (usado no Docker)
│
├── frontend/
│   └── public/
│       └── index.html        # Front-end (SPA pura, sem framework)
│
├── src/
│   ├── locks/
│   │   └── distributed-lock.js   # REQ 1 — Travas Distribuídas
│   │
│   ├── saga/
│   │   └── ride-saga.js          # REQ 2 — Commit Distribuído / Saga
│   │
│   ├── consensus/
│   │   └── auction.js            # REQ 3 — Consenso / Leilão
│   │
│   ├── circuit-breaker/
│   │   └── circuit-breaker.js    # REQ 4 — Circuit Breaker
│   │
│   ├── logical-clock/
│   │   └── lamport-clock.js      # REQ 5 — Relógio de Lamport
│   │
│   ├── middleware/
│   │   └── metrics.js            # Observabilidade — Prometheus
│   │
│   ├── routes/
│   │   ├── rides.js              # POST/GET /api/rides
│   │   ├── auction.js            # POST /api/auction/propose
│   │   └── audit.js              # GET /api/audit/*
│   │
│   ├── __tests__/
│   │   └── mechanisms.test.js    # Testes dos 5 mecanismos
│   │
│   └── index.js                  # Ponto de entrada do servidor
│
├── .env.example                  # Modelo de configuração
├── Dockerfile
├── docker-compose.yml            # Sobe 3 instâncias + Prometheus + Grafana
├── jest.config.json
└── package.json
```

---

## Pré-requisitos

- **Node.js 18+** (para rodar sem Docker)
- **Docker + Docker Compose** (para rodar a federação completa)

---

## Como Rodar

### Opção 1 — Desenvolvimento local (um único serviço)

```bash
# 1. Instale as dependências
npm install

# 2. Copie e edite o .env
cp .env.example .env
# Edite SERVICE_ID, PORT e PARTNERS conforme necessário

# 3. Inicie o servidor
npm start
# ou com reload automático:
npm run dev
```

Acesse:
- **Front-end:** http://localhost:3000
- **API REST:** http://localhost:3000/api
- **Métricas (Prometheus):** http://localhost:3000/metrics
- **Health:** http://localhost:3000/health

---

### Opção 2 — Federação completa com Docker Compose (3 grupos + Prometheus + Grafana)

```bash
# Sobe todos os serviços
docker compose up --build

# Ou em background:
docker compose up --build -d
```

Serviços disponíveis:

| Serviço       | URL                        |
|---------------|----------------------------|
| Grupo A       | http://localhost:3000      |
| Grupo B       | http://localhost:3001      |
| Grupo C       | http://localhost:3002      |
| Prometheus    | http://localhost:9090      |
| Grafana       | http://localhost:3010      |

**Login Grafana:** admin / ridefleet

Para derrubar um serviço e testar o Circuit Breaker:
```bash
docker compose stop grupo-b
# Observe as transições CLOSED -> OPEN no front-end (aba Circuit Breakers)
docker compose start grupo-b
# O CB voltará para HALF_OPEN -> CLOSED após o recovery timeout
```

---

### Opção 3 — Múltiplos processos locais (sem Docker)

```bash
# Terminal 1 — Grupo A
SERVICE_ID=grupo-a PORT=3000 PARTNERS=grupo-b:http://localhost:3001 node src/index.js

# Terminal 2 — Grupo B
SERVICE_ID=grupo-b PORT=3001 PARTNERS=grupo-a:http://localhost:3000 node src/index.js
```

---

## Rodando os Testes

```bash
npm test

# Com cobertura:
npm test -- --coverage

# Watch mode:
npm run test:watch
```

---

## API Reference

### Corridas

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `POST` | `/api/rides` | Solicitar nova corrida |
| `GET`  | `/api/rides` | Listar todas as corridas |
| `GET`  | `/api/rides/:rideId` | Detalhes de uma corrida |
| `POST` | `/api/rides/:rideId/accept` | Aceitar delegação (chamado por parceiros) |
| `PATCH`| `/api/rides/:rideId/state` | Avançar estado manualmente (testes) |

**Exemplo — solicitar corrida:**
```bash
curl -X POST http://localhost:3000/api/rides \
  -H "Content-Type: application/json" \
  -d '{"passengerId":"p1","origin":"UFV","destination":"Centro"}'
```

### Leilão

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `POST` | `/api/auction/propose` | Receber solicitação de proposta de leilão |

### Auditoria / Observabilidade

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/audit/status` | Status geral do serviço |
| `GET` | `/api/audit/causal/:rideId` | Log causal de uma corrida (Lamport) |
| `GET` | `/api/audit/clock` | Estado atual do relógio lógico |
| `GET` | `/api/audit/locks` | Locks distribuídos ativos |
| `GET` | `/api/audit/circuit-breakers` | Estado dos circuit breakers |
| `GET` | `/metrics` | Métricas Prometheus |

---

## Mecanismos Implementados

### REQ 1 — Travas Distribuídas (`src/locks/distributed-lock.js`)
- Lock baseado em Map em memória com TTL (lease)
- Detecção de contenção: retorna `acquired: false` com o dono atual
- Expiração automática por `setTimeout`
- Em produção multi-nó: substitua o Map por **Redis Redlock** ou **etcd**

### REQ 2 — Saga (`src/saga/ride-saga.js`)
- Máquina de estados: `request → match → confirm → in_transit → complete`
- Transições validadas explicitamente
- Compensação automática em caso de falha (leva a `COMPENSATING → CANCELLED`)
- Histórico de transições com timestamp de Lamport

### REQ 3 — Consenso / Leilão (`src/consensus/auction.js`)
- Broadcast para todos os parceiros via `Promise.allSettled` (não bloqueia em falhas parciais)
- Critério de seleção determinístico: menor ETA → menor preço → menor serviceId
- Timeout configurável (`AUCTION_TIMEOUT_MS`)
- Proteção contra respostas de serviços desconhecidos

### REQ 4 — Circuit Breaker (`src/circuit-breaker/circuit-breaker.js`)
- Três estados: `CLOSED → OPEN → HALF_OPEN → CLOSED`
- Threshold e recovery timeout configuráveis
- Fallback automático: se OPEN, tenta próximo parceiro no leilão
- Histórico de transições para observabilidade

### REQ 5 — Relógio de Lamport (`src/logical-clock/lamport-clock.js`)
- Incrementa a cada evento local
- Aplica regra `max(local, recebido) + 1` ao receber mensagens externas
- Log causal filtrável por `rideId`
- Endpoint `/api/audit/causal/:rideId` retorna o log ordenado por happened-before

---

## Configuração do Grafana

Após subir via Docker Compose:

1. Acesse http://localhost:3010 (admin/ridefleet)
2. Adicione datasource: **Prometheus** → `http://prometheus:9090`
3. Importe um dashboard ou crie painéis com as métricas:

| Métrica | O que mede |
|---------|-----------|
| `ridefleet_locks_acquired_total` | Locks adquiridos |
| `ridefleet_lock_contentions_total` | Contenção de locks |
| `ridefleet_locks_expired_total` | Locks expirados (TTL) |
| `ridefleet_ride_state_transitions_total` | Transições por estado |
| `ridefleet_saga_compensations_total` | Compensações da saga |
| `ridefleet_cb_state_changes_total` | Transições do circuit breaker |
| `ridefleet_auctions_completed_total` | Leilões com vencedor |
| `ridefleet_rides_delegated_total` | Corridas delegadas por parceiro |
| `ridefleet_http_request_duration_seconds` | Latência HTTP |

---

## Integração com o Core (outros grupos)

O serviço expõe os endpoints que o core precisará:

```
POST /api/rides/:rideId/accept   — receber delegação
POST /api/auction/propose        — participar de leilão
GET  /metrics                    — métricas Prometheus
GET  /health                     — health check
```

O schema de payload é:

```json
// POST /api/auction/propose
{
  "rideId": "uuid",
  "origin": "string",
  "destination": "string",
  "auctionTs": 42,
  "requesterServiceId": "grupo-a"
}

// Resposta
{
  "serviceId": "grupo-b",
  "eta": 5,
  "price": 12.50,
  "availableDrivers": 3,
  "replyTs": 43
}
```

---

## Notas de Implementação

- **In-memory por design**: todos os mecanismos usam memória do processo para simplicidade.
  Em produção real: locks → Redis, saga state → banco de dados, clock → persistido.
- **Sem bibliotecas de abstração**: os mecanismos estão implementados explicitamente,
  sem depender de libs que escondam o funcionamento (ex: não usa `node-circuit-breaker`,
  não usa `redlock` diretamente — a lógica está em `distributed-lock.js`).
- **WebSocket**: o servidor expõe WebSocket na mesma porta para o front-end receber
  atualizações em tempo real sem polling.
/ /   t e s t e   d e p l o y  
 