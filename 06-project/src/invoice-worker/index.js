import amqp from 'amqplib'

const prefetchCount = Number(process.env.INVOICE_PREFETCH || 30)

const conn = await amqp.connect('amqp://admin:admin123@localhost:5672')
const channel = await conn.createChannel()

channel.prefetch(prefetchCount)

channel.consume(
  'tasks.invoice',
  async (msg) => {
    if (!msg) return

    const order = JSON.parse(msg.content.toString())

    try {
      await new Promise((r) => setTimeout(r, 500))
      console.log(`[invoice-worker] Generated invoice for ${order.orderId} ($${order.totalAmount})`)
      channel.ack(msg)
    } catch (err) {
      console.error(`[invoice-worker] Failed: ${err.message}`)
      channel.nack(msg, false, false)
    }
  },
  { noAck: false }
)

console.log(`[invoice-worker] Waiting for tasks (prefetch=${prefetchCount})...`)
