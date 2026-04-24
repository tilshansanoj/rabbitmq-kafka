# Kafka & RabbitMQ — Complete Learning Guide

> A structured reference for understanding, comparing, and building with Apache Kafka and RabbitMQ.

---

## Table of Contents

| # | Section | Description |
|---|---------|-------------|
| 1 | [Introduction](./01-introduction/README.md) | What is Kafka? What is RabbitMQ? |
| 2 | [Core Concepts](./02-core-concepts/README.md) | Brokers, Topics, Queues, Consumers, Producers |
| 3 | [Differences](./03-differences/README.md) | Head-to-head comparison |
| 4 | [Use Cases](./04-use-cases/README.md) | When to use which |
| 5 | [Setup](./05-setup/README.md) | Local setup with Docker Compose |
| 6 | [Project](./06-project/README.md) | Hands-on project: Order Event Pipeline |

---

## Quick Decision Guide

```
Need to replay events / audit log?        → Kafka
Need complex routing / RPC patterns?      → RabbitMQ
High-throughput data streaming?           → Kafka
Microservice task queues?                 → RabbitMQ
Event sourcing / CQRS?                    → Kafka
Simple pub/sub between services?          → Either (RabbitMQ simpler)
```

---

## Prerequisites

- Docker + Docker Compose
- Node.js 18+ (for project)
- Basic understanding of async messaging concepts
