'use client';

// استيراد المكتبة ديناميكياً لضمان أنها تعمل فقط على العميل
import dynamic from 'next/dynamic';

// منع التحميل على الخادم (SSR)
const QRCode = dynamic(() => import('qrcode.react'), { ssr: false });

export default function QRCodeComponent({ value }: { value: string }) {
  return <QRCode value={value} size={200} />;
}
