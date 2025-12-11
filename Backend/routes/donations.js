const express = require('express');
const router = express.Router();
const Donation = require('../models/Donation');
const auth = require('../middleware/auth'); // your existing middleware
const mongoose = require('mongoose');
const { Parser } = require('json2csv');

// --- Payment provider wiring (guarded / lazy) ---
// Stripe: don't instantiate at module load if no key present.
// Use getStripe() to obtain an initialized instance (or null if not configured).
let _stripe = null;
function getStripe() {
  if (_stripe) return _stripe;
  const secret = process.env.STRIPE_SECRET;
  if (!secret) {
    // Not configured — return null and handle upstream
    return null;
  }
  const Stripe = require('stripe'); // lazy require
  _stripe = Stripe(secret);
  return _stripe;
}

// PayPal: only configure if both client id & secret present
let paypalClient = null;
let checkoutNodeJssdk = null;
if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
  try {
    checkoutNodeJssdk = require('@paypal/checkout-server-sdk');
    const paypalEnv = process.env.PAYPAL_MODE === 'live'
      ? new checkoutNodeJssdk.core.LiveEnvironment(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_CLIENT_SECRET)
      : new checkoutNodeJssdk.core.SandboxEnvironment(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_CLIENT_SECRET);
    paypalClient = new checkoutNodeJssdk.core.PayPalHttpClient(paypalEnv);
  } catch (e) {
    console.warn('PayPal SDK failed to load:', e.message || e);
    paypalClient = null;
  }
} else {
  console.warn('PayPal not configured (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET missing).');
}

// role helper middleware (unchanged)
function requireRole(...roles){
  return (req,res,next) => {
    if(!req.user || !roles.includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
    next();
  };
}

// POST /api/donations  (create a donation intent/record)
router.post('/', auth.optional ? auth.optional : auth, async (req,res,next) => {
  // if you don't have auth.optional, allow missing auth by checking req.user
  try {
    const { donorName, donorEmail, amount, frequency='one-time', method='offline', message='', mobileNumber } = req.body;
    if (!amount || Number(amount) <= 0) return res.status(400).json({ message: 'Invalid amount' });

    const donation = new Donation({
      donorName: donorName || null,
      donorEmail: donorEmail || null,
      user: req.user ? req.user._id : null,
      amount: Number(amount),
      currency: 'USD',
      frequency,
      method,
      message,
      mobileNumber: mobileNumber || null,
      createdByIp: req.ip,
      status: 'initiated'
    });

    await donation.save();

    // Return different flows depending on method
    if (method === 'mobile') {
      // Provide USSD dial string (user will dial on phone)
      // using the pattern *712*{ourNumber}*{amount}#
      // NOTE: store our number in env for configuration
      const ourNumber = process.env.MOBILE_USSD_NUMBER || '252612000000'; // set in env
      const ussd = `*712*${ourNumber}*${Math.round(donation.amount)}#`;
      donation.meta = { ussd };
      donation.status = 'pending'; // pending until confirmation
      await donation.save();
      return res.json({ donation, ussd });
    }

    if (method === 'offline') {
      // offline: store and return bank details (so frontend can display)
      donation.status = 'pending';
      donation.meta = { offline: true };
      await donation.save();
      const bankInfo = {
        bank: process.env.DONATION_BANK_NAME || 'Example Bank Somaliland',
        branch: process.env.DONATION_BANK_BRANCH || 'Hargeisa',
        accountName: process.env.DONATION_BANK_ACCOUNT_NAME || 'Somali Eye Health Alliance',
        accountNumber: process.env.DONATION_BANK_ACCOUNT_NUMBER || '000-123456-789',
        email: process.env.DONATION_FINANCE_EMAIL || 'finance@seha.org'
      };
      return res.json({ donation, bankInfo });
    }

    if (method === 'stripe') {
      const stripe = getStripe();
      if (!stripe) {
        return res.status(500).json({ message: 'Stripe is not configured on the server. Set STRIPE_SECRET in your .env.' });
      }
      const amountCents = Math.round(Number(donation.amount) * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        metadata: { donationId: donation._id.toString() }
      });
      donation.meta = { stripe_payment_intent: paymentIntent.id };
      donation.status = 'pending';
      await donation.save();
      return res.json({ donation, stripeClientSecret: paymentIntent.client_secret });
    }
    

    if (method === 'paypal') {
      if (!paypalClient) {
        return res.status(500).json({ message: 'PayPal not configured on server. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.' });
      }
      // create PayPal order
      const request = new checkoutNodeJssdk.orders.OrdersCreateRequest();
      request.prefer("return=representation");
      request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: 'USD', value: donation.amount.toFixed(2) },
          description: `Donation to SEHA (${donation.frequency})`
        }],
        application_context: {
          brand_name: 'SEHA',
          landing_page: 'NO_PREFERENCE',
          user_action: 'PAY_NOW',
          return_url: `${process.env.APP_BASE_URL || ''}/paypal-success?donationId=${donation._id}`,
          cancel_url: `${process.env.APP_BASE_URL || ''}/paypal-cancel?donationId=${donation._id}`
        }
      });

      const order = await paypalClient.execute(request);
      donation.meta = { paypal_order_id: order.result.id };
      donation.status = 'pending';
      await donation.save();
      return res.json({ donation, paypalOrder: order.result });
    }

    // any other method: keep record as initiated/pending
    await donation.save();
    return res.json({ donation });

  } catch (err) {
    console.error(err);
    next(err);
  }
});

