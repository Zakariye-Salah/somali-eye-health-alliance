// routes/webhooks.js
const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const Donation = require('../models/Donation');

router.post('/stripe', express.raw({ type: 'application/json' }), (req,res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET; // set from Stripe dashboard
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed.', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    // find donation by stripePaymentIntentId
    Donation.findOne({ 'meta.stripePaymentIntentId': pi.id }).then(d => {
      if(d) { d.status = 'approved'; d.meta.stripe = pi; return d.save(); }
    }).catch(console.error);
  }

  res.json({ received: true });
});
module.exports = router;
