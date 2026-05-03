const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_BASE_URL, PORT } = process.env;

// ──────────────────────────────────────────────────────────────────────────────
// Helper: obtener Access Token de PayPal
// ──────────────────────────────────────────────────────────────────────────────
async function getAccessToken() {
  const credentials = Buffer.from(
    `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await res.json();
  if (!data.access_token) {
    console.error('PayPal auth error:', data);
    throw new Error('No se pudo obtener el token de PayPal');
  }
  return data.access_token;
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /create-order
// Body: { amount: "4.99", currency: "EUR" }
// Respuesta: { orderID, approvalUrl }
// ──────────────────────────────────────────────────────────────────────────────
app.post('/create-order', async (req, res) => {
  try {
    const { amount = '4.99', currency = 'EUR' } = req.body;
    const token = await getAccessToken();

    const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: { currency_code: currency, value: amount },
            description: 'LearnIQ — Test Premium de Inteligencias Múltiples',
          },
        ],
        application_context: {
          return_url: 'https://learniq.app/success',
          cancel_url: 'https://learniq.app/cancel',
          brand_name: 'LearnIQ',
          landing_page: 'BILLING',
          user_action: 'PAY_NOW',
        },
      }),
    });

    const order = await response.json();
    console.log('Order created:', order.id);

    const approveLink = order.links?.find((l) => l.rel === 'approve');
    if (!approveLink) throw new Error('No approval URL recibido de PayPal');

    res.json({ orderID: order.id, approvalUrl: approveLink.href });
  } catch (err) {
    console.error('/create-order error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /capture-order
// Body: { orderID: "..." }
// Respuesta: { success: true, capture }
// ──────────────────────────────────────────────────────────────────────────────
app.post('/capture-order', async (req, res) => {
  try {
    const { orderID } = req.body;
    if (!orderID) throw new Error('orderID requerido');

    const token = await getAccessToken();

    const response = await fetch(
      `${PAYPAL_BASE_URL}/v2/checkout/orders/${orderID}/capture`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const capture = await response.json();
    console.log('Capture status:', capture.status);

    if (capture.status === 'COMPLETED') {
      // ✅ Aquí puedes guardar en BD, activar cuenta premium, enviar email, etc.
      res.json({ success: true, capture });
    } else {
      res.status(400).json({ success: false, status: capture.status, capture });
    }
  } catch (err) {
    console.error('/capture-order error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Health check
// ──────────────────────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', env: PAYPAL_BASE_URL }));

app.listen(PORT || 4000, () => {
  console.log(`✅ LearnIQ Backend corriendo en http://localhost:${PORT || 4000}`);
  console.log(`   PayPal URL: ${PAYPAL_BASE_URL}`);
});
