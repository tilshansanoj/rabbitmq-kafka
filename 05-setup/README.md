# 5. Local Setup

## 5.1 Docker Compose — Full Stack

This setup runs Kafka (KRaft mode, no ZooKeeper) + RabbitMQ locally.

### `docker-compose.yml`

```yaml
version: '3.8'

services:

  # ─── Kafka (KRaft mode) ────────────────────────────────────────
  kafka:
    image: confluentinc/cp-kafka:7.6.0
    container_name: kafka
    ports:
      - "9092:9092"       # external client
      - "9101:9101"       # JMX
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
    healthcheck:
      test: kafka-broker-api-versions --bootstrap-server localhost:9092
      interval: 10s
      timeout: 5s
      retries: 5

  # ─── Kafka UI ──────────────────────────────────────────────────
  kafka-ui:
    image: provectuslabs/kafka-ui:latest
    container_name: kafka-ui
    ports:
      - "8080:8080"
    environment:
      KAFKA_CLUSTERS_0_NAME: local
      KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka:9092
    depends_on:
      kafka:
        condition: service_healthy

  # ─── RabbitMQ ──────────────────────────────────────────────────
  rabbitmq:
    image: rabbitmq:3.13-management
    container_name: rabbitmq
    ports:
      - "5672:5672"     # AMQP
      - "15672:15672"   # Management UI
    environment:
      RABBITMQ_DEFAULT_USER: admin
      RABBITMQ_DEFAULT_PASS: admin123
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq
    healthcheck:
      test: rabbitmq-diagnostics -q ping
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  kafka-data:
  rabbitmq-data:
```

### Start

```bash
docker compose up -d

# Verify
docker compose ps
```

### Access

| Service | URL | Credentials |
|---------|-----|-------------|
| Kafka broker | `localhost:9092` | - |
| Kafka UI | http://localhost:8080 | - |
| RabbitMQ AMQP | `localhost:5672` | admin / admin123 |
| RabbitMQ Management | http://localhost:15672 | admin / admin123 |

---

## 5.2 Kafka CLI Quick Reference

```bash
# Enter Kafka container
docker exec -it kafka bash

# List topics
kafka-topics --bootstrap-server localhost:9092 --list

# Create topic
kafka-topics --bootstrap-server localhost:9092 \
  --create --topic orders \
  --partitions 3 \
  --replication-factor 1

# Describe topic
kafka-topics --bootstrap-server localhost:9092 \
  --describe --topic orders

# Produce messages
kafka-console-producer --bootstrap-server localhost:9092 \
  --topic orders \
  --property "key.separator=:" \
  --property "parse.key=true"
# Type: customer-1:{"orderId":"abc"}

# Consume from beginning
kafka-console-consumer --bootstrap-server localhost:9092 \
  --topic orders \
  --from-beginning \
  --property "print.key=true"

# List consumer groups
kafka-consumer-groups --bootstrap-server localhost:9092 --list

# Check consumer group lag
kafka-consumer-groups --bootstrap-server localhost:9092 \
  --describe --group my-service
```

---

## 5.3 RabbitMQ CLI Quick Reference

```bash
# Enter RabbitMQ container
docker exec -it rabbitmq bash

# List queues
rabbitmqctl list_queues name messages consumers

# List exchanges
rabbitmqctl list_exchanges

# List bindings
rabbitmqctl list_bindings

# Purge a queue
rabbitmqctl purge_queue my-queue

# Check node status
rabbitmqctl status
```

Or use the **Management UI** at http://localhost:15672 — create exchanges, queues, bindings, and publish test messages via the browser.

---

## 5.4 Node.js Dependencies

```bash
# Kafka
npm install kafkajs

# RabbitMQ
npm install amqplib
```

---

**Next:** [Project →](../06-project/README.md)
