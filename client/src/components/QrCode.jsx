import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

export default function QrCode({ text, size = 200 }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    QRCode.toDataURL(text, { width: size * 2, margin: 1 }).then(setSrc);
  }, [text, size]);

  return src && <img className="qr-code" src={src} alt="QR code" width={size} height={size} />;
}
