import { Kafka } from 'kafkajs'
import { appendFileSync } from 'fs'

const kafka = new Kafka({ brokers: ['localhost:9092'] })
const consumer = kafka.consumer({ groupId: 'audit-logger' })

await consumer.connect()
await consumer.subscribe({ topic: 'orders.created', fromBeginning: true })

await consumer.run({
  eachMessage: async ({ message }) => {
    const order = JSON.parse(message.value.toString())
    const logEntry = `${order.createdAt} | ${order.orderId} | ${order.customerId} | $${order.totalAmount}\n`

    appendFileSync('audit.log', logEntry)
    console.log(`[audit] Logged ${order.orderId}`)
  },
})
