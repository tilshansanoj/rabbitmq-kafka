import { Kafka } from 'kafkajs'
import amqp from 'amqplib'

// Kafka setup
const kafka = new Kafka({ brokers: ['localhost:9092'] })
const admin = kafka.admin()

await admin.connect()
await admin.createTopics({
  topics: [
    {
      topic: 'orders.created',
      numPartitions: 3,
      replicationFactor: 1,
    },
  ],
})
await admin.disconnect()
console.log('Kafka topics created')

// RabbitMQ setup
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
    'x-message-ttl': 60000,
  },
})
await ch.bindQueue('tasks.email', 'orders.tasks', '')

// Invoice queue (with DLX)
await ch.assertQueue('tasks.invoice', {
  durable: true,
  arguments: {
    'x-dead-letter-exchange': 'orders.dlx',
    'x-dead-letter-routing-key': 'dead',
  },
})
await ch.bindQueue('tasks.invoice', 'orders.tasks', '')

await ch.close()
await conn.close()
console.log('RabbitMQ exchanges and queues created')
