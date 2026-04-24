import http from 'http'

const host = process.env.ORDER_SERVICE_HOST || 'localhost'
const port = Number(process.env.ORDER_SERVICE_PORT || 3000)
const path = '/order'

const payload = {
  customerId: `customer-${Date.now()}`,
  items: [
    { sku: 'WIDGET-1', qty: 2 },
    { sku: 'GADGET-5', qty: 1 },
  ],
  totalAmount: 149.99,
}

function postJson({ hostname, portNumber, pathname, body }) {
  const requestBody = JSON.stringify(body)

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname,
        port: portNumber,
        path: pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody),
        },
      },
      (res) => {
        let raw = ''
        res.on('data', (chunk) => {
          raw += chunk
        })
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: raw,
          })
        })
      }
    )

    req.on('error', reject)
    req.write(requestBody)
    req.end()
  })
}

function fail(message) {
  console.error(`SMOKE TEST FAILED: ${message}`)
  process.exit(1)
}

try {
  const result = await postJson({
    hostname: host,
    portNumber: port,
    pathname: path,
    body: payload,
  })

  if (result.statusCode !== 201) {
    fail(`expected HTTP 201, got ${result.statusCode}. Body: ${result.body}`)
  }

  let json
  try {
    json = JSON.parse(result.body)
  } catch {
    fail(`response is not valid JSON. Body: ${result.body}`)
  }

  if (!json.orderId || typeof json.orderId !== 'string') {
    fail(`response missing orderId string. Body: ${result.body}`)
  }

  if (json.status !== 'accepted') {
    fail(`expected status "accepted", got "${json.status}".`)
  }

  console.log('SMOKE TEST PASSED')
  console.log(`Order created: ${json.orderId}`)
  process.exit(0)
} catch (error) {
  fail(error.message)
}
