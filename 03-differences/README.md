# 3. Differences

## 3.1 Architecture Difference

The most fundamental difference is **what they are**:

```
┌──────────────────────────────────────────────────────────┐
│  RabbitMQ — Message Broker                               │
│                                                          │
│  Producer → [Exchange] → [Queue] → Consumer             │
│                                                          │
│  - Broker is smart (routing, filtering, transformation)  │
│  - Consumer is simple (just process and ACK)             │
│  - Message deleted after ACK                             │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  Kafka — Distributed Event Log                           │
│                                                          │
│  Producer → [Topic/Partition Log] ← Consumer            │
│                                                          │
│  - Broker is dumb (just stores and serves)               │
│  - Consumer is smart (tracks offsets, controls pace)     │
│  - Message retained per policy (not deleted on read)     │
└──────────────────────────────────────────────────────────┘
```

---

## 3.2 Head-to-Head Comparison

### Message Retention

| | Kafka | RabbitMQ |
|--|-------|----------|
| Default | 7 days | Until ACK |
| After consumption | Still exists | Deleted |
| Replay support | ✅ Yes (seek to offset) | ❌ No (message gone) |
| Compaction | ✅ Key-based compaction | ❌ No |
| Use case | Audit log, event sourcing | Task queue, fire-and-forget |

**Kafka example — replay:**
```bash
# Reset consumer group to beginning
kafka-consumer-groups.sh --reset-offsets \
  --group payment-service \
  --topic orders \
  --to-earliest \
  --execute
```

**RabbitMQ — messages are gone after ACK.** You can implement replay by publishing to a separate "replay" queue, but it's not native.

---

### Message Ordering

| | Kafka | RabbitMQ |
|--|-------|----------|
| Guaranteed ordering | Within a partition | Within a queue |
| Global ordering | ❌ Only if 1 partition (kills scale) | ❌ Multiple consumers break order |
| Ordered per entity | ✅ Use entity ID as key | ⚠️ Use per-entity queue |

**Kafka key-based ordering:**
```javascript
// All events for customer 123 land in the same partition — ordered
producer.send({ topic: 'orders', key: 'customer-123', value: payload })
```

---

### Throughput & Latency

| Metric | Kafka | RabbitMQ |
|--------|-------|----------|
| Throughput | 1M+ msg/sec per broker | 20K–100K msg/sec |
| Latency | ~2–5ms (tunable) | ~1ms (push-based) |
| Best for | Volume-first | Latency-first |

Kafka achieves high throughput via:
- **Sequential disk I/O** (append-only log)
- **Zero-copy** sendfile syscall
- **Batching** at producer and consumer level
- **Page cache** exploitation

RabbitMQ achieves low latency via:
- **Push model** — broker immediately pushes to consumer
- **Erlang's lightweight processes** — each connection is a process
- **In-memory queues** (non-durable)

---

### Consumer Model

**Kafka — Pull:**
```
Consumer polls broker: "Give me up to 500 messages"
Broker returns batch
Consumer processes
Consumer commits offset
```
- Consumer controls pace
- Natural backpressure
- Batch processing friendly
- Slight latency overhead from polling

**RabbitMQ — Push:**
```
Consumer registers interest
Broker pushes message as soon as available
Consumer processes
Consumer sends ACK
```
- Lower latency
- `prefetch` prevents consumer overload
- Broker manages delivery

---

### Routing

**Kafka routing** is simple — route by topic name and partition key:
```javascript
// Route to topic
producer.send({ topic: 'orders.created' })
producer.send({ topic: 'orders.shipped' })
// Partition by order ID for ordering guarantees
producer.send({ topic: 'orders', key: orderId })
```

**RabbitMQ routing** is powerful — exchange types enable complex routing:
```javascript
// Topic exchange with wildcard routing
channel.bindQueue('eu-orders', 'orders', 'orders.eu.*')
channel.bindQueue('all-orders', 'orders', 'orders.#')
channel.bindQueue('urgent',     'orders', '*.urgent')

// Publish with routing key
channel.publish('orders', 'orders.eu.urgent', Buffer.from(msg))
// Routes to: eu-orders, all-orders, urgent
```

---

### Delivery Guarantees

| Guarantee | Kafka | RabbitMQ |
|-----------|-------|----------|
| At-most-once | ✅ (`acks=0`) | ✅ (no ACK, autoACK) |
| At-least-once | ✅ (default) | ✅ (manual ACK) |
| Exactly-once | ✅ (idempotent producer + transactions) | ⚠️ Hard (needs dedup logic) |

**Kafka exactly-once:**
```javascript
const producer = kafka.producer({
  idempotent: true,          // deduplicates retries
  transactionalId: 'tx-1'   // enables transactions
})
await producer.transaction(async (tx) => {
  await tx.send({ topic: 'orders', messages: [...] })
  await tx.sendOffsets({ consumer, topics: [...] })
})
```

---

### Scaling

**Kafka — horizontal scale by adding partitions:**
```
Topic "orders" with 6 partitions → 6 consumers in group can run in parallel
Add partition → add consumer → linear scale
```
⚠️ You cannot reduce partition count without recreating the topic.

**RabbitMQ — horizontal scale by competing consumers:**
```
Queue "orders" → Consumer 1
              → Consumer 2
              → Consumer 3
Add more consumers → more throughput (up to queue limit)
```
Simpler to scale down. Can dynamically add/remove consumers.

---

### Operations & Management

| Aspect | Kafka | RabbitMQ |
|--------|-------|----------|
| Management UI | Kafka UI (3rd party), Confluent Control Center | Built-in Management UI (:15672) |
| Config complexity | High (many tuning knobs) | Medium |
| Cluster setup | Complex (ZooKeeper or KRaft) | Simpler (Erlang clustering) |
| Monitoring | JMX, Prometheus exporter | Built-in metrics, Prometheus plugin |
| Cloud managed | MSK (AWS), Confluent Cloud, Aiven | AmazonMQ, CloudAMQP, Aiven |

---

## 3.3 Decision Matrix

```
┌─────────────────────────────────────────────────────────────────┐
│ USE KAFKA WHEN:                                                 │
│  ✓ You need event replay / audit trail                         │
│  ✓ High throughput (>100K msg/sec)                             │
│  ✓ Event sourcing or CQRS architecture                         │
│  ✓ Stream processing (aggregations, joins, windowing)          │
│  ✓ Multiple independent consumers of same events               │
│  ✓ Long-term event storage                                     │
│  ✓ Data pipeline / CDC (Change Data Capture)                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ USE RABBITMQ WHEN:                                              │
│  ✓ Task queues (background jobs, workers)                      │
│  ✓ Complex routing logic between services                      │
│  ✓ Request/Reply (RPC) patterns                                │
│  ✓ Message priority is important                               │
│  ✓ Dead-letter / retry logic is critical                       │
│  ✓ Low-latency delivery matters more than throughput           │
│  ✓ Messages should not persist after consumption               │
└─────────────────────────────────────────────────────────────────┘
```

---

**Next:** [Use Cases →](../04-use-cases/README.md)
