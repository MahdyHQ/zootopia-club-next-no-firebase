import "server-only";

import QRCode, { type QRCodeToDataURLOptions } from "qrcode";

import { ASSESSMENT_FILE_QR_TARGET } from "@/lib/assessment-file-branding";

const ASSESSMENT_FILE_QR_OPTIONS: QRCodeToDataURLOptions = {
  errorCorrectionLevel: "H",
  margin: 1,
  width: 160,
  color: {
    dark: "#0f766eff",
    light: "#ffffffff",
  },
};

export async function buildAssessmentFileQrDataUrl() {
  // The assessment file QR is shared by detached preview pages and the print/PDF lane.
  // Keep one server-generated source of truth here so future branding updates stay consistent
  // and no renderer has to reach out to a third-party QR service at runtime.
  return QRCode.toDataURL(ASSESSMENT_FILE_QR_TARGET, ASSESSMENT_FILE_QR_OPTIONS);
}
