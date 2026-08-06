import Image from "next/image";
import Link from "next/link";

export default function OfflinePage() {
  return <main className="offline-page"><Image src="/tinypersonal-logo.png" width={88} height={88} alt="TinyPersonal" /><p className="eyebrow">Offline</p><h1>ยังเชื่อมต่อไม่ได้</h1><p>ข้อมูล Vault และ API จะไม่ถูก cache เพื่อความปลอดภัย กรุณาเชื่อมต่ออินเทอร์เน็ตแล้วลองอีกครั้ง</p><Link href="/">ลองใหม่</Link></main>;
}
