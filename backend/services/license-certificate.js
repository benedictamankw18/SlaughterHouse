function pdfText(value) {
  return String(value ?? '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[\\()]/g, character => `\\${character}`)
    .slice(0, 180);
}

function createLicenseCertificatePdf({ licenseId, customerName, customerEmail, beatTitle, licenseType, orderReference, purchasedAt, rights }) {
  const lines = [
    'ULTBIGBOY LICENSE CERTIFICATE',
    `Certificate ID: ${licenseId}`,
    `Customer: ${customerName}`,
    `Email: ${customerEmail}`,
    `Beat: ${beatTitle}`,
    `License: ${licenseType}`,
    `Order: ${orderReference}`,
    `Purchased: ${purchasedAt}`,
    `Rights: ${JSON.stringify(rights)}`
  ];
  const stream = [
    'BT',
    '/F1 12 Tf',
    '50 760 Td',
    ...lines.flatMap((line, index) => [`(${pdfText(line)}) Tj`, index < lines.length - 1 ? '0 -24 Td' : '']),
    'ET'
  ].filter(Boolean).join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(pdf, 'ascii');
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}

module.exports = { createLicenseCertificatePdf };
