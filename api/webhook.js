const crypto = require('crypto');
const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

// Verify Razorpay webhook signature
function verifyWebhookSignature(body, signature, secret) {
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(body))
        .digest('hex');
    return expectedSignature === signature;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const signature = req.headers['x-razorpay-signature'];
    
    // Verify signature
    if (!verifyWebhookSignature(req.body, signature, process.env.RAZORPAY_WEBHOOK_SECRET)) {
        console.error('Invalid webhook signature');
        return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = req.body.event;
    const payload = req.body.payload;

    console.log('Webhook received:', event);

    try {
        const userId = payload.subscription?.entity?.notes?.userId || 
                      payload.payment?.entity?.notes?.userId;

        if (!userId) {
            console.error('No userId found in webhook payload');
            return res.status(400).json({ error: 'User ID not found' });
        }

        switch (event) {
            case 'subscription.activated':
                // First payment successful - subscription activated
                const activatedEnd = new Date(payload.subscription.entity.current_end * 1000);
                
                await db.collection('users').doc(userId).update({
                    'subscription.status': 'active',
                    'subscription.currentPeriodEnd': admin.firestore.Timestamp.fromDate(activatedEnd),
                    'subscription.lastPaymentDate': admin.firestore.FieldValue.serverTimestamp(),
                    'subscription.activatedAt': admin.firestore.FieldValue.serverTimestamp()
                });

                // Log payment
                await db.collection('users').doc(userId).collection('payments').add({
                    amount: 49.99,
                    currency: 'INR',
                    paymentId: payload.payment.entity.id,
                    subscriptionId: payload.subscription.entity.id,
                    status: 'success',
                    type: 'activation',
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    nextBillingDate: admin.firestore.Timestamp.fromDate(activatedEnd)
                });

                console.log(`Subscription activated for user ${userId}`);
                break;

            case 'subscription.charged':
                // Recurring payment successful
                const chargedEnd = new Date(payload.subscription.entity.current_end * 1000);
                
                await db.collection('users').doc(userId).update({
                    'subscription.status': 'active',
                    'subscription.currentPeriodEnd': admin.firestore.Timestamp.fromDate(chargedEnd),
                    'subscription.lastPaymentDate': admin.firestore.FieldValue.serverTimestamp()
                });

                // Log payment
                await db.collection('users').doc(userId).collection('payments').add({
                    amount: 49.99,
                    currency: 'INR',
                    paymentId: payload.payment.entity.id,
                    subscriptionId: payload.subscription.entity.id,
                    status: 'success',
                    type: 'renewal',
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    nextBillingDate: admin.firestore.Timestamp.fromDate(chargedEnd)
                });

                console.log(`Subscription renewed for user ${userId}`);
                break;

            case 'payment.failed':
                // Payment failed - lock account immediately
                await db.collection('users').doc(userId).update({
                    'subscription.status': 'expired',
                    'subscription.lastFailedPayment': admin.firestore.FieldValue.serverTimestamp()
                });

                // Log failed payment
                await db.collection('users').doc(userId).collection('payments').add({
                    amount: 49.99,
                    currency: 'INR',
                    paymentId: payload.payment.entity.id,
                    status: 'failed',
                    type: 'failed_renewal',
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    reason: payload.payment.entity.error_description || 'Payment failed'
                });

                console.log(`Payment failed for user ${userId}`);
                break;

            case 'subscription.cancelled':
                // User cancelled subscription
                await db.collection('users').doc(userId).update({
                    'subscription.status': 'cancelled',
                    'subscription.cancelledAt': admin.firestore.FieldValue.serverTimestamp()
                });

                console.log(`Subscription cancelled for user ${userId}`);
                break;

            case 'subscription.completed':
                // Subscription ended (after 12 months or total_count reached)
                await db.collection('users').doc(userId).update({
                    'subscription.status': 'completed',
                    'subscription.completedAt': admin.firestore.FieldValue.serverTimestamp()
                });

                console.log(`Subscription completed for user ${userId}`);
                break;

            case 'subscription.paused':
                // Subscription paused
                await db.collection('users').doc(userId).update({
                    'subscription.status': 'paused',
                    'subscription.pausedAt': admin.firestore.FieldValue.serverTimestamp()
                });

                console.log(`Subscription paused for user ${userId}`);
                break;

            case 'subscription.resumed':
                // Subscription resumed
                await db.collection('users').doc(userId).update({
                    'subscription.status': 'active',
                    'subscription.resumedAt': admin.firestore.FieldValue.serverTimestamp()
                });

                console.log(`Subscription resumed for user ${userId}`);
                break;

            default:
                console.log(`Unhandled webhook event: ${event}`);
        }

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('Webhook processing error:', error);
        return res.status(500).json({ 
            error: error.message,
            event: event
        });
    }
}
