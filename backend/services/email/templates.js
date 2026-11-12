const DEFAULT_CURRENCY = 'GHS';
const BRAND = 'UltBigBoy';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoney(amount, currency = DEFAULT_CURRENCY) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return '';
  const code = String(currency || DEFAULT_CURRENCY).toUpperCase();
  const decimals = code === 'NGN' ? 0 : 2;
  return `${code} ${numeric.toFixed(decimals)}`;
}

function validateEmailUrl(value) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new Error('Email action links must be valid absolute URLs.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Email action links must use HTTP or HTTPS.');
  }
  return url.toString();
}

function layout({ preheader = '', heading, bodyHtml, cta = null }) {
  const ctaUrl = cta?.url ? validateEmailUrl(cta.url) : null;
  const ctaHtml = ctaUrl
    ? `<p style="margin:28px 0 8px"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#111827;color:#ffffff;text-decoration:none;font-weight:600">${escapeHtml(cta.label || 'Open')}</a></p>
       <p style="margin:8px 0 0;font-size:12px;color:#6b7280;word-break:break-all">${escapeHtml(ctaUrl)}</p>`
    : '';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827">
    <span style="display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden">${escapeHtml(preheader)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;padding:32px">
            <tr><td>
              <p style="margin:0 0 8px;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#6b7280">${BRAND}</p>
              <h1 style="margin:0 0 20px;font-size:24px;line-height:1.3">${escapeHtml(heading)}</h1>
              <div style="font-size:15px;line-height:1.6;color:#374151">${bodyHtml}</div>
              ${ctaHtml}
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0 16px">
              <p style="margin:0;font-size:12px;color:#9ca3af">This message was sent by ${BRAND}. If you did not expect it, you can ignore it.</p>
            </td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderEmailVerification(data = {}) {
  const name = data.name || 'there';
  const url = data.verifyUrl;
  if (!url) throw new Error('Email verification template requires verifyUrl.');
  const heading = 'Verify your email address';
  const body = `<p>Hi ${escapeHtml(name)},</p>
    <p>Confirm your email address to finish setting up your ${BRAND} account. This link expires in ${escapeHtml(data.expiresInHours || 24)} hours.</p>`;
  return {
    subject: `Verify your ${BRAND} email address`,
    html: layout({ preheader: 'Confirm your email address to finish signing up.', heading, bodyHtml: body, cta: { label: 'Verify email', url } }),
    text: `Hi ${name},\n\nConfirm your email address to finish setting up your ${BRAND} account. This link expires in ${data.expiresInHours || 24} hours.\n\n${url}\n\nIf you did not expect this message, you can ignore it.`
  };
}

function renderWelcome(data = {}) {
  const heading = `Welcome to ${BRAND}`;
  const body = `<p>Hi ${escapeHtml(data.name || 'there')},</p>
    <p>Thanks for creating a ${BRAND} account. Your account is ready to use${data.emailVerified ? '' : ' once you verify your email address'}.</p>
    <p>From your account, you can manage purchases, licenses, downloads, bookings, and requests.</p>`;
  return {
    subject: `Welcome to ${BRAND}`,
    html: layout({
      preheader: 'Your UltBigBoy account is ready.',
      heading,
      bodyHtml: body,
      cta: data.accountUrl ? { label: 'Visit your account', url: data.accountUrl } : null
    }),
    text: `Hi ${data.name || 'there'},\n\nThanks for creating a ${BRAND} account. Your account is ready to use${data.emailVerified ? '' : ' once you verify your email address'}.\n\nFrom your account, you can manage purchases, licenses, downloads, bookings, and requests.${data.accountUrl ? `\n\n${data.accountUrl}` : ''}`
  };
}

function renderPasswordReset(data = {}) {
  const name = data.name || 'there';
  const url = data.resetUrl;
  if (!url) throw new Error('Password reset template requires resetUrl.');
  const heading = 'Reset your password';
  const body = `<p>Hi ${escapeHtml(name)},</p>
    <p>We received a request to reset your ${BRAND} password. This link expires in ${escapeHtml(data.expiresInMinutes || 60)} minutes and can only be used once.</p>
    <p>If you did not request a reset, no action is needed.</p>`;
  return {
    subject: `Reset your ${BRAND} password`,
    html: layout({ preheader: 'Reset your password using the secure link.', heading, bodyHtml: body, cta: { label: 'Reset password', url } }),
    text: `Hi ${name},\n\nWe received a request to reset your ${BRAND} password. This link expires in ${data.expiresInMinutes || 60} minutes and can only be used once.\n\n${url}\n\nIf you did not request a reset, no action is needed.`
  };
}

function renderOrderReceipt(data = {}) {
  const items = Array.isArray(data.items) ? data.items : [];
  const rows = items.map(item => `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6">${escapeHtml(item.name)}${item.license ? ` <span style="color:#6b7280">(${escapeHtml(item.license)})</span>` : ''}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;text-align:right;white-space:nowrap">${escapeHtml(formatMoney(item.amount, data.currency))}</td>
    </tr>`).join('');
  const heading = 'Your payment is confirmed';
  const body = `<p>Hi ${escapeHtml(data.name || 'there')},</p>
    <p>Thanks for your purchase. Order <strong>${escapeHtml(data.reference)}</strong> has been paid successfully.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0">
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-weight:600">Item</td>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-weight:600;text-align:right">Amount</td>
      </tr>
      ${rows}
      <tr>
        <td style="padding:12px 0 0;font-weight:700">Total</td>
        <td style="padding:12px 0 0;font-weight:700;text-align:right">${escapeHtml(formatMoney(data.total, data.currency))}</td>
      </tr>
    </table>`;
  const lines = items.map(item => `- ${item.name}${item.license ? ` (${item.license})` : ''}: ${formatMoney(item.amount, data.currency)}`).join('\n');
  return {
    subject: `Your ${BRAND} receipt - ${data.reference}`,
    html: layout({ preheader: `Receipt for order ${data.reference}.`, heading, bodyHtml: body, cta: data.orderUrl ? { label: 'View your order', url: data.orderUrl } : null }),
    text: `Hi ${data.name || 'there'},\n\nThanks for your purchase. Order ${data.reference} has been paid successfully.\n\n${lines}\nTotal: ${formatMoney(data.total, data.currency)}\n${data.orderUrl ? `\n${data.orderUrl}\n` : ''}\n`
  };
}

function renderBookingConfirmation(data = {}) {
  const slots = Array.isArray(data.slots) && data.slots.length
    ? data.slots
    : (data.date ? [{ date: data.date, time: data.time }] : []);
  const slotLines = slots.map(slot => `${slot.date}${slot.time ? ` at ${slot.time}` : ''}`).join(', ');
  const heading = 'Your booking is confirmed';
  const body = `<p>Hi ${escapeHtml(data.name || 'there')},</p>
    <p>Your <strong>${escapeHtml(data.service || 'studio')}</strong> booking is paid and awaiting final studio confirmation.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:14px">
      <tr><td style="padding:6px 0;color:#6b7280">Reference</td><td style="padding:6px 0;text-align:right">${escapeHtml(data.reference)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Session</td><td style="padding:6px 0;text-align:right">${escapeHtml(slotLines || 'See your account')}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Fee paid</td><td style="padding:6px 0;text-align:right">${escapeHtml(formatMoney(data.amount ?? data.feeGhs, data.currency))}</td></tr>
    </table>`;
  return {
    subject: `Booking confirmed - ${data.reference}`,
    html: layout({ preheader: `Your ${data.service || 'studio'} booking is confirmed.`, heading, bodyHtml: body, cta: data.bookingUrl ? { label: 'View your bookings', url: data.bookingUrl } : null }),
    text: `Hi ${data.name || 'there'},\n\nYour ${data.service || 'studio'} booking is paid and awaiting final studio confirmation.\n\nReference: ${data.reference}\nSession: ${slotLines || 'See your account'}\nFee paid: ${formatMoney(data.amount ?? data.feeGhs, data.currency)}\n${data.bookingUrl ? `\n${data.bookingUrl}\n` : ''}`
  };
}

function renderLicenseIssued(data = {}) {
  const licenses = Array.isArray(data.licenses) ? data.licenses : [];
  const rows = licenses.map(license => `<li>${escapeHtml(license.name)}${license.license ? ` - ${escapeHtml(license.license)} license` : ''}</li>`).join('');
  const lines = licenses.map(license => `- ${license.name}${license.license ? ` - ${license.license} license` : ''}`).join('\n');
  const heading = 'Your beat license is ready';
  const body = `<p>Hi ${escapeHtml(data.name || 'there')},</p>
    <p>Your purchase is complete and these license${licenses.length === 1 ? '' : 's'} ${licenses.length === 1 ? 'is' : 'are'} now available in your account:</p>
    ${rows ? `<ul>${rows}</ul>` : '<p>Your new license is available in your account.</p>'}
    <p>Open your account to review license terms and access eligible downloads.</p>`;
  return {
    subject: `Your ${BRAND} beat license${licenses.length === 1 ? ' is' : 's are'} ready`,
    html: layout({
      preheader: 'Your purchased beat license is ready in your account.',
      heading,
      bodyHtml: body,
      cta: data.accountUrl ? { label: 'View your licenses', url: data.accountUrl } : null
    }),
    text: `Hi ${data.name || 'there'},\n\nYour purchase is complete and these licenses are now available in your account:\n${lines || '- Your new license'}\n\nOpen your account to review license terms and access eligible downloads.${data.accountUrl ? `\n\n${data.accountUrl}` : ''}`
  };
}

function renderRefundProcessed(data = {}) {
  const full = Boolean(data.full);
  const heading = full ? 'Your order was refunded' : 'A partial refund was processed';
  const amountText = formatMoney(data.amount, data.currency);
  const body = `<p>Hi ${escapeHtml(data.name || 'there')},</p>
    <p>Order <strong>${escapeHtml(data.reference)}</strong> has received a ${full ? 'full' : 'partial'} refund of <strong>${escapeHtml(amountText)}</strong>.</p>
    <p>${full
      ? 'Because the refund covers the full order, any downloads and bookings tied to it are no longer active.'
      : 'Your remaining licences and downloads stay active.'}</p>`;
  return {
    subject: `${full ? 'Refund processed' : 'Partial refund processed'} - ${data.reference}`,
    html: layout({ preheader: `${full ? 'Full' : 'Partial'} refund for order ${data.reference}.`, heading, bodyHtml: body, cta: data.orderUrl ? { label: 'View your order', url: data.orderUrl } : null }),
    text: `Hi ${data.name || 'there'},\n\nOrder ${data.reference} has received a ${full ? 'full' : 'partial'} refund of ${amountText}.\n${full ? 'Because the refund covers the full order, any downloads and bookings tied to it are no longer active.' : 'Your remaining licences and downloads stay active.'}\n${data.orderUrl ? `\n${data.orderUrl}\n` : ''}`
  };
}

function renderBookingCancelled(data = {}) {
  const heading = 'Your booking was cancelled';
  const slots = Array.isArray(data.slots) ? data.slots : [];
  const slotLines = slots.map(slot => `${slot.date}${slot.time ? ` at ${slot.time}` : ''}`).join(', ');
  const body = `<p>Hi ${escapeHtml(data.name || 'there')},</p>
    <p>Your ${escapeHtml(data.service || 'studio')} booking${data.reference ? ` (<strong>${escapeHtml(data.reference)}</strong>)` : ''} was cancelled.</p>
    ${slotLines ? `<p>Session: ${escapeHtml(slotLines)}</p>` : ''}
    ${data.reason ? `<p>Reason: ${escapeHtml(data.reason)}</p>` : ''}
    <p>If you have questions, please contact the studio.</p>`;
  return {
    subject: `Booking cancelled${data.reference ? ` - ${data.reference}` : ''}`,
    html: layout({ preheader: 'Your studio booking was cancelled.', heading, bodyHtml: body }),
    text: `Hi ${data.name || 'there'},\n\nYour ${data.service || 'studio'} booking${data.reference ? ` (${data.reference})` : ''} was cancelled.${slotLines ? `\nSession: ${slotLines}` : ''}${data.reason ? `\nReason: ${data.reason}` : ''}\n\nIf you have questions, please contact the studio.`
  };
}

function renderBookingConfirmed(data = {}) {
  const slots = Array.isArray(data.slots) ? data.slots : [];
  const slotLines = slots.map(slot => `${slot.date}${slot.time ? ` at ${slot.time}` : ''}`).join(', ');
  const heading = 'Your booking is confirmed';
  const body = `<p>Hi ${escapeHtml(data.name || 'there')},</p>
    <p>Your ${escapeHtml(data.service || 'studio')} booking${data.reference ? ` (<strong>${escapeHtml(data.reference)}</strong>)` : ''} is now <strong>confirmed</strong>.</p>
    ${slotLines ? `<p>Session: ${escapeHtml(slotLines)}</p>` : ''}
    <p>Your session is reserved. Please arrive on time.</p>`;
  return {
    subject: `Booking confirmed${data.reference ? ` - ${data.reference}` : ''}`,
    html: layout({ preheader: 'Your studio booking is confirmed.', heading, bodyHtml: body, cta: data.bookingUrl ? { label: 'View your bookings', url: data.bookingUrl } : null }),
    text: `Hi ${data.name || 'there'},\n\nYour ${data.service || 'studio'} booking${data.reference ? ` (${data.reference})` : ''} is now confirmed.${slotLines ? `\nSession: ${slotLines}` : ''}\nYour session is reserved. Please arrive on time.${data.bookingUrl ? `\n\n${data.bookingUrl}` : ''}`
  };
}

function renderBookingCompleted(data = {}) {
  const slots = Array.isArray(data.slots) ? data.slots : [];
  const slotLines = slots.map(slot => `${slot.date}${slot.time ? ` at ${slot.time}` : ''}`).join(', ');
  const heading = 'Your booking is completed';
  const body = `<p>Hi ${escapeHtml(data.name || 'there')},</p>
    <p>Your ${escapeHtml(data.service || 'studio')} booking${data.reference ? ` (<strong>${escapeHtml(data.reference)}</strong>)` : ''} is now <strong>completed</strong>.</p>
    ${slotLines ? `<p>Session: ${escapeHtml(slotLines)}</p>` : ''}
    <p>Thank you for visiting the studio.</p>`;
  return {
    subject: `Booking completed${data.reference ? ` - ${data.reference}` : ''}`,
    html: layout({ preheader: 'Your studio booking is completed.', heading, bodyHtml: body, cta: data.bookingUrl ? { label: 'View your bookings', url: data.bookingUrl } : null }),
    text: `Hi ${data.name || 'there'},\n\nYour ${data.service || 'studio'} booking${data.reference ? ` (${data.reference})` : ''} is now completed.${slotLines ? `\nSession: ${slotLines}` : ''}\nThank you for visiting the studio.${data.bookingUrl ? `\n\n${data.bookingUrl}` : ''}`
  };
}

function renderBookingPaid(data = {}) {
  const slots = Array.isArray(data.slots) ? data.slots : [];
  const slotLines = slots.map(slot => `${slot.date}${slot.time ? ` at ${slot.time}` : ''}`).join(', ');
  const heading = 'Your booking payment is confirmed';
  const body = `<p>Hi ${escapeHtml(data.name || 'there')},</p>
    <p>Your ${escapeHtml(data.service || 'studio')} booking${data.reference ? ` (<strong>${escapeHtml(data.reference)}</strong>)` : ''} payment is confirmed.</p>
    ${slotLines ? `<p>Session: ${escapeHtml(slotLines)}</p>` : ''}
    <p>Your session is reserved and ready.</p>`;
  return {
    subject: `Booking payment confirmed${data.reference ? ` - ${data.reference}` : ''}`,
    html: layout({ preheader: 'Your studio booking payment is confirmed.', heading, bodyHtml: body, cta: data.bookingUrl ? { label: 'View your bookings', url: data.bookingUrl } : null }),
    text: `Hi ${data.name || 'there'},\n\nYour ${data.service || 'studio'} booking${data.reference ? ` (${data.reference})` : ''} payment is confirmed.${slotLines ? `\nSession: ${slotLines}` : ''}\nYour session is reserved and ready.${data.bookingUrl ? `\n\n${data.bookingUrl}` : ''}`
  };
}

function renderBookingRescheduled(data = {}) {
  const slots = Array.isArray(data.slots) ? data.slots : [];
  const slotLines = slots.map(slot => `${slot.date}${slot.time ? ` at ${slot.time}` : ''}`).join(', ');
  const heading = 'Your booking has been rescheduled';
  const body = `<p>Hi ${escapeHtml(data.name || 'there')},</p>
    <p>Your ${escapeHtml(data.service || 'studio')} booking${data.reference ? ` (<strong>${escapeHtml(data.reference)}</strong>)` : ''} has been <strong>rescheduled</strong>.</p>
    ${slotLines ? `<p>New session: ${escapeHtml(slotLines)}</p>` : ''}
    ${data.reason ? `<p>Reason: ${escapeHtml(data.reason)}</p>` : ''}
    <p>Your new session is reserved.</p>`;
  return {
    subject: `Booking rescheduled${data.reference ? ` - ${data.reference}` : ''}`,
    html: layout({ preheader: 'Your studio booking has been rescheduled.', heading, bodyHtml: body, cta: data.bookingUrl ? { label: 'View your bookings', url: data.bookingUrl } : null }),
    text: `Hi ${data.name || 'there'},\n\nYour ${data.service || 'studio'} booking${data.reference ? ` (${data.reference})` : ''} has been rescheduled.${slotLines ? `\nNew session: ${slotLines}` : ''}${data.reason ? `\nReason: ${data.reason}` : ''}\nYour new session is reserved.${data.bookingUrl ? `\n\n${data.bookingUrl}` : ''}`
  };
}

function renderRequestReviewing(data = {}) {
  const isBeat = data.requestType === 'beat';
  const heading = isBeat ? 'Your beat request is under review' : 'Your custom order request is under review';
  const body = `<p>Hi ${escapeHtml(data.name || 'there')},</p>
    <p>Your ${isBeat ? 'beat request' : 'custom order request'} for ${escapeHtml(data.productName || 'your item')} is now being reviewed by our team.</p>
    ${data.reference ? `<p>Reference: <strong>${escapeHtml(data.reference)}</strong></p>` : ''}
    <p>We will reply to this email address with next steps.</p>`;
  return {
    subject: `${isBeat ? 'Beat request' : 'Custom order request'} under review${data.reference ? ` - ${data.reference}` : ''}`,
    html: layout({ preheader: `Your ${isBeat ? 'beat request' : 'custom order request'} is under review.`, heading, bodyHtml: body, cta: data.accountUrl ? { label: 'View your requests', url: data.accountUrl } : null }),
    text: `Hi ${data.name || 'there'},\n\nYour ${isBeat ? 'beat request' : 'custom order request'} for ${data.productName || 'your item'} is now being reviewed by our team.${data.reference ? `\nReference: ${data.reference}` : ''}\nWe will reply to this email address with next steps.${data.accountUrl ? `\n\n${data.accountUrl}` : ''}`
  };
}

function renderRequestQuoted(data = {}) {
  const isBeat = data.requestType === 'beat';
  const heading = isBeat ? 'Your beat request has a quote' : 'Your custom order request has a quote';
  const amountText = data.licensePrice !== undefined ? formatMoney(data.licensePrice, data.currency) : '';
  const body = `<p>Hi ${escapeHtml(data.name || 'there')},</p>
    <p>Our team has reviewed your ${isBeat ? 'beat request' : 'custom order request'} for ${escapeHtml(data.productName || 'your item')} and has a quote for you.</p>
    ${amountText ? `<p>Quote: <strong>${escapeHtml(amountText)}</strong></p>` : ''}
    ${data.reference ? `<p>Reference: <strong>${escapeHtml(data.reference)}</strong></p>` : ''}
    <p>Accept the quote to proceed with payment.</p>`;
  return {
    subject: `${isBeat ? 'Beat request' : 'Custom order request'} quote${data.reference ? ` - ${data.reference}` : ''}`,
    html: layout({ preheader: `Your ${isBeat ? 'beat request' : 'custom order request'} has a quote.`, heading, bodyHtml: body, cta: data.accountUrl ? { label: 'View your requests', url: data.accountUrl } : null }),
    text: `Hi ${data.name || 'there'},\n\nOur team has reviewed your ${isBeat ? 'beat request' : 'custom order request'} for ${data.productName || 'your item'} and has a quote for you.${amountText ? `\nQuote: ${amountText}` : ''}${data.reference ? `\nReference: ${data.reference}` : ''}\nAccept the quote to proceed with payment.${data.accountUrl ? `\n\n${data.accountUrl}` : ''}`
  };
}

function renderRequestAccepted(data = {}) {
  const isBeat = data.requestType === 'beat';
  const heading = isBeat ? 'Your beat request is accepted' : 'Your custom order request is accepted';
  const body = `<p>Hi ${escapeHtml(data.name || 'there')},</p>
    <p>Great news — your ${isBeat ? 'beat request' : 'custom order request'} for ${escapeHtml(data.productName || 'your item')} is now <strong>accepted</strong>.</p>
    ${data.reference ? `<p>Reference: <strong>${escapeHtml(data.reference)}</strong></p>` : ''}
    <p>You can proceed to payment to secure your purchase.</p>`;
  return {
    subject: `${isBeat ? 'Beat request' : 'Custom order request'} accepted${data.reference ? ` - ${data.reference}` : ''}`,
    html: layout({ preheader: `Your ${isBeat ? 'beat request' : 'custom order request'} is accepted.`, heading, bodyHtml: body, cta: data.accountUrl ? { label: 'View your requests', url: data.accountUrl } : null }),
    text: `Hi ${data.name || 'there'},\n\nGreat news — your ${isBeat ? 'beat request' : 'custom order request'} for ${data.productName || 'your item'} is now accepted.${data.reference ? `\nReference: ${data.reference}` : ''}\nYou can proceed to payment to secure your purchase.${data.accountUrl ? `\n\n${data.accountUrl}` : ''}`
  };
}

function renderRequestRejected(data = {}) {
  const isBeat = data.requestType === 'beat';
  const heading = isBeat ? 'Your beat request was not accepted' : 'Your custom order request was not accepted';
  const body = `<p>Hi ${escapeHtml(data.name || 'there')},</p>
    <p>After review, we are unable to accept your ${isBeat ? 'beat request' : 'custom order request'} for ${escapeHtml(data.productName || 'your item')} at this time.</p>
    ${data.reason ? `<p>Reason: ${escapeHtml(data.reason)}</p>` : ''}
    ${data.reference ? `<p>Reference: <strong>${escapeHtml(data.reference)}</strong></p>` : ''}
    <p>Feel free to submit a new request if you have a different idea.</p>`;
  return {
    subject: `${isBeat ? 'Beat request' : 'Custom order request'} not accepted${data.reference ? ` - ${data.reference}` : ''}`,
    html: layout({ preheader: `Your ${isBeat ? 'beat request' : 'custom order request'} was not accepted.`, heading, bodyHtml: body }),
    text: `Hi ${data.name || 'there'},\n\nAfter review, we are unable to accept your ${isBeat ? 'beat request' : 'custom order request'} for ${data.productName || 'your item'} at this time.${data.reason ? `\nReason: ${data.reason}` : ''}${data.reference ? `\nReference: ${data.reference}` : ''}\nFeel free to submit a new request if you have a different idea.`
  };
}

function renderRequestCompleted(data = {}) {
  const isBeat = data.requestType === 'beat';
  const heading = isBeat ? 'Your beat request is completed' : 'Your custom order request is completed';
  const body = `<p>Hi ${escapeHtml(data.name || 'there')},</p>
    <p>Your ${isBeat ? 'beat request' : 'custom order request'} for ${escapeHtml(data.productName || 'your item')} is now <strong>completed</strong>.</p>
    ${data.reference ? `<p>Reference: <strong>${escapeHtml(data.reference)}</strong></p>` : ''}
    <p>Thank you for working with us.</p>`;
  return {
    subject: `${isBeat ? 'Beat request' : 'Custom order request'} completed${data.reference ? ` - ${data.reference}` : ''}`,
    html: layout({ preheader: `Your ${isBeat ? 'beat request' : 'custom order request'} is completed.`, heading, bodyHtml: body, cta: data.accountUrl ? { label: 'View your requests', url: data.accountUrl } : null }),
    text: `Hi ${data.name || 'there'},\n\nYour ${isBeat ? 'beat request' : 'custom order request'} for ${data.productName || 'your item'} is now completed.${data.reference ? `\nReference: ${data.reference}` : ''}\nThank you for working with us.${data.accountUrl ? `\n\n${data.accountUrl}` : ''}`
  };
}

function renderRequestReceived(data = {}) {
  const isBeat = data.requestType === 'beat';
  const heading = isBeat ? 'Your beat request is in' : 'Your custom order request is in';
  const reference = data.reference ? String(data.reference) : '';
  const details = data.details ? String(data.details) : '';
  const rows = [];
  if (data.productName) rows.push(['Request', data.productName]);
  if (data.license) rows.push(['License', data.license]);
  if (Number.isFinite(Number(data.licensePrice)) && Number(data.licensePrice) > 0) {
    rows.push(['License price', formatMoney(data.licensePrice, data.currency)]);
  }
  if (reference) rows.push(['Reference', reference]);
  const table = rows.length
    ? `<table style="width:100%;border-collapse:collapse;margin:16px 0">${rows.map(([label, value]) =>
      `<tr><td style="padding:6px 0;color:#6b7280">${escapeHtml(label)}</td><td style="padding:6px 0;text-align:right">${escapeHtml(value)}</td></tr>`
    ).join('')}</table>`
    : '';
  const body = `<p>Hi ${escapeHtml(data.name || 'there')},</p>
    <p>Thanks for sending your ${isBeat ? 'beat request' : 'custom order request'}. Our team will review it and reply to this email address.</p>
    ${table}
    ${details ? `<p style="color:#6b7280;margin:16px 0 4px">What you sent</p><p style="white-space:pre-wrap">${escapeHtml(details)}</p>` : ''}
    <p>No payment is needed until we confirm the details with you.</p>`;
  const textLines = [
    `Hi ${data.name || 'there'},`,
    '',
    `Thanks for sending your ${isBeat ? 'beat request' : 'custom order request'}. Our team will review it and reply to this email address.`
  ];
  for (const [label, value] of rows) textLines.push(`${label}: ${value}`);
  if (details) textLines.push('', 'What you sent:', details);
  textLines.push('', 'No payment is needed until we confirm the details with you.');
  if (data.accountUrl) textLines.push('', data.accountUrl);
  return {
    subject: `${isBeat ? 'Beat request' : 'Custom order request'} received${reference ? ` - ${reference}` : ''}`,
    html: layout({
      preheader: `We received your ${isBeat ? 'beat request' : 'custom order request'}.`,
      heading,
      bodyHtml: body,
      cta: data.accountUrl ? { label: 'View your requests', url: data.accountUrl } : null
    }),
    text: textLines.join('\n')
  };
}

function renderBookingRequestReceived(data = {}) {
  const heading = 'We received your booking request';
  const slots = Array.isArray(data.slots) ? data.slots : [];
  const slotLines = slots.map(slot => `${slot.date}${slot.time ? ` at ${slot.time}` : ''}`).join(', ');
  const holdMinutes = Number(data.holdMinutes);
  const body = `<p>Hi ${escapeHtml(data.name || 'there')},</p>
    <p>Your ${escapeHtml(data.service || 'studio')} booking request has been received. Complete payment to secure your session.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:6px 0;color:#6b7280">Reference</td><td style="padding:6px 0;text-align:right">${escapeHtml(data.reference)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Session</td><td style="padding:6px 0;text-align:right">${escapeHtml(slotLines || 'See your account')}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Fee</td><td style="padding:6px 0;text-align:right">${escapeHtml(formatMoney(data.amount ?? data.feeGhs, data.currency))}</td></tr>
    </table>
    <p>${Number.isFinite(holdMinutes) && holdMinutes > 0
      ? `Your selected time is held for ${escapeHtml(holdMinutes)} minutes while payment is completed.`
      : 'Your selected time is held while payment is completed.'}</p>
    <p>If you do not finish payment, the hold is released automatically and the time can be booked by someone else.</p>`;
  return {
    subject: `Booking request received - ${data.reference}`,
    html: layout({
      preheader: `We received your ${data.service || 'studio'} booking request.`,
      heading,
      bodyHtml: body,
      cta: data.accountUrl ? { label: 'View your bookings', url: data.accountUrl } : null
    }),
    text: `Hi ${data.name || 'there'},\n\nYour ${data.service || 'studio'} booking request has been received. Complete payment to secure your session.\n\nReference: ${data.reference}\nSession: ${slotLines || 'See your account'}\nFee: ${formatMoney(data.amount ?? data.feeGhs, data.currency)}\n${Number.isFinite(holdMinutes) && holdMinutes > 0 ? `Your selected time is held for ${holdMinutes} minutes while payment is completed.\n` : ''}\nIf you do not finish payment, the hold is released automatically and the time can be booked by someone else.${data.accountUrl ? `\n\n${data.accountUrl}` : ''}`
  };
}

function renderAdminAlert(data = {}) {
  const heading = data.title || 'Administrator alert';
  const body = `<p>${escapeHtml(data.message || '')}</p>
    ${data.reference ? `<p style="color:#6b7280">Reference: ${escapeHtml(data.reference)}</p>` : ''}`;
  return {
    subject: `[${BRAND} admin] ${heading}`,
    html: layout({ preheader: data.message || heading, heading, bodyHtml: body, cta: data.actionUrl ? { label: 'Open dashboard', url: data.actionUrl } : null }),
    text: `${heading}\n\n${data.message || ''}${data.reference ? `\nReference: ${data.reference}` : ''}${data.actionUrl ? `\n\n${data.actionUrl}` : ''}`
  };
}

const TEMPLATES = {
  email_verification: renderEmailVerification,
  welcome: renderWelcome,
  password_reset: renderPasswordReset,
  order_receipt: renderOrderReceipt,
  booking_confirmation: renderBookingConfirmation,
  booking_request_received: renderBookingRequestReceived,
  request_received: renderRequestReceived,
  license_issued: renderLicenseIssued,
  booking_cancelled: renderBookingCancelled,
  booking_confirmed: renderBookingConfirmed,
  booking_completed: renderBookingCompleted,
  booking_paid: renderBookingPaid,
  booking_rescheduled: renderBookingRescheduled,
  request_reviewing: renderRequestReviewing,
  request_quoted: renderRequestQuoted,
  request_accepted: renderRequestAccepted,
  request_rejected: renderRequestRejected,
  request_completed: renderRequestCompleted,
  refund_processed: renderRefundProcessed,
  admin_alert: renderAdminAlert
};

function renderTemplate(template, data = {}) {
  const render = TEMPLATES[template];
  if (!render) throw new Error(`Unknown email template: ${template}`);
  const rendered = render(data);
  rendered.subject = rendered.subject.replace(/[\r\n]+/g, ' ').trim();
  return rendered;
}

module.exports = {
  TEMPLATES: Object.keys(TEMPLATES),
  escapeHtml,
  formatMoney,
  renderTemplate,
  validateEmailUrl
};
