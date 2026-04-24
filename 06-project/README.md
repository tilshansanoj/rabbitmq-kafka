# 6. Project: Order Event Pipeline

## Overview

A hands-on project that uses **both Kafka and RabbitMQ** in a realistic e-commerce order flow, demonstrating where each tool belongs.

```
┌──────────────────────────────────────────────────────────────────┐
│                    Order Event Pipeline                          │
│                                                                  │
│  HTTP POST /order                                                │
│       │                                                          │
│       ▼                                                          │
│  order-service  ──── Kafka ────▶  analytics-service             │
│       │            (event log)  ▶  audit-logger                 │
│       │                                                          │
│       └──── RabbitMQ ──────────▶  email-worker                  │
│            (task dispatch)     ▶  invoice-worker                │
└──────────────────────────────────────────────────────────────────┘
```

### What it demonstrates

| Component | Technology | Pattern |
|-----------|-----------|---------|
| Order created event | Kafka | Event sourcing |
| Multiple event consumers | Kafka Consumer Groups | Fan-out reads |
| Email sending task | RabbitMQ | Work queue |
| Invoice generation task | RabbitMQ | Work queue |
| Failed job retry | RabbitMQ DLX | Dead-letter pattern |

---

## Project Structure

```
06-project/
├── docker-compose.yml
├── package.json
├── src/
│   ├── order-service/
│   │   ├── index.js          # HTTP API + Kafka producer + RabbitMQ publisher
│   │   └── setup.js          # Kafka topic + RabbitMQ exchange/queue setup
│   ├── analytics-service/
│   │   └── index.js          # Kafka consumer (group: analytics)
│   ├── audit-logger/
│   │   └── index.js          # Kafka consumer (group: audit) — reads same events
│   ├── email-worker/
│   │   └── index.js          # RabbitMQ consumer — sends emails
│   └── invoice-worker/
│       └── index.js          # RabbitMQ consumer — generates invoices
└── README.md
```

---

## 6.1 docker-compose.yml

```yaml
version: '3.8'

services:
  kafka:
    image: confluentinc/cp-kafka:7.6.0
    container_name: kafka
    ports:
      - "9092:9092"
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_LOG_DIRS: /var/lib/kafka/data
      CLUSTER_ID: "Mk3OEYBSD5q9GHMErD8ybQ"
    volumes:
      - kafka-data:/var/lib/kafka/data

  rabbitmq:
    image: rabbitmq:3.13-management
    container_name: rabbitmq
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      RABBITMQ_DEFAULT_USER: admin
      RABBITMQ_DEFAULT_PASS: admin123
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq

volumes:
  kafka-data:
  rabbitmq-data:
```

---

## 6.2 package.json

```json
{
  "name": "order-event-pipeline",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "setup": "node src/order-service/setup.js",
    "order-service": "node src/order-service/index.js",
    "analytics": "node src/analytics-service/index.js",
    "audit": "node src/audit-logger/index.js",
    "email": "node src/email-worker/index.js",
    "invoice": "node src/invoice-worker/index.js"
  },
  "dependencies": {
    "kafkajs": "^2.2.4",
    "amqplib": "^0.10.4",
    "express": "^4.19.2"
  }
}
```

---

## 6.3 Setup Script

**`src/order-service/setup.js`** — Run once to create Kafka topics and RabbitMQ topology.

```javascript
import { Kafka } from 'kafkajs'
import amqp from 'amqplib'

// ── Kafka Setup ─────────────────────────────────────────────────
const kafka = new Kafka({ brokers: ['localhost:9092'] })
const admin = kafka.admin()

await admin.connect()
await admin.createTopics({
  topics: [
    {
      topic: 'orders.created',
      numPartitions: 3,
      replicationFactor: 1,
    }
  ]
})
await admin.disconnect()
console.log('✅ Kafka topics created')

// ── RabbitMQ Setup ──────────────────────────────────────────────
const conn = await amqp.connect('amqp://admin:admin123@localhost:5672')
const ch = await conn.createChannel()

// Dead letter exchange
await ch.assertExchange('orders.dlx', 'direct', { durable: true })
await ch.assertQueue('orders.dead', { durable: true })
await ch.bindQueue('orders.dead', 'orders.dlx', 'dead')

// Main task exchange
await ch.assertExchange('orders.tasks', 'fanout', { durable: true })

// Email queue (with DLX)
await ch.assertQueue('tasks.email', {
  durable: true,
  arguments: {
    'x-dead-letter-exchange': 'orders.dlx',
    'x-dead-letter-routing-key': 'dead',
    'x-message-ttl': 60000  // 1min TTL before DLX
  }
})
await ch.bindQueue('tasks.email', 'orders.tasks', '')

// Invoice queue (with DLX)
await ch.assertQueue('tasks.invoice', {
  durable: true,
  arguments: {
    'x-dead-letter-exchange': 'orders.dlx',
    'x-dead-letter-routing-key': 'dead'
  }
})
await ch.bindQueue('tasks.invoice', 'orders.tasks', '')

await ch.close()
await conn.close()
console.log('✅ RabbitMQ exchanges and queues created')
```

