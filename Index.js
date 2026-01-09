const express = require('express');
const admin = require("firebase-admin");
const app = express();
const PORT = process.env.PORT || 3000;

// === 1. الاتصال الآمن ===
let serviceAccount;
try {
    const envKey = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (envKey) {
        serviceAccount = JSON.parse(envKey);
        console.log("✅ Credentials loaded.");
    } else {
        console.error("❌ Credentials MISSING.");
    }
} catch (error) { console.error("❌ Error parsing credentials:", error); }

if (serviceAccount) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://sudan-market-6b122-default-rtdb.firebaseio.com"
    });
}
const db = serviceAccount ? admin.database() : null;

// === 2. السيرفر ===
app.get('/', (req, res) => { res.send('👮‍♂️ SDM Security Bot & Auto-Verifier is ONLINE.'); });
app.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });

// === 3. نبض القلب ===
if (db) {
    setInterval(() => {
        db.ref('system/status').update({ last_online: admin.database.ServerValue.TIMESTAMP })
          .catch(err => console.error('Heartbeat Error:', err));
    }, 60000);
}

// === 4. مراقب الغش + نظام فك القفل ===
if (db) {
    db.ref('users').on('child_added', (userSnap) => {
        const uid = userSnap.key;
        let oldSDM = userSnap.val().sdmBalance || 0;

        db.ref(`users/${uid}/sdmBalance`).on('value', async (snap) => {
            const newSDM = snap.val();
            if (newSDM === null || newSDM <= oldSDM) {
                if (newSDM !== null) oldSDM = newSDM;
                return;
            }

            const diff = newSDM - oldSDM;
            console.log(`Checking User ${uid}: +${diff} SDM`);

            let isLegit = false;

            try {
                // 1. هل هو أدمن؟
                const uData = await db.ref(`users/${uid}`).once('value');
                if (uData.val() && uData.val().role === 'admin') isLegit = true;

                // 2. هل باع MRK أو استلم تحويل؟
                if (!isLegit) {
                    const txns = await db.ref('transactions').orderByChild('uP').equalTo(uid).limitToLast(5).once('value');
                    txns.forEach(t => {
                        const tx = t.val();
                        if ((tx.type === 'sell' || tx.type === 'receive') && Date.now() - tx.date < 20000) {
                            if (Math.abs((tx.out || tx.amount || 0) - diff) < 1) isLegit = true;
                        }
                    });
                }

                // 3. هل تم قبول طلب شراء؟
                if (!isLegit) {
                    const reqs = await db.ref('coin_requests').orderByChild('uP').equalTo(uid).limitToLast(3).once('value');
                    reqs.forEach(r => {
                        const req = r.val();
                        if (req.status === 'approved' && Date.now() - req.date < 20000 && Math.abs(req.qty - diff) < 1) isLegit = true;
                    });
                }

                if (!isLegit) {
                    // 🚨 غشاش -> حظر
                    console.error(`🚨 FRAUD: User ${uid}`);
                    await snap.ref.set(oldSDM);
                    await db.ref(`users/${uid}`).update({ 
                        bannedUntil: Date.now() + 3153600000000, 
                        role: 'banned_cheater',
                        verified: false // إبقاء القفل
                    });
                } else {
                    // ✅ سليم -> فك القفل وتحديث المرجع
                    oldSDM = newSDM;
                    console.log(`✅ Legit. Unlocking ${uid}...`);
                    await db.ref(`users/${uid}`).update({ verified: true });
                }
            } catch (err) { console.error(err); }
        });
    });
}
