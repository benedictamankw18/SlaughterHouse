const fs = require('node:fs');
const path = require('node:path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const config = require('../config');

const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const COLORS = {
  ink: '#12241B',
  green: '#174B32',
  brightGreen: '#2F8053',
  gold: '#B58A3A',
  champagne: '#E8D7AA',
  paper: '#FAF8F1',
  muted: '#647166',
  line: '#D5C9A8',
  white: '#FFFFFF'
};

function humanize(value) {
  return String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

function getRightsRows(rights) {
  const rows = [];
  const formats = Array.isArray(rights?.formats) ? rights.formats.filter(value => typeof value === 'string' && value.trim()) : [];
  if (formats.length) rows.push(['PERMITTED FILE FORMATS', formats.map(value => value.toUpperCase()).join(', ')]);
  if (typeof rights?.commercialUse === 'boolean') rows.push(['COMMERCIAL USAGE', rights.commercialUse ? 'Permitted under this license.' : 'Not permitted under this license.']);
  if (typeof rights?.distribution === 'boolean') rows.push(['DISTRIBUTION RIGHTS', rights.distribution ? 'Included under this license.' : 'Not included.']);
  if (typeof rights?.stems === 'boolean' || formats.includes('stems')) rows.push(['TRACK STEMS', rights?.stems || formats.includes('stems') ? 'Included.' : 'Not included.']);
  if (rights?.resaleProhibited === true) rows.push(['RESALE', 'Resale of the licensed beat is prohibited.']);
  for (const [name, limit] of Object.entries(rights?.usageLimits || {})) {
    rows.push([`${humanize(name).toUpperCase()} LIMIT`, limit === null ? 'Unlimited under the saved license terms.' : `${limit} permitted.`]);
  }
  for (const rule of rights?.distributionRules || []) {
    rows.push(['DISTRIBUTION CONDITION', String(rule)]);
  }
  if (!rows.length) rows.push(['LICENSE PERMISSIONS', 'No permission details are recorded in the saved license terms.']);
  return rows;
}

function drawLabelValue(doc, label, value, x, y, width, options = {}) {
  doc.font('Helvetica-Bold').fontSize(options.labelSize || 7).fillColor(COLORS.muted).text(label.toUpperCase(), x, y, { width });
  doc.font(options.valueBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(options.valueSize || 10).fillColor(options.color || COLORS.ink)
    .text(String(value || 'Not recorded'), x, y + 11, { width, height: options.height || 31, ellipsis: true });
}

function createLicenseCertificatePdf({ license, certificate, verificationUrl }) {
  return new Promise(async (resolve, reject) => {
    try {
      const qr = await QRCode.toBuffer(verificationUrl, { type: 'png', width: 240, margin: 1, errorCorrectionLevel: 'M' });
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, info: {
        Title: `UltBigBoy Beat License Certificate ${certificate.certificate_id}`,
        Author: 'UltBigBoy Music Production',
        Subject: 'Beat license certificate'
      } });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('error', reject);
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT).fill(COLORS.paper);
      doc.rect(13, 13, PAGE_WIDTH - 26, PAGE_HEIGHT - 26).lineWidth(2).stroke(COLORS.gold);
      doc.rect(20, 20, PAGE_WIDTH - 40, PAGE_HEIGHT - 40).lineWidth(.6).stroke(COLORS.line);
      doc.fillColor(COLORS.green).rect(24, 24, PAGE_WIDTH - 48, 113).fill();
      doc.opacity(.07).font('Helvetica-Bold').fontSize(74).fillColor(COLORS.white).text('ULTBIGBOY', 300, 228, { rotate: -22 });
      doc.opacity(1);

      const logoPath = path.join(__dirname, '..', '..', 'frontend', 'Images', 'Logo 2.png');
      if (fs.existsSync(logoPath)) doc.image(logoPath, 48, 43, { fit: [68, 68] });
      doc.font('Helvetica-Bold').fontSize(17).fillColor(COLORS.white).text('ULTBIGBOY', 130, 48);
      doc.font('Helvetica').fontSize(7).fillColor(COLORS.champagne).text('MUSIC PRODUCTION  |  BEAT LICENSING  |  SOUND DESIGN', 131, 72);
      doc.font('Helvetica-Bold').fontSize(16).fillColor(COLORS.champagne).text('OFFICIAL BEAT LICENCE CERTIFICATE', 464, 46, { width: 326, align: 'right' });
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.white).text('CERTIFICATE OF DIGITAL MUSIC LICENSING', 464, 71, { width: 326, align: 'right' });
      doc.font('Helvetica').fontSize(7).fillColor(COLORS.champagne).text(certificate.certificate_id, 464, 96, { width: 326, align: 'right' });

      const type = humanize(license.license_type).toUpperCase();
      doc.roundedRect(48, 153, 172, 28, 12).fill(COLORS.champagne);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.green).text(`${type} LICENSE`, 58, 162, { width: 152, align: 'center' });
      doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.gold).text('LICENSEE INFORMATION', 48, 198);
      doc.font('Helvetica-Bold').fontSize(16).fillColor(COLORS.ink).text(license.customer_name || 'Customer', 48, 214, { width: 365 });
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted).text(license.customer_email || '', 48, 235, { width: 365 });
      doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted).text(`CUSTOMER ID  ${license.user_id || 'Not recorded'}`, 48, 252);

      doc.moveTo(430, 194).lineTo(430, 286).lineWidth(.7).stroke(COLORS.line);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.gold).text('LICENSED MUSIC DETAILS', 455, 198);
      doc.font('Helvetica-Bold').fontSize(14).fillColor(COLORS.ink).text(license.beat_title || 'Beat title not recorded', 455, 214, { width: 330, height: 35, ellipsis: true });
      drawLabelValue(doc, 'Producer', license.producer_name || 'UltBigBoy Music Production', 455, 250, 150, { valueSize: 8, height: 24 });
      drawLabelValue(doc, 'Beat ID', license.beat_id, 620, 250, 70, { valueSize: 8, height: 24 });
      const meta = [license.genre, license.bpm ? `${license.bpm} BPM` : null, license.musical_key].filter(Boolean).join('  |  ') || 'Genre, BPM, or musical key not recorded';
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted).text(meta, 455, 276, { width: 330, height: 20, ellipsis: true });
      if (license.cover_art) {
        const coverPath = path.join(config.uploadDirectory, path.basename(license.cover_art));
        if (fs.existsSync(coverPath)) doc.image(coverPath, 740, 214, { fit: [48, 48] });
      }

      doc.moveTo(48, 301).lineTo(793, 301).lineWidth(1).stroke(COLORS.gold);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.green).text('LICENSE PERMISSIONS & RESTRICTIONS', 48, 312);
      const rightsRows = getRightsRows(license.rights);
      const visibleRights = rightsRows.slice(0, 8);
      const colWidth = 350;
      const rightX = 455;
      const maxRows = Math.ceil(visibleRights.length / 2);
      const rowHeight = Math.min(37, 132 / Math.max(1, maxRows));
      visibleRights.forEach(([label, value], index) => {
        const column = Math.floor(index / maxRows);
        const row = index % maxRows;
        const x = column ? rightX : 48;
        const y = 333 + row * rowHeight;
        doc.font('Helvetica-Bold').fontSize(6.6).fillColor(COLORS.muted).text(label, x, y, { width: colWidth });
        doc.font('Helvetica').fontSize(8).fillColor(COLORS.ink).text(value, x, y + 10, { width: colWidth, height: rowHeight - 11, ellipsis: true });
      });

      const termsY = Math.max(448, 333 + maxRows * rowHeight + 4);
      doc.moveTo(48, termsY).lineTo(793, termsY).lineWidth(.6).stroke(COLORS.line);
      doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.gold).text('CERTIFICATE TERMS', 48, termsY + 9);
      doc.font('Helvetica').fontSize(7).fillColor(COLORS.ink).text(
        'This certificate confirms that the named customer purchased the specified music license from UltBigBoy. The permitted usage rights, restrictions, and deliverables are determined by the license terms associated with the recorded transaction. This certificate does not independently transfer copyright ownership.',
        48, termsY + 21, { width: 510, height: 28, ellipsis: true }
      );
      doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.muted)
        .text(`TERMS VERSION  ${certificate.terms_version}   |   PURCHASED  ${String(license.purchased_at || 'Not recorded')}   |   ORDER  ${license.order_reference || 'Not recorded'}`, 48, termsY + 52, { width: 520, height: 12, ellipsis: true });
      doc.fillColor(COLORS.brightGreen).fontSize(7).text('Complete license terms: UltBigBoy license terms', 48, termsY + 67, { link: license.terms_url, underline: true });

      doc.image(qr, 714, termsY + 9, { fit: [58, 58] });
      doc.font('Helvetica-Bold').fontSize(6.5).fillColor(COLORS.green).text('VERIFY CERTIFICATE', 675, termsY + 70, { width: 135, align: 'center' });
      doc.font('Helvetica').fontSize(6).fillColor(COLORS.muted).text(`STATUS: ${String(certificate.status || 'valid').toUpperCase()}  |  ISSUED ${String(certificate.issued_at || '').slice(0, 10)}`, 567, termsY + 83, { width: 240, align: 'right' });

      doc.moveTo(48, 565).lineTo(250, 565).lineWidth(.7).stroke(COLORS.gold);
      doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.green).text('AUTHORIZED BY', 48, 570);
      doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.muted).text('ULTBIGBOY MUSIC PRODUCTION  |  DIGITAL COMPANY AUTHORIZATION', 48, 581);

      const additionalRights = rightsRows.slice(visibleRights.length);
      if (additionalRights.length) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 0 });
        doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT).fill(COLORS.paper);
        doc.rect(13, 13, PAGE_WIDTH - 26, PAGE_HEIGHT - 26).lineWidth(2).stroke(COLORS.gold);
        doc.font('Helvetica-Bold').fontSize(15).fillColor(COLORS.green).text('LICENSE TERMS CONTINUED', 48, 42);
        doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted).text(`${certificate.certificate_id}  |  ${license.beat_title}  |  ${type} LICENSE`, 48, 66);
        let y = 100;
        for (const [label, value] of additionalRights) {
          doc.font('Helvetica').fontSize(9);
          const valueHeight = doc.heightOfString(value, { width: 580 });
          if (y + valueHeight + 20 > PAGE_HEIGHT - 40) {
            doc.addPage({ size: 'A4', layout: 'landscape', margin: 0 });
            doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT).fill(COLORS.paper);
            doc.rect(13, 13, PAGE_WIDTH - 26, PAGE_HEIGHT - 26).lineWidth(2).stroke(COLORS.gold);
            y = 48;
          }
          doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.gold).text(label, 48, y, { width: 150 });
          doc.font('Helvetica').fontSize(9).fillColor(COLORS.ink).text(value, 210, y, { width: 580 });
          y += Math.max(28, valueHeight + 16);
        }
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { createLicenseCertificatePdf, getRightsRows };
