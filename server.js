require('dotenv').config();
const express = require('express');
const path = require('path');
const Stripe = require('stripe');
const sgMail = require('@sendgrid/mail');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@ulivya.com';

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ulivya-store', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Order schema
const orderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  amount_total: { type: Number, required: true },
  currency: { type: String, required: true },
  customer_email: { type: String, required: true },
  created: { type: Date, required: true },
  shipping: {
    address: { type: Object },
    name: { type: String },
  },
  tracking: {
    carrier: { type: String },
    tracking_number: { type: String },
    status: { type: String },
    estimated_delivery: { type: String },
  },
});

const Order = mongoose.model('Order', orderSchema);

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Invalid items' });
    }

    const line_items = items.map(item => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.name,
          description: item.description || '',
        },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.quantity,
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      success_url: `${req.protocol}://${req.get('host')}/?success=true`,
      cancel_url: `${req.protocol}://${req.get('host')}/?canceled=true`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Stripe create-checkout-session error:', error);
    res.status(500).json({ error: 'Unable to create checkout session' });
  }
});

app.post('/webhook', express.raw({type: 'application/json'}), (req, res) => {
  const sig = req.headers['stripe-signature'];

  if (!webhookSecret) {
    console.error('Missing STRIPE_WEBHOOK_SECRET');
    return res.status(500).send('Webhook secret not configured');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed.', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const tracking = {
      carrier: 'UPS',
      tracking_number: `1Z${Math.random().toString().slice(2, 15)}`,
      status: 'pre_transit',
      estimated_delivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    };

    const orderData = {
      id: session.id,
      amount_total: session.amount_total / 100,
      currency: session.currency,
      customer_email: session.customer_details?.email || 'unknown',
      created: new Date(session.created * 1000),
      shipping: {
        address: session.shipping?.address || 'Not available',
        name: session.shipping?.name || 'Customer',
      },
      tracking,
    };

    const order = new Order(orderData);
    await order.save();
    console.log('Order saved to DB:', order);

    if (order.customer_email && process.env.SENDGRID_API_KEY) {
      const msg = {
        to: order.customer_email,
        from: fromEmail,
        subject: `Order Confirmation - ${order.id}`,
        text: `Thanks for your purchase! Order ID: ${order.id}\n\n` +
              `Total: $${order.amount_total.toFixed(2)} ${order.currency.toUpperCase()}\n` +
              `Shipping Name: ${order.shipping.name}\n` +
              `Shipping Address: ${JSON.stringify(order.shipping.address)}\n\n` +
              `Tracking provider: ${tracking.carrier}\n` +
              `Tracking number: ${tracking.tracking_number}\n` +
              `Estimated delivery: ${tracking.estimated_delivery}\n`,
        html: `<h1>Order Confirmation</h1><p>Order ID: <b>${order.id}</b></p>` +
              `<p>Total: <b>$${order.amount_total.toFixed(2)} ${order.currency.toUpperCase()}</b></p>` +
              `<p>Shipping name: <b>${order.shipping.name}</b></p>` +
              `<p>Estimated delivery: <b>${tracking.estimated_delivery}</b></p>` +
              `<p>Tracking: <b>${tracking.carrier} ${tracking.tracking_number}</b></p>`,
      };

      sgMail.send(msg)
        .then(() => console.log(`Order confirmation email sent to ${order.customer_email}`))
        .catch(error => console.error('SendGrid email error:', error));
    }
  }

  res.json({ received: true });
});

app.get('/admin/orders', async (req, res) => {
  try {
    const orders = await Order.find().sort({ created: -1 });
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Ulivya Admin - Orders</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 p-6">
        <h1 class="text-3xl font-bold mb-6">Order Management</h1>
        <div class="bg-white shadow-md rounded-lg overflow-hidden">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order ID</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tracking</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              ${orders.map(order => `
                <tr>
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${order.id}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${order.customer_email}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">$${order.amount_total.toFixed(2)}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${order.tracking.status}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${order.tracking.carrier} ${order.tracking.tracking_number}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${order.created.toISOString().split('T')[0]}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </body>
      </html>
    `;
    res.send(html);
  } catch (error) {
    console.error('Error fetching orders for admin:', error);
    res.status(500).send('Error loading admin dashboard');
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});