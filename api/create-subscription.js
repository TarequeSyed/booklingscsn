import Razorpay from "razorpay";
import * as admin from "firebase-admin";

// --------------------------------------------------
//  FIREBASE INITIALIZATION (SAFE ON VERCEL)
// --------------------------------------------------
if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

        admin.initializeApp({
            credential: admin.credential.cert({
                project_id: serviceAccount.project_id,
                client_email: serviceAccount.client_email,
                private_key: serviceAccount.private_key.replace(/\\n/g, "\n"),
            }),
        });

        console.log("Firebase initialized");
    } catch (err) {
        console.error("Firebase init failed:", err.message);
    }
}

const db = admin.firestore();

// --------------------------------------------------
//  RAZORPAY INITIALIZATION
// --------------------------------------------------
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// --------------------------------------------------
//  API ROUTE HANDLER
// --------------------------------------------------
export default async function handler(req, res) {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Method not allowed" });
    }

    try {
        const { userId, userEmail, userName, planId } = req.body;

        // --------------------------------------------------
        //  VALIDATION
        // --------------------------------------------------
        if (!userId || !userEmail || !planId) {
            return res.status(400).json({
                success: false,
                error: "Missing required fields",
                received: { userId, userEmail, planId },
            });
        }

        // Confirm user exists in Firestore
        const userDoc = await db.collection("users").doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                error: "User not found in database",
            });
        }

        // --------------------------------------------------
        //  CREATE SUBSCRIPTION
        // --------------------------------------------------
        let subscription;
        try {
            subscription = await razorpay.subscriptions.create({
                plan_id: planId,           // <-- USES YOUR EXISTING PLAN
                customer_notify: 1,
                quantity: 1,
                total_count: 12,
                start_at: Math.floor(Date.now() / 1000) + 60,
                notes: {
                    userId,
                    userEmail,
                    userName: userName || "Reader",
                },
            });

            console.log("Subscription created:", subscription.id);
        } catch (err) {
            console.error("Razorpay error:", err);
            return res.status(500).json({
                success: false,
                error: "Razorpay subscription creation failed",
                details: err.error?.description || err.message,
            });
        }

        // --------------------------------------------------
        //  UPDATE FIRESTORE
        // --------------------------------------------------
        try {
            await db.collection("users").doc(userId).update({
                subscription: {
                    status: "pending",
                    subscriptionId: subscription.id,
                    planId: planId,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                },
            });
        } catch (err) {
            console.error("Firestore update error:", err.message);
        }

        // --------------------------------------------------
        //  SUCCESS RESPONSE
        // --------------------------------------------------
        return res.status(200).json({
            success: true,
            subscriptionId: subscription.id,
            shortUrl: subscription.short_url || null,
        });

    } catch (err) {
        console.error("Unexpected create-subscription error:", err);
        return res.status(500).json({
            success: false,
            error: "Internal server error",
            details: err.message,
        });
    }
}
