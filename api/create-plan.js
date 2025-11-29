const Razorpay = require('razorpay');

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // GET - Fetch existing plans
    if (req.method === 'GET') {
        try {
            const plans = await razorpay.plans.all();
            
            return res.status(200).json({
                success: true,
                plans: plans.items,
                count: plans.count,
                message: 'Use one of these plan_id values in your frontend'
            });
            
        } catch (error) {
            console.error('Error fetching plans:', error);
            return res.status(500).json({ 
                error: error.error?.description || error.message,
                details: 'Failed to fetch plans'
            });
        }
    }
    
    // POST - Create new plan
    if (req.method === 'POST') {
        try {
            // Create monthly subscription plan
            const plan = await razorpay.plans.create({
                period: 'monthly',
                interval: 1,
                item: {
                    name: 'Booklings Monthly Subscription',
                    amount: 4999, // ₹49.99 in paise
                    currency: 'INR',
                    description: 'Monthly subscription for Booklings CSN'
                }
            });
            
            return res.status(200).json({
                success: true,
                plan_id: plan.id,
                plan: plan,
                message: `✅ Plan created! Use this plan_id in your dashboard.html: ${plan.id}`
            });
            
        } catch (error) {
            console.error('Plan creation error:', error);
            
            // Check if plan already exists
            if (error.error?.code === 'BAD_REQUEST_ERROR') {
                return res.status(400).json({ 
                    error: 'Plan might already exist',
                    suggestion: 'Try GET request to see existing plans',
                    details: error.error?.description || error.message
                });
            }
            
            return res.status(500).json({ 
                error: error.error?.description || error.message,
                code: error.error?.code,
                details: 'Plan creation failed'
            });
        }
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
}
