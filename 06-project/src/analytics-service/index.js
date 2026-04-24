import { Kafka } from 'kafkajs'

const kafka = new Kafka({ brokers: ['localhost:9092'] })
const consumer = kafka.consumer({ groupId: 'analytics-service' })

await consumer.connect()
await consumer.subscribe({ topic: 'orders.created', fromBeginning: false })

await consumer.run({
  eachMessage: async ({ partition, message }) => {
    const order = JSON.parse(message.value.toString())

    console.log(`[analytics] Order ${order.orderId}`)
    console.log(`  Customer: ${order.customerId}`)
    console.log(`  Amount:   $${order.totalAmount}`)
    console.log(`  Items:    ${order.items.length}`)
    console.log(`  Offset:   ${message.offset} (partition ${partition})`)
  },
})
