const Razorpay = require('razorpay');
const crypto = require('crypto');
const admin = require('firebase-admin');

if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { paymentId, subscriptionId, signature, userId } = req.body;

        if (!paymentId || !subscriptionId || !signature || !userId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Verify payment signature
        const generatedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${paymentId}|${subscriptionId}`)
            .digest('hex');

        if (generatedSignature !== signature) {
            console.error('Invalid payment signature');
            return res.status(400).json({ error: 'Invalid signature' });
        }

        // Fetch subscription details from Razorpay
        const subscription = await razorpay.subscriptions.fetch(subscriptionId);
        
        if (subscription.status !== 'active') {
            return res.status(400).json({ 
                error: 'Subscription not active',
                status: subscription.status 
            });
        }

        const nextBillingDate = new Date(subscription.current_end * 1000);

        // Update Firestore
        await db.collection('users').doc(userId).update({
            'subscription.status': 'active',
            'subscription.currentPeriodEnd': admin.firestore.Timestamp.fromDate(nextBillingDate),
            'subscription.lastPaymentId': paymentId,
            'subscription.lastPaymentDate': admin.firestore.FieldValue.serverTimestamp(),
            'subscription.verifiedAt': admin.firestore.FieldValue.serverTimestamp()
        });

        // Log initial payment
        await db.collection('users').doc(userId).collection('payments').add({
            amount: 49.99,
            currency: 'INR',
            paymentId: paymentId,
            subscriptionId: subscriptionId,
            status: 'success',
            type: 'initial',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            nextBillingDate: admin.firestore.Timestamp.fromDate(nextBillingDate)
        });

        console.log(`Payment verified for user ${userId}`);

        return res.status(200).json({ 
            success: true,
            nextBillingDate: nextBillingDate.toISOString(),
            subscriptionStatus: subscription.status
        });

    } catch (error) {
        console.error('Payment verification error:', error);
        return res.status(500).json({ 
            error: error.message,
            details: error.description || 'Payment verification failed'
        });
    }
};