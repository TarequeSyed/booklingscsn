const Razorpay = require('razorpay');
const admin = require('firebase-admin');

// Initialize Firebase Admin
let db;
try {
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
        });
    }
    db = admin.firestore();
} catch (error) {
    console.error('Firebase init error:', error);
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    
    try {
        const { userId, userEmail, userName, planId } = req.body;
        
        if (!userId || !userEmail || !planId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields'
            });
        }
        
        const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
        });
        
        const subscription = await razorpay.subscriptions.create({
            plan_id: planId,
            customer_notify: 1,
            quantity: 1,
            total_count: 12,
            notes: {
                userId,
                userEmail,
                userName: userName || 'Reader'
            }
        });
        
        if (db) {
            await db.collection('users').doc(userId).update({
                'subscription.status': 'pending',
                'subscription.subscriptionId': subscription.id,
                'subscription.planId': planId,
                'subscription.createdAt': admin.firestore.FieldValue.serverTimestamp()
            });
        }
        
        return res.status(200).json({
            success: true,
            subscriptionId: subscription.id
        });
        
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ 
            success: false,
            error: error.message
        });
    }
};