// POST /api/donations/confirm  (mobile confirm or manual receipt submission)
router.post('/confirm', auth.optional ? auth.optional : auth, async (req,res,next) => {
  try {
    const { donationId, phoneNumber, sentAmount, providerTxId } = req.body;
    if (!donationId || !mongoose.Types.ObjectId.isValid(donationId)) return res.status(400).json({ message: 'Invalid donationId' });

    const donation = await Donation.findById(donationId);
    if (!donation) return res.status(404).json({ message: 'Donation not found' });

    donation.mobileNumber = phoneNumber || donation.mobileNumber;
    donation.meta = donation.meta || {};
    donation.meta.confirm = {
      confirmBy: req.user ? req.user._id : null,
      phoneNumber,
      sentAmount,
      providerTxId
    };
    donation.status = 'pending_confirmation';
    await donation.save();

    // We do not auto-approve — admin should review and mark approved/rejected
    return res.json({ donation, message: 'Donation confirmation recorded. Waiting admin approval.' });
  } catch (err) {
    next(err);
  }
});

// GET /api/donations/:id
router.get('/:id', auth.optional ? auth.optional : auth, async (req,res,next) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });
    const donation = await Donation.findById(id).populate('approvedBy','fullName email role').lean();
    if (!donation) return res.status(404).json({ message: 'Donation not found' });
    // confidentiality: allow owner, admin, superadmin, or public if not sensitive
    if (donation.user && req.user && donation.user.toString() === req.user._id.toString()) return res.json({ donation });
    if (req.user && (req.user.role === 'admin' || req.user.role === 'superadmin')) return res.json({ donation });
    // else: allow public basic info but hide admin meta
    const safe = { _id: donation._id, amount: donation.amount, currency: donation.currency, status: donation.status, createdAt: donation.createdAt, method: donation.method };
    return res.json({ donation: safe });
  } catch (err) { next(err); }
});

/* ADMIN endpoints - require admin or superadmin */
// list donations with filtering and pagination
router.get('/admin/list', auth, requireRole('admin','superadmin'), async (req,res,next) => {
  try {
    const { status, method, from, to, q, page=1, limit=50 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (method) filter.method = method;
    if (q) filter.$or = [
      { donorName: new RegExp(q,'i') },
      { donorEmail: new RegExp(q,'i') },
      { transactionId: new RegExp(q,'i') }
    ];
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }
    const skip = (Math.max(1, parseInt(page)) - 1) * Math.max(1, parseInt(limit));
    const docs = await Donation.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean();
    const total = await Donation.countDocuments(filter);
    res.json({ donations: docs, total });
  } catch (err) { next(err); }
});

