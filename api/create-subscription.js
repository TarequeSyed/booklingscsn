const Razorpay = require('razorpay');
const admin = require('firebase-admin');

// Initialize Firebase Admin (only once)
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const { userId, userEmail, userName, planId } = req.body;
        
        if (!userId || !userEmail) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Verify user exists in Firebase
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Create Razorpay subscription
        const subscription = await razorpay.subscriptions.create({
            plan_id: planId,
            customer_notify: 1,
            quantity: 1,
            total_count: 12, // 12 months - adjustable
            start_at: Math.floor(Date.now() / 1000),
            notes: {
                userId: userId,
                userEmail: userEmail,
                userName: userName
            }
        });
        
        // Update Firestore with pending subscription
        await db.collection('users').doc(userId).update({
            'subscription.status': 'pending',
            'subscription.subscriptionId': subscription.id,
            'subscription.planId': planId,
            'subscription.createdAt': admin.firestore.FieldValue.serverTimestamp()
        });
        
        return res.status(200).json({
            success: true,
            subscriptionId: subscription.id,
            shortUrl: subscription.short_url
        });
        
    } catch (error) {
        console.error('Subscription creation error:', error);
        return res.status(500).json({ 
            error: error.message,
            details: error.description || 'Internal server error'
        });
    }
}
