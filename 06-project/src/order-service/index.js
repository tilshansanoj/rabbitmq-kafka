import express from 'express'
import { Kafka } from 'kafkajs'
import amqp from 'amqplib'

const HTTP_PORT = Number(process.env.ORDER_SERVICE_PORT || 3000)
const JSON_LIMIT = process.env.ORDER_JSON_LIMIT || '256kb'
const MAX_ITEMS = Number(process.env.ORDER_MAX_ITEMS || 100)
const MAX_TOTAL_AMOUNT = Number(process.env.ORDER_MAX_TOTAL_AMOUNT || 1000000)
const KAFKA_MAX_RETRIES = Number(process.env.KAFKA_MAX_RETRIES || 5)
const RABBIT_MAX_RETRIES = Number(process.env.RABBIT_MAX_RETRIES || 5)
const BASE_RETRY_DELAY_MS = Number(process.env.PUBLISH_RETRY_BASE_DELAY_MS || 100)

const app = express()
app.use(express.json({ limit: JSON_LIMIT }))

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getBackoffDelay(attempt) {
  const jitter = Math.floor(Math.random() * BASE_RETRY_DELAY_MS)
  return BASE_RETRY_DELAY_MS * 2 ** attempt + jitter
}

async function withRetry(label, maxRetries, action) {
  let lastError

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await action()
    } catch (error) {
      lastError = error
      if (attempt === maxRetries) break
      await sleep(getBackoffDelay(attempt))
    }
  }

  throw new Error(`${label} failed after ${maxRetries + 1} attempts: ${lastError?.message}`)
}

function validateOrderPayload(body) {
  if (!body || typeof body !== 'object') return 'body must be a JSON object'
  if (typeof body.customerId !== 'string' || body.customerId.trim() === '') {
    return 'customerId is required and must be a non-empty string'
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return 'items is required and must be a non-empty array'
  }
  if (body.items.length > MAX_ITEMS) {
    return `items cannot exceed ${MAX_ITEMS}`
  }
  if (typeof body.totalAmount !== 'number' || !Number.isFinite(body.totalAmount) || body.totalAmount <= 0) {
    return 'totalAmount must be a positive number'
  }
  if (body.totalAmount > MAX_TOTAL_AMOUNT) {
    return `totalAmount cannot exceed ${MAX_TOTAL_AMOUNT}`
  }
  return null
}

// Kafka producer
const kafka = new Kafka({ brokers: ['localhost:9092'] })
const producer = kafka.producer()
await producer.connect()
console.log('Kafka producer connected')

// RabbitMQ publisher
const conn = await amqp.connect('amqp://admin:admin123@localhost:5672')
const channel = await conn.createConfirmChannel()
await channel.assertExchange('orders.tasks', 'fanout', { durable: true })
console.log('RabbitMQ confirm channel ready')

function publishToRabbit(orderJson) {
  return new Promise((resolve, reject) => {
    channel.publish(
      'orders.tasks',
      '',
      Buffer.from(orderJson),
      { persistent: true, contentType: 'application/json' },
      (error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      }
    )
  })
}

app.post('/order', async (req, res) => {
  const validationError = validateOrderPayload(req.body)
  if (validationError) {
    res.status(400).json({ error: validationError })
    return
  }

  const order = {
    orderId: `ORD-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    customerId: req.body.customerId.trim(),
    items: req.body.items,
    totalAmount: req.body.totalAmount,
    createdAt: new Date().toISOString(),
  }

  const orderJson = JSON.stringify(order)

  try {
    await withRetry('kafka publish', KAFKA_MAX_RETRIES, async () => {
      await producer.send({
        topic: 'orders.created',
        messages: [
          {
            key: order.customerId,
            value: orderJson,
            headers: { source: 'order-service' },
          },
        ],
      })
    })

    await withRetry('rabbitmq publish', RABBIT_MAX_RETRIES, async () => {
      await publishToRabbit(orderJson)
    })

    console.log(`[order-service] Published order ${order.orderId}`)
    res.status(201).json({ orderId: order.orderId, status: 'accepted' })
  } catch (error) {
    console.error(`[order-service] publish failed for ${order.orderId}: ${error.message}`)
    res.status(503).json({ error: 'order pipeline unavailable, please retry' })
  }
})

app.listen(HTTP_PORT, () => console.log(`Order service listening on :${HTTP_PORT}`))