---

## 6.4 Order Service

**`src/order-service/index.js`** — Accepts HTTP requests, publishes to Kafka (event) and RabbitMQ (tasks).

```javascript
import express from 'express'
import { Kafka } from 'kafkajs'
import amqp from 'amqplib'

const app = express()
app.use(express.json())

// ── Kafka Producer ───────────────────────────────────────────────
const kafka = new Kafka({ brokers: ['localhost:9092'] })
const producer = kafka.producer()
await producer.connect()
console.log('✅ Kafka producer connected')

// ── RabbitMQ Publisher ──────────────────────────────────────────
const conn = await amqp.connect('amqp://admin:admin123@localhost:5672')
const channel = await conn.createChannel()
console.log('✅ RabbitMQ channel ready')

// ── POST /order ─────────────────────────────────────────────────
app.post('/order', async (req, res) => {
  const order = {
    orderId: `ORD-${Date.now()}`,
    customerId: req.body.customerId,
    items: req.body.items,
    totalAmount: req.body.totalAmount,
    createdAt: new Date().toISOString()
  }

  // 1. Publish to Kafka — event log (all consumers get this)
  await producer.send({
    topic: 'orders.created',
    messages: [{
      key: order.customerId,          // ensures ordering per customer
      value: JSON.stringify(order),
      headers: { source: 'order-service' }
    }]
  })

  // 2. Publish to RabbitMQ — task dispatch (fanout to email + invoice)
  channel.publish(
    'orders.tasks',
    '',   // fanout ignores routing key
    Buffer.from(JSON.stringify(order)),
    { persistent: true, contentType: 'application/json' }
  )

  console.log(`[order-service] Published order ${order.orderId}`)
  res.status(201).json({ orderId: order.orderId, status: 'accepted' })
})

app.listen(3000, () => console.log('Order service listening on :3000'))
```

---

## 6.5 Analytics Service (Kafka Consumer)

**`src/analytics-service/index.js`**

```javascript
import { Kafka } from 'kafkajs'

const kafka = new Kafka({ brokers: ['localhost:9092'] })
const consumer = kafka.consumer({ groupId: 'analytics-service' })

await consumer.connect()
await consumer.subscribe({ topic: 'orders.created', fromBeginning: false })

await consumer.run({
  eachMessage: async ({ topic, partition, message }) => {
    const order = JSON.parse(message.value.toString())

    // Simulate analytics processing
    console.log(`[analytics] Order ${order.orderId}`)
    console.log(`  Customer: ${order.customerId}`)
    console.log(`  Amount:   $${order.totalAmount}`)
    console.log(`  Items:    ${order.items.length}`)
    console.log(`  Offset:   ${message.offset} (partition ${partition})`)
  }
})
```

---

## 6.6 Audit Logger (Kafka Consumer — same topic, different group)

**`src/audit-logger/index.js`**

```javascript
import { Kafka } from 'kafkajs'
import { appendFileSync } from 'fs'

const kafka = new Kafka({ brokers: ['localhost:9092'] })
const consumer = kafka.consumer({ groupId: 'audit-logger' })  // different group!

await consumer.connect()
await consumer.subscribe({ topic: 'orders.created', fromBeginning: true })

await consumer.run({
  eachMessage: async ({ message }) => {
    const order = JSON.parse(message.value.toString())
    const logEntry = `${order.createdAt} | ${order.orderId} | ${order.customerId} | $${order.totalAmount}\n`

    appendFileSync('audit.log', logEntry)
    console.log(`[audit] Logged ${order.orderId}`)
  }
})
```

> Note: `fromBeginning: true` means this service can be restarted and will reprocess all historical events — this is the **Kafka replay** superpower.

---

## 6.7 Email Worker (RabbitMQ Consumer)

**`src/email-worker/index.js`**

