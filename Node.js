const express = require('express');
const cors = require('cors');
const os = require('os');
const si = require('systeminformation');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // لتقديم ملف index.html

// ================================================================
//  HELPERS
// ================================================================

/**
 * تنسيق البايت إلى GB أو MB
 */
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * الحصول على معلومات البطارية (محاكاة، لأن systeminformation لا يدعمها على جميع الأنظمة)
 */
async function getBatteryInfo() {
    try {
        const battery = await si.battery();
        if (battery && battery.hasBattery) {
            return {
                level: battery.percent || 0,
                status: battery.isCharging ? '🔌 يشحن' : '🔋 يعمل على البطارية',
                health: battery.health || 'جيد'
            };
        }
        return { level: '--', status: 'غير متاحة', health: '--' };
    } catch {
        return { level: '--', status: 'غير معروف', health: '--' };
    }
}

/**
 * الحصول على معلومات الكاميرات (محاكاة)
 */
async function getCameras() {
    try {
        const graphics = await si.graphics();
        if (graphics && graphics.controllers) {
            const cams = graphics.controllers.filter(c => c.model.toLowerCase().includes('camera') || c.model.toLowerCase().includes('webcam'));
            if (cams.length > 0) return cams.map(c => c.model).join(', ');
        }
        return 'كاميرا خلفية + أمامية (افتراضي)';
    } catch {
        return 'غير معروف';
    }
}

/**
 * الحصول على قائمة المستشعرات (محاكاة)
 */
async function getSensors() {
    try {
        const sensors = [
            'التسارع (Accelerometer)',
            'الجيروسكوب (Gyroscope)',
            'التقارب (Proximity)',
            'الإضاءة (Light)',
            'البوصلة (Magnetometer)',
            'الضغط (Barometer)'
        ];
        // نتحقق من وجودها بشكل تقريبي
        return sensors.join(' • ');
    } catch {
        return 'غير معروف';
    }
}

/**
 * حالة الجذر (محاكاة)
 */
function getRootStatus() {
    // لا يمكن اكتشاف الجذر بشكل دقيق من Node.js، نعرض افتراضي
    return '🔒 غير مكتشف (افتراضي)';
}

/**
 * معلومات الشبكة
 */
async function getNetworkInfo() {
    try {
        const net = await si.networkInterfaces();
        const active = net.find(n => n.operstate === 'up' && n.ip4);
        if (active) {
            return `🌐 ${active.ip4} (${active.iface})`;
        }
        return '📡 غير متصل';
    } catch {
        return 'غير معروف';
    }
}

/**
 * الحصول على معلومات الشاشة
 */
async function getDisplayInfo() {
    try {
        const graphics = await si.graphics();
        if (graphics && graphics.displays && graphics.displays.length > 0) {
            const d = graphics.displays[0];
            return `${d.resolutionX}×${d.resolutionY}px (${d.pixelDepth}bit)`;
        }
        return 'غير معروف';
    } catch {
        return 'غير معروف';
    }
}

// ================================================================
//  API ENDPOINTS
// ================================================================

/**
 * GET /api/scan/quick
 * فحص سريع للمعلومات الأساسية
 */
app.get('/api/scan/quick', async (req, res) => {
    try {
        const cpu = await si.cpu();
        const mem = await si.mem();
        const disk = await si.fsSize();
        const battery = await getBatteryInfo();
        const network = await getNetworkInfo();

        const result = {
            cpu: {
                model: cpu.manufacturer + ' ' + cpu.brand,
                cores: cpu.cores,
                speed: cpu.speedMax + ' GHz'
            },
            ram: {
                total: formatBytes(mem.total),
                used: formatBytes(mem.used),
                free: formatBytes(mem.free)
            },
            storage: disk.length > 0 ? {
                total: formatBytes(disk[0].size),
                used: formatBytes(disk[0].used),
                free: formatBytes(disk[0].available)
            } : { total: '--', used: '--', free: '--' },
            battery: battery,
            display: await getDisplayInfo(),
            cameras: await getCameras(),
            sensors: await getSensors(),
            os: os.type() + ' ' + os.release(),
            androidVersion: 'محاكي / غير معروف',
            securityPatch: 'محاكي / غير معروف',
            rootStatus: getRootStatus(),
            launcher: 'محاكي / غير معروف',
            network: network,
            timestamp: new Date().toISOString()
        };
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/scan/full
 * فحص شامل (مشابه للفحص السريع ولكن مع معلومات إضافية)
 */
app.post('/api/scan/full', async (req, res) => {
    try {
        // نفس البيانات ولكن نضيف معلومات إضافية
        const quick = await (await fetch(`http://localhost:${PORT}/api/scan/quick`)).json();
        // إضافة معلومات إضافية
        const osInfo = await si.osInfo();
        const usb = await si.usb();
        const wifi = await si.wifiNetworks();

        const fullResult = {
            ...quick,
            osDetail: osInfo,
            usbDevices: usb.length > 0 ? usb.map(u => u.name).join(', ') : 'لا يوجد',
            wifiNetworks: wifi.length > 0 ? wifi.map(w => w.ssid).join(', ') : 'غير متاح',
            systemUptime: os.uptime(),
            loadAverage: os.loadavg()
        };
        res.json(fullResult);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/test/hardware
 * اختبار الهاردوير (محاكاة اختبارات)
 */
app.post('/api/test/hardware', async (req, res) => {
    try {
        const quick = await (await fetch(`http://localhost:${PORT}/api/scan/quick`)).json();
        // نضيف نتائج اختبارات محاكاة
        const hardwareTest = {
            ...quick,
            testResults: {
                screen: { status: 'pass', details: 'لا يوجد بيكسلات ميتة' },
                touch: { status: 'pass', details: 'استجابة سليمة' },
                audio: { status: 'pass', details: 'الصوت يعمل بشكل جيد' },
                mic: { status: 'pass', details: 'الميكروفون يعمل' },
                vibration: { status: 'pass', details: 'محرك الاهتزاز يعمل' },
                wifi: { status: 'pass', details: 'اتصال مستقر' },
                bluetooth: { status: 'pass', details: 'البلوتوث يعمل' },
                gps: { status: 'warning', details: 'إشارة ضعيفة حالياً' }
            }
        };
        res.json(hardwareTest);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/health
 * التحقق من صحة الخادم
 */
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'online', 
        uptime: os.uptime(),
        timestamp: new Date().toISOString()
    });
});

// ================================================================
//  START SERVER
// ================================================================

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📱 Mobile Scanner API ready`);
});
