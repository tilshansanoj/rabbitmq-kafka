# 4. Use Cases

## 4.1 Kafka Use Cases

### 4.1.1 Real-Time Event Streaming

Stream user activity, clickstreams, IoT sensor data, or application events at scale.

```
Mobile App → Kafka (user-events) → Analytics Service → Dashboard
                                 → ML Feature Store
                                 → Personalization Engine
```

**Why Kafka:** Multiple consumers, high volume, each consuming at their own pace.

---

### 4.1.2 Event Sourcing & CQRS

Store every state change as an event. Reconstruct state by replaying events.

```
Order Service → Kafka (order-events) → Order Read Model (CQRS query side)
                                     → Inventory Service
                                     → Billing Service
                                     → Audit Log
```

**Why Kafka:** Immutable log, event replay, multiple projections from one stream.

---

### 4.1.3 Change Data Capture (CDC)

Capture database changes and stream them to other systems using Kafka Connect + Debezium.

```
PostgreSQL (WAL) → Debezium → Kafka (db.public.orders) → Elasticsearch
                                                        → Data Warehouse
                                                        → Cache Invalidation
```

**Why Kafka:** Kafka Connect ecosystem, exactly-once delivery, replayable CDC history.

---

### 4.1.4 Log Aggregation Pipeline

Centralize logs from distributed services.

```
Service A ┐
Service B ├→ Kafka (app-logs) → Logstash/Fluentd → Elasticsearch → Kibana
Service C ┘
```

**Why Kafka:** High throughput, buffering for downstream slowness, multiple log consumers.

---

### 4.1.5 Microservice Event Bus

Decouple microservices via events.

```
Order Created → Kafka → Payment Service (charges card)
                      → Inventory Service (reserves stock)
                      → Notification Service (emails customer)
                      → Analytics Service (tracks conversion)
```

**Why Kafka:** Decoupled, each service independent, new consumers added without touching producers.

---

### 4.1.6 Stream Processing

Use Kafka Streams or ksqlDB for real-time computations.

```sql
-- ksqlDB: real-time order aggregation
CREATE TABLE orders_per_minute AS
  SELECT customerId, COUNT(*) AS orderCount, SUM(amount) AS totalAmount
  FROM orders
  WINDOW TUMBLING (SIZE 1 MINUTE)
  GROUP BY customerId;
```

**Why Kafka:** Native stream processing without external systems.

---

## 4.2 RabbitMQ Use Cases

### 4.2.1 Background Job Processing

Offload slow tasks (image resizing, email sending, PDF generation) to workers.

```
API Request → RabbitMQ (jobs.email) → Email Worker 1
                                    → Email Worker 2
                                    → Email Worker 3
```

**Why RabbitMQ:** Simple worker pattern, easy horizontal scaling, ACK ensures job completion.

---

### 4.2.2 Microservice RPC (Request/Reply)

Service A calls Service B asynchronously and waits for a response.

```javascript
// Client
const correlationId = uuid()
channel.sendToQueue('rpc.pricing', payload, {
  replyTo: 'amq.rabbitmq.reply-to',
  correlationId
})

// Server
channel.consume('rpc.pricing', (msg) => {
  const price = calculatePrice(msg.content)
  channel.sendToQueue(msg.properties.replyTo, price, {
    correlationId: msg.properties.correlationId
  })
})
```

**Why RabbitMQ:** Native `replyTo` + `correlationId` support, direct reply-to optimization.

---

### 4.2.3 Fan-Out Notifications

Send one event to multiple subscribers simultaneously.

```
Order Shipped → Exchange (fanout) → Queue: email-service
                                  → Queue: sms-service
                                  → Queue: push-service
                                  → Queue: crm-service
```

**Why RabbitMQ:** Fanout exchange — zero routing config, all queues receive instantly.

---

### 4.2.4 Priority-Based Task Processing

High-priority tasks (e.g., premium customers) jump the queue.

```javascript
// Declare priority queue (max priority: 10)
channel.assertQueue('tasks', { arguments: { 'x-max-priority': 10 } })

// Send high priority
channel.sendToQueue('tasks', payload, { priority: 8 })

// Send low priority
channel.sendToQueue('tasks', payload, { priority: 1 })
```

**Why RabbitMQ:** Built-in priority queue support (Kafka has no native priority).

---

### 4.2.5 Dead Letter & Retry Patterns

Automatically retry failed messages with backoff.

```
Queue: orders
  → Processing fails
  → Message sent to DLX: orders.dlx
  → After 30s TTL: re-routed to orders (retry)
  → After 3 retries: routed to orders.dead (manual investigation)
```

```javascript
channel.assertQueue('orders', {
  arguments: {
    'x-dead-letter-exchange': 'orders.dlx',
    'x-dead-letter-routing-key': 'orders.dead'
  }
})
```

**Why RabbitMQ:** First-class DLX support, TTL-based retry without application code.

---

### 4.2.6 Work Queue with Competing Consumers

Multiple workers consume from a shared queue — each message processed once.

```
Queue: video-encoding
  Worker 1 → takes job A (encodes 720p)
  Worker 2 → takes job B (encodes 1080p)
  Worker 3 → takes job C (encodes 4K)
```

**Why RabbitMQ:** Round-robin dispatch, easy to add/remove workers, prefetch for load balance.

---

## 4.3 Using Both Together

In practice, large systems use **both**:

```
┌─────────────────────────────────────────────────────────────┐
│                    E-commerce Platform                       │
│                                                             │
│  User Action → Kafka (event log) → Analytics             │
│                      │           → CDC to warehouse        │
│                      ↓                                     │
│             Order Service                                   │
│                  │                                          │
│                  ↓                                          │
│             RabbitMQ (task dispatch)                        │
│               → Email Worker (send confirmation)           │
│               → Invoice Worker (generate PDF)              │
│               → Shipping Worker (notify 3PL)               │
└─────────────────────────────────────────────────────────────┘
```

- **Kafka** = event backbone, long-term record, multiple consumers
- **RabbitMQ** = task execution, short-lived jobs, complex routing

---

**Next:** [Setup →](../05-setup/README.md)