```javascript
import amqp from 'amqplib'

const conn = await amqp.connect('amqp://admin:admin123@localhost:5672')
const channel = await conn.createChannel()

channel.prefetch(5)  // max 5 unacked messages at once

channel.consume('tasks.email', async (msg) => {
  if (!msg) return

  const order = JSON.parse(msg.content.toString())

  try {
    // Simulate email sending
    await new Promise(r => setTimeout(r, 200))
    console.log(`[email-worker] Sent confirmation to customer ${order.customerId} for ${order.orderId}`)

    channel.ack(msg)  // success — remove from queue
  } catch (err) {
    console.error(`[email-worker] Failed: ${err.message}`)
    channel.nack(msg, false, false)  // fail — send to DLX (no requeue)
  }
}, { noAck: false })

console.log('[email-worker] Waiting for tasks...')
```

---

## 6.8 Invoice Worker (RabbitMQ Consumer)

**`src/invoice-worker/index.js`**

```javascript
import amqp from 'amqplib'

const conn = await amqp.connect('amqp://admin:admin123@localhost:5672')
const channel = await conn.createChannel()

channel.prefetch(3)

channel.consume('tasks.invoice', async (msg) => {
  if (!msg) return

  const order = JSON.parse(msg.content.toString())

  try {
    await new Promise(r => setTimeout(r, 500))  // simulate PDF generation
    console.log(`[invoice-worker] Generated invoice for ${order.orderId} ($${order.totalAmount})`)

    channel.ack(msg)
  } catch (err) {
    console.error(`[invoice-worker] Failed: ${err.message}`)
    channel.nack(msg, false, false)
  }
}, { noAck: false })

console.log('[invoice-worker] Waiting for tasks...')
```

---

## 6.9 Running the Project

### Step 1 — Start infrastructure

```bash
docker compose up -d
# Wait ~15 seconds for Kafka and RabbitMQ to be ready
```

### Step 2 — Install dependencies

```bash
npm install
```

### Step 3 — Create topics and queues

```bash
npm run setup
```

### Step 4 — Start all services (separate terminals)

```bash
# Terminal 1
npm run order-service

# Terminal 2
npm run analytics

# Terminal 3
npm run audit

# Terminal 4
npm run email

# Terminal 5
npm run invoice
```

### Step 5 — Place an order

```bash
curl -X POST http://localhost:3000/order \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "customer-123",
    "items": [{"sku": "WIDGET-1", "qty": 2}, {"sku": "GADGET-5", "qty": 1}],
    "totalAmount": 149.99
  }'
```

### Expected Output

```
# order-service
[order-service] Published order ORD-1714000000000

# analytics-service
[analytics] Order ORD-1714000000000
  Customer: customer-123
  Amount:   $149.99
  Items:    2

# audit-logger
[audit] Logged ORD-1714000000000

# email-worker
[email-worker] Sent confirmation to customer customer-123 for ORD-1714000000000

# invoice-worker
[invoice-worker] Generated invoice for ORD-1714000000000 ($149.99)
```

---

## 6.10 Experiments to Try

### Experiment 1 — Kafka Replay
Stop the `audit-logger`, place 5 orders, restart it. Watch it process all missed events from its last offset. This demonstrates Kafka's durable event log.

### Experiment 2 — Competing Consumers
Start 3 invoice workers (`npm run invoice` in 3 terminals). Place 10 orders simultaneously. Watch RabbitMQ distribute work across all 3 workers — each message processed exactly once.

### Experiment 3 — Dead Letter
Temporarily add `throw new Error('simulated failure')` in `email-worker/index.js`. Send an order. Check RabbitMQ Management UI at http://localhost:15672 → Queues → `orders.dead` — the failed message should appear there.

### Experiment 4 — Consumer Lag
Stop the analytics service. Place 20 orders. Check Kafka UI at http://localhost:8080 → Consumer Groups → see the consumer lag grow. Restart analytics and watch it catch up.

---

## 6.11 Key Learnings from this Project

| Observation | Why |
|-------------|-----|
| Analytics and audit both receive every order | Kafka consumer groups are independent — each gets its own copy |
| Audit replays history on restart | Kafka retains events; `fromBeginning: true` re-reads the log |
| Email and invoice both receive every order | RabbitMQ fanout exchange broadcasts to all bound queues |
| Multiple invoice workers share the load | Competing consumers on same RabbitMQ queue — each message once |
| Failed email goes to dead queue, not lost | RabbitMQ DLX catches nack'd messages |
| Orders for same customer are ordered | Kafka key-based partitioning ensures order within a partition |

---

**← Back to [Setup](../05-setup/README.md)** | **[Main Index](../README.md)**
