import http from 'http'
import { performance } from 'perf_hooks'

const host = process.env.ORDER_SERVICE_HOST || 'localhost'
const port = Number(process.env.ORDER_SERVICE_PORT || 3000)
const totalOrders = Number(process.env.LOAD_TEST_ORDERS || 30000)
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY || 100)
const reportEvery = Number(process.env.LOAD_TEST_REPORT_EVERY || 1000)

if (!Number.isFinite(totalOrders) || totalOrders <= 0) {
  console.error('LOAD_TEST_ORDERS must be a positive number')
  process.exit(1)
}

if (!Number.isFinite(concurrency) || concurrency <= 0) {
  console.error('LOAD_TEST_CONCURRENCY must be a positive number')
  process.exit(1)
}

function buildOrder(index) {
  return {
    customerId: `load-customer-${index % 500}`,
    items: [
      { sku: 'WIDGET-1', qty: 2 },
      { sku: 'GADGET-5', qty: 1 },
    ],
    totalAmount: 149.99,
  }
}

function postOrder(order) {
  const body = JSON.stringify(order)

  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: host,
        port,
        path: '/order',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = ''
        res.on('data', (chunk) => {
          raw += chunk
        })
        res.on('end', () => {
          resolve({
            ok: res.statusCode === 201,
            statusCode: res.statusCode ?? 0,
            body: raw,
          })
        })
      }
    )

    req.on('error', (error) => {
      resolve({ ok: false, statusCode: 0, body: error.message })
    })
    req.write(body)
    req.end()
  })
}

const startedAt = performance.now()
let nextIndex = 0
let completed = 0
let success = 0
let failed = 0
const statusBreakdown = new Map()

async function worker() {
  while (true) {
    const current = nextIndex
    nextIndex += 1
    if (current >= totalOrders) return

    const result = await postOrder(buildOrder(current))
    completed += 1
    if (result.ok) success += 1
    else failed += 1

    const key = String(result.statusCode)
    statusBreakdown.set(key, (statusBreakdown.get(key) || 0) + 1)

    if (completed % reportEvery === 0 || completed === totalOrders) {
      const elapsedSec = (performance.now() - startedAt) / 1000
      const throughput = Math.round(completed / Math.max(elapsedSec, 0.001))
      console.log(
        `Progress ${completed}/${totalOrders} | success=${success} failed=${failed} | ~${throughput} req/s`
      )
    }
  }
}

const workers = Array.from({ length: Math.min(concurrency, totalOrders) }, () => worker())
await Promise.all(workers)

const elapsedSec = (performance.now() - startedAt) / 1000
const throughput = Math.round(totalOrders / Math.max(elapsedSec, 0.001))

console.log('--- Load Test Complete ---')
console.log(`Target URL: http://${host}:${port}/order`)
console.log(`Orders attempted: ${totalOrders}`)
console.log(`Concurrency: ${concurrency}`)
console.log(`Success: ${success}`)
console.log(`Failed: ${failed}`)
console.log(`Elapsed: ${elapsedSec.toFixed(2)}s`)
console.log(`Average throughput: ${throughput} req/s`)
console.log('Status breakdown:')
for (const [status, count] of statusBreakdown.entries()) {
  console.log(`  ${status}: ${count}`)
}

if (failed > 0) {
  process.exit(1)
}
