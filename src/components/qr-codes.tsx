"use client";

import { QRCodeSVG } from "qrcode.react";

export function QRCode({ value, size = 120 }: { value: string; size?: number }) {
  return (
    <QRCodeSVG
      value={value}
      size={size}
      bgColor="#0F172A"
      fgColor="#FFFFFF"
      level="M"
    />
  );
}