// approve donation
router.put('/admin/:id/approve', auth, requireRole('admin','superadmin'), async (req,res,next) => {
  try {
    const id = req.params.id;
    const donation = await Donation.findById(id);
    if(!donation) return res.status(404).json({ message: 'Not found' });

    donation.status = 'approved';
    donation.approvedBy = req.user._id;
    donation.approvedAt = new Date();
    await donation.save();

    // TODO: send email to donor - implement your mailer. For now return message.
    return res.json({ donation, message: 'Donation approved (email/receipt should be sent by your mailer).' });
  } catch(err){ next(err); }
});

// reject donation
router.put('/admin/:id/reject', auth, requireRole('admin','superadmin'), async (req,res,next) => {
  try {
    const id = req.params.id;
    const donation = await Donation.findById(id);
    if(!donation) return res.status(404).json({ message: 'Not found' });

    donation.status = 'rejected';
    donation.approvedBy = req.user._id;
    donation.approvedAt = new Date();
    await donation.save();
    return res.json({ donation, message: 'Donation rejected.' });
  } catch(err){ next(err); }
});

// dashboard stats: daily / weekly / monthly / yearly / all
router.get('/admin/stats', auth, requireRole('admin','superadmin'), async (req,res,next) => {
  try {
    const { range='all' } = req.query;
    const match = { status: 'approved' }; // only approved count towards totals
    const now = new Date();
    if (range === 'daily') {
      const start = new Date(now); start.setHours(0,0,0,0); match.createdAt = { $gte: start };
    } else if (range === 'weekly') {
      const day = now.getDay(); // 0-6
      const start = new Date(now); start.setDate(now.getDate() - day); start.setHours(0,0,0,0);
      match.createdAt = { $gte: start };
    } else if (range === 'monthly') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      match.createdAt = { $gte: start };
    } else if (range === 'yearly') {
      const start = new Date(now.getFullYear(), 0, 1);
      match.createdAt = { $gte: start };
    }
    const agg = await Donation.aggregate([
      { $match: match },
      { $group: {
        _id: null,
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }}
    ]);
    const result = agg[0] || { totalAmount: 0, count: 0 };
    res.json({ total: result.totalAmount, count: result.count });
  } catch(err){ next(err); }
});

// CSV export (admin)
router.get('/admin/export', auth, requireRole('admin','superadmin'), async (req,res,next) => {
  try {
    const { from, to, status } = req.query;
    const filter = {};
    if(status) filter.status = status;
    if(from || to) {
      filter.createdAt = {};
      if(from) filter.createdAt.$gte = new Date(from);
      if(to) filter.createdAt.$lte = new Date(to);
    }
    const docs = await Donation.find(filter).sort({ createdAt: -1 }).lean();
    const fields = ['_id','donorName','donorEmail','amount','currency','frequency','method','status','mobileNumber','transactionId','createdAt','approvedAt'];
    const parser = new Parser({ fields });
    const csv = parser.parse(docs);
    res.header('Content-Type', 'text/csv');
    res.attachment(`donations-${Date.now()}.csv`);
    res.send(csv);
  } catch(err){ next(err); }
});
// DELETE /api/donations/admin/:id  (permanent delete) 
router.delete('/admin/:id', auth, requireRole('admin','superadmin'), async (req,res,next) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id' });

    const donation = await Donation.findByIdAndDelete(id).lean();
    if (!donation) return res.status(404).json({ message: 'Donation not found' });

    // Optionally: emit an admin socket event here so connected admin dashboards refresh in realtime
    // e.g. if (io) io.emit('donations.deleted', { id });

    res.json({ message: 'Donation deleted', donation });
  } catch (err) {
    next(err);
  }
});


module.exports = router;
