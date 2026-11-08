document.querySelectorAll('.site-footer-genres').forEach(genreLinks => {
  const allLink = genreLinks.querySelector('a[href="beats.html#beat-listing"]');
  if (allLink && genreLinks.firstElementChild !== allLink) genreLinks.prepend(allLink);
});

document.querySelectorAll('.site-footer-services a[href="booking.html"]').forEach(bookingLink => {
  bookingLink.textContent = 'Book Session';
});

document.querySelectorAll('.site-footer-services h2').forEach(heading => {
  heading.textContent = 'SERVICES';
});

document.querySelectorAll('.site-footer-contact h2').forEach(heading => {
  heading.textContent = 'CONTACT';
});

document.querySelectorAll('.site-footer-bottom > a').forEach(backToTopLink => {
  backToTopLink.href = '#top';
  backToTopLink.textContent = 'Back to top';
});

document.querySelectorAll('.site-footer-bottom').forEach(footerBottom => {
  if (footerBottom.querySelector('.site-footer-policy-links')) return;
  const policyLinks = document.createElement('nav');
  policyLinks.className = 'site-footer-policy-links';
  policyLinks.setAttribute('aria-label', 'Policies and terms');
  policyLinks.innerHTML = [
    ['privacy.html', 'Privacy'],
    ['terms.html', 'Terms'],
    ['refunds.html', 'Refunds'],
    ['cookies.html', 'Cookies'],
    ['license-terms.html', 'Beat license terms']
  ].map(([href, label]) => `<a href="${href}">${label}</a>`).join('');
  const backToTopLink = footerBottom.querySelector('a');
  footerBottom.insertBefore(policyLinks, backToTopLink);
});

document.querySelectorAll('.site-footer-contact').forEach(contact => {
  if (contact.querySelector('.site-footer-location')) return;
  const location = document.createElement('span');
  location.className = 'site-footer-location';
  location.innerHTML = '<svg class="site-footer-contact-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg><span>Ghana</span>';
  contact.append(location);
});
