# 2. Core Concepts

## 2.1 Kafka Core Concepts

### Broker
A single Kafka server. A **Kafka cluster** is a group of brokers. Each broker holds a subset of topic partitions. Brokers handle reads/writes and replicate data to peers.

```
Cluster
├── Broker 1  (leader for partition 0, 2)
├── Broker 2  (leader for partition 1; replica for 0, 2)
└── Broker 3  (replica for 1)
```

### Topic
A named category or feed. Analogous to a database table or folder. Topics are **multi-producer, multi-consumer**.

```bash
# Create a topic with 3 partitions, replication factor 2
kafka-topics.sh --create \
  --topic orders \
  --partitions 3 \
  --replication-factor 2
```

### Partition
Topics are split into partitions for **scalability**. Each partition is:
- An **ordered, immutable sequence** of records
- Stored on disk
- Assigned a **leader broker** that handles reads/writes

Partitioning allows parallelism — N consumers can read N partitions simultaneously.

### Offset
A sequential ID assigned to each message within a partition. Consumers track their position using offsets.

```
Partition 0:  [0] [1] [2] [3] [4] [5] ...
                              ↑
                       Consumer offset
```

Consumers can:
- **Commit offsets** to Kafka (automatic or manual)
- **Seek to any offset** to replay from any point
- **Reset to earliest** to reprocess all events

### Producer
Publishes records to topics. Producers can:
- Choose a partition (round-robin, key-based, or custom)
- Configure acknowledgment levels (`acks=0/1/all`)
- Enable idempotence for exactly-once delivery

```javascript
// Key-based partitioning — same key always goes to same partition
producer.send({
  topic: 'orders',
  key: 'customer-123',   // ensures ordering per customer
  value: JSON.stringify(order)
})
```

### Consumer & Consumer Group
- A **Consumer** reads from one or more partitions
- A **Consumer Group** is a set of consumers sharing the work
- Each partition is assigned to **exactly one consumer** per group
- Multiple groups can consume the same topic independently

```
Topic: orders (3 partitions)

Consumer Group A (payment-service):
  Consumer A1 → Partition 0
  Consumer A2 → Partition 1
  Consumer A3 → Partition 2

Consumer Group B (analytics-service):
  Consumer B1 → Partition 0, 1, 2   (single consumer, all partitions)
```

### Replication & Leader Election
- Each partition has one **leader** and N-1 **followers**
- Leaders handle all reads/writes
- Followers replicate asynchronously
- If a leader dies, Kafka elects a new leader from ISR (In-Sync Replicas)

### Retention Policy
Kafka retains messages based on:
- **Time**: `log.retention.hours=168` (default 7 days)
- **Size**: `log.retention.bytes=1073741824`
- **Compaction**: Keep only the latest value per key (useful for state)

---

## 2.2 RabbitMQ Core Concepts

### Connection & Channel
- **Connection**: A TCP connection between client and broker (expensive)
- **Channel**: A virtual connection multiplexed over a TCP connection (cheap)
- Best practice: one connection per process, one channel per thread

```
Application Process
└── TCP Connection
    ├── Channel 1 (publisher)
    ├── Channel 2 (consumer)
    └── Channel 3 (admin)
```

### Exchange
The entry point for messages. Exchanges receive messages from producers and route them to queues using **bindings**.

```
Producer → Exchange (routing logic) → Queue(s) → Consumer
```

**Exchange types:**

```
direct:  routingKey == bindingKey     (exact match)
topic:   routingKey matches pattern   (wildcards: * = one word, # = zero+)
fanout:  broadcast to all queues      (ignores routing key)
headers: match on message headers     (ignores routing key)
```

### Queue
Stores messages until consumed. Properties:

| Property | Description |
|----------|-------------|
| `durable` | Survives broker restart |
| `exclusive` | Only one consumer, deleted when connection closes |
| `auto-delete` | Deleted when last consumer unsubscribes |
| `x-message-ttl` | Message expiry in ms |
| `x-max-length` | Max queue depth |
| `x-dead-letter-exchange` | Where rejected/expired messages go |

### Binding
A rule that connects an exchange to a queue, with an optional **routing key** or **binding key**.

```
Exchange "orders" --[routing_key: "order.created"]--> Queue "order-processing"
Exchange "orders" --[routing_key: "order.*"       ]--> Queue "order-audit"
Exchange "notify" --[fanout                        ]--> Queue "email-notify"
                                                   +--> Queue "sms-notify"
                                                   +--> Queue "push-notify"
```

### Message Acknowledgment
RabbitMQ requires consumers to **acknowledge** messages:

```javascript
channel.consume('orders', (msg) => {
  try {
    process(msg)
    channel.ack(msg)              // success — remove from queue
  } catch (err) {
    channel.nack(msg, false, true) // failure — requeue
  }
})
```

- `ack` — processed successfully, remove message
- `nack` / `reject` — failed, optionally requeue or dead-letter

### Dead Letter Exchange (DLX)
Messages are dead-lettered when:
- Rejected with `requeue=false`
- TTL expires
- Queue length limit exceeded

```
Queue "orders" --[DLX]--> Exchange "orders.dlx" --> Queue "orders.dead"
```

### Prefetch / QoS
Limit how many unacknowledged messages a consumer holds at once:

```javascript
channel.prefetch(10) // consumer gets max 10 msgs before ACKing
```

This prevents a slow consumer from being overwhelmed.

---

## 2.3 Concept Mapping

| Kafka | RabbitMQ | Notes |
|-------|----------|-------|
| Topic | Exchange + Queue | Kafka combines routing and storage in topic |
| Partition | Queue | Kafka partitions are ordered; RabbitMQ queues are FIFO |
| Consumer Group | Competing consumers on a queue | Similar effect, different mechanism |
| Offset | Delivery tag | Kafka offsets are persistent; RabbitMQ tags are ephemeral |
| Broker | Broker/Node | Kafka brokers = storage; RMQ brokers = routing + storage |
| ZooKeeper/KRaft | Mnesia (Erlang DB) | Cluster coordination mechanism |
| Kafka Connect | Shovel/Federation | Data movement plugins |
| Kafka Streams | - | No direct equivalent in RabbitMQ |

---

**Next:** [Differences →](../03-differences/README.md)
