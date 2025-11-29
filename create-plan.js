const Razorpay = require('razorpay');

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Create monthly subscription plan
        const plan = await razorpay.plans.create({
            period: 'monthly',
            interval: 1,
            item: {
                name: 'Booklings Monthly Subscription',
                amount: 4999, // ₹49.99 in paise
                currency: 'INR',
                description: 'Monthly subscription for Booklings CSN - Access to all reading sessions, earn coins, redeem rewards'
            }
        });

        return res.status(200).json({
            success: true,
            plan: plan,
            message: 'Plan created successfully. Save this plan_id in your frontend code.'
        });

    } catch (error) {
        console.error('Plan creation error:', error);
        return res.status(500).json({ 
            error: error.message,
            details: error.description || 'Plan creation failed'
        });
    }
};