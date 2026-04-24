# 1. Introduction

## 1.1 What is Apache Kafka?

Apache Kafka is a **distributed event streaming platform** originally developed by LinkedIn and open-sourced in 2011. It is designed to handle high-throughput, fault-tolerant, real-time data pipelines and streaming applications.

At its core, Kafka is a **distributed commit log** — an append-only, ordered sequence of records. Producers write events to Kafka; consumers read them. Unlike traditional message queues, **Kafka retains messages for a configurable period** (days, weeks, or forever), meaning consumers can replay past events.

### Key Characteristics

| Characteristic | Detail |
|---|---|
| **Architecture** | Distributed log / event stream |
| **Message retention** | Configurable (default 7 days, can be indefinite) |
| **Throughput** | Millions of messages/sec |
| **Consumer model** | Pull-based (consumers control pace) |
| **Ordering** | Guaranteed within a partition |
| **Protocol** | Custom binary TCP protocol |
| **Created by** | LinkedIn → Apache Foundation |
| **Written in** | Scala + Java |

### How Kafka Works (High Level)

```
Producer → [ Topic (Partition 0) ] → Consumer Group A
                [ Partition 1   ] → Consumer Group B
                [ Partition 2   ]
```

- **Topics** are categories/feeds of messages
- Topics are split into **partitions** for parallelism and scalability
- Each partition is an ordered, immutable log
- **Consumer groups** allow horizontal scaling — each partition is consumed by exactly one consumer per group
- Kafka cluster is coordinated by **ZooKeeper** (legacy) or **KRaft** (modern, Kafka 3.x+)

### What Makes Kafka Unique

1. **Event replay** — consumers can re-read past messages by resetting their offset
2. **Decoupled throughput** — producers and consumers are completely independent
3. **Durability** — messages are persisted to disk with replication across brokers
4. **Exactly-once semantics** (with configuration) — critical for financial/transactional systems
5. **Kafka Streams & ksqlDB** — built-in stream processing on top of Kafka

### Kafka Ecosystem

```
┌─────────────────────────────────────────────┐
│                Kafka Ecosystem               │
│                                             │
│  Kafka Connect  ──  Kafka Core  ──  ksqlDB  │
│  (Connectors)       (Broker)     (SQL DSL)  │
│                        │                    │
│                  Kafka Streams               │
│                 (Stream Processing)          │
└─────────────────────────────────────────────┘
```

---

## 1.2 What is RabbitMQ?

RabbitMQ is a **message broker** implementing the **AMQP** (Advanced Message Queuing Protocol). Developed by Rabbit Technologies in 2007, it acts as an intermediary that receives, routes, and delivers messages between applications.

RabbitMQ follows the **smart broker / dumb consumer** model — the broker handles complex routing logic, and once a message is acknowledged by a consumer, it is **removed from the queue**.

### Key Characteristics

| Characteristic | Detail |
|---|---|
| **Architecture** | Message broker / queue |
| **Message retention** | Until acknowledged (then deleted) |
| **Throughput** | Tens of thousands to low millions/sec |
| **Consumer model** | Push-based (broker pushes to consumers) |
| **Ordering** | Per-queue FIFO |
| **Protocol** | AMQP 0-9-1 (also STOMP, MQTT, HTTP) |
| **Created by** | Rabbit Technologies (now VMware/Broadcom) |
| **Written in** | Erlang |

### How RabbitMQ Works (High Level)

```
Producer → Exchange → [ Binding ] → Queue → Consumer
               ↓
         (Routing logic)
         direct / topic /
         fanout / headers
```

- **Producers** publish messages to an **Exchange**
- The **Exchange** routes messages to one or more **Queues** based on routing rules (bindings)
- **Consumers** subscribe to queues and receive messages
- Once a consumer **acknowledges** a message, it's gone

### Exchange Types

| Type | Behavior | Example Use Case |
|------|----------|-----------------|
| `direct` | Routes to queue with matching routing key | Task dispatch by type |
| `topic` | Pattern matching on routing key (`*.error`, `orders.#`) | Multi-level event routing |
| `fanout` | Broadcasts to all bound queues | Notifications to all services |
| `headers` | Routes based on message headers | Content-based routing |

### What Makes RabbitMQ Unique

1. **Flexible routing** — Exchange types allow sophisticated message routing without application code
2. **Dead Letter Exchanges (DLX)** — failed/expired messages automatically routed elsewhere
3. **Message TTL & queue TTL** — fine-grained expiry controls
4. **Priority queues** — messages processed by priority, not just arrival order
5. **Request/Reply (RPC)** pattern — native support via `reply_to` and correlation IDs
6. **Shovel & Federation** — move messages between brokers/clusters across networks
7. **Management UI** — built-in browser interface at `:15672`

---

## 1.3 Origin Story & Philosophy

### Kafka's Philosophy
> *"Treat every event as a first-class citizen. Events are facts — immutable, replayable, and ordered."*

Kafka was born from LinkedIn's need to track user activity events (page views, clicks, job applications) at massive scale. The insight was: **a log is the most fundamental data structure** — databases, queues, and streams are all just abstractions over a log.

### RabbitMQ's Philosophy
> *"Route the right message to the right place at the right time."*

RabbitMQ was born from enterprise messaging needs — the need for reliable, routable, transactional message delivery between heterogeneous systems. AMQP was designed as an open wire protocol to replace proprietary enterprise messaging systems (IBM MQ, TIBCO, etc.).

---

## 1.4 At a Glance

```
┌────────────────────┬──────────────────────┬──────────────────────┐
│                    │       Kafka          │      RabbitMQ        │
├────────────────────┼──────────────────────┼──────────────────────┤
│ Model              │ Event Log / Stream   │ Message Queue/Broker │
│ Retention          │ Time/size-based      │ Until ACK            │
│ Replay             │ ✅ Yes               │ ❌ No (by default)   │
│ Routing            │ Topic + Partition    │ Exchange + Binding   │
│ Throughput         │ Very High            │ High                 │
│ Latency            │ Low (ms)             │ Very Low (µs–ms)     │
│ Best for           │ Streaming, pipelines │ Task queues, RPC     │
└────────────────────┴──────────────────────┴──────────────────────┘
```

---

**Next:** [Core Concepts →](../02-core-concepts/README.md)
