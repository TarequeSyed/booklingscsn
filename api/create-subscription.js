const Razorpay = require('razorpay');
const admin = require('firebase-admin');

// Initialize Firebase Admin (only once)
if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch (error) {
        console.error('Firebase initialization error:', error);
    }
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
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    
    try {
        console.log('Request body:', req.body);
        
        const { userId, userEmail, userName, planId } = req.body;
        
        if (!userId || !userEmail || !planId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields',
                received: { userId: !!userId, userEmail: !!userEmail, planId: !!planId }
            });
        }
        
        // Verify user exists in Firebase
        try {
            const userDoc = await db.collection('users').doc(userId).get();
            if (!userDoc.exists) {
                return res.status(404).json({ success: false, error: 'User not found in database' });
            }
        } catch (firebaseError) {
            console.error('Firebase error:', firebaseError);
            return res.status(500).json({ 
                success: false, 
                error: 'Database connection failed',
                details: firebaseError.message 
            });
        }
        
        // Create Razorpay subscription
        let subscription;
        try {
            subscription = await razorpay.subscriptions.create({
                plan_id: planId,
                customer_notify: 1,
                quantity: 1,
                total_count: 12,
                start_at: Math.floor(Date.now() / 1000) + 60, // Start in 1 minute
                notes: {
                    userId: userId,
                    userEmail: userEmail,
                    userName: userName || 'Reader'
                }
            });
            
            console.log('Subscription created:', subscription.id);
            
        } catch (razorpayError) {
            console.error('Razorpay error:', razorpayError);
            return res.status(500).json({ 
                success: false, 
                error: 'Razorpay subscription creation failed',
                details: razorpayError.error?.description || razorpayError.message
            });
        }
        
        // Update Firestore with pending subscription
        try {
            await db.collection('users').doc(userId).update({
                'subscription.status': 'pending',
                'subscription.subscriptionId': subscription.id,
                'subscription.planId': planId,
                'subscription.createdAt': admin.firestore.FieldValue.serverTimestamp()
            });
        } catch (updateError) {
            console.error('Firestore update error:', updateError);
            // Continue anyway, subscription was created
        }
        
        return res.status(200).json({
            success: true,
            subscriptionId: subscription.id,
            shortUrl: subscription.short_url || null
        });
        
    } catch (error) {
        console.error('Unexpected error in create-subscription:', error);
        return res.status(500).json({ 
            success: false,
            error: 'Internal server error',
            message: error.message,
            details: error.stack
        });
    }
}
