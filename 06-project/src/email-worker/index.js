import amqp from 'amqplib'

const prefetchCount = Number(process.env.EMAIL_PREFETCH || 50)

const conn = await amqp.connect('amqp://admin:admin123@localhost:5672')
const channel = await conn.createChannel()

channel.prefetch(prefetchCount)

channel.consume(
  'tasks.email',
  async (msg) => {
    if (!msg) return

    const order = JSON.parse(msg.content.toString())

    try {
      await new Promise((r) => setTimeout(r, 200))
      console.log(
        `[email-worker] Sent confirmation to customer ${order.customerId} for ${order.orderId}`
      )
      channel.ack(msg)
    } catch (err) {
      console.error(`[email-worker] Failed: ${err.message}`)
      channel.nack(msg, false, false)
    }
  },
  { noAck: false }
)

console.log(`[email-worker] Waiting for tasks (prefetch=${prefetchCount})...`)
