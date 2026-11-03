# MASTER DEVELOPMENT PROMPT: SLAUGHTERHOUSE / ULTBIGBOY — COMPLETE PLATFORM REDESIGN & UPGRADE

## 1. YOUR ROLE

Act as a senior full-stack software architect, UI/UX designer, motion designer, cybersecurity engineer, database engineer, and e-commerce platform developer.

Your assignment is to transform my existing **SlaughterHouse (UltBigBoy)** project into a premium, visually impressive, secure, responsive, animation-rich music production and beat marketplace.

Do not treat this as a simple website redesign. Treat it as a complete professional music-business platform.

You must inspect the existing source code, understand the architecture, identify existing functionality, fix weaknesses, and improve the project without unnecessarily destroying or replacing working features.

## 2. PROJECT INFORMATION

**Project name:** SlaughterHouse  
**Brand:** UltBigBoy  
**Existing repository:** https://github.com/benedictamankw18/SlaughterHouse  
**Reference website:** https://mirakilouzbeatz.com/

The reference website is an inspiration for the business structure, music marketplace, licensing experience, artist portfolio, studio bookings, and general presentation.

IMPORTANT:
- Do not copy the reference website.
- Create an original visual identity for UltBigBoy.
- Improve on its user experience where possible.
- Preserve the existing brand and project identity.
- Use the existing technology stack unless there is a compelling technical reason to change it.

## 3. FIRST TASK: AUDIT THE EXISTING PROJECT

Before writing or changing code:

1. Inspect the entire repository and its directory structure.
2. Read all existing frontend and backend files.
3. Understand the database schema and relationships.
4. Identify all existing API endpoints.
5. Inspect authentication and authorization.
6. Review Paystack payment integration.
7. Review beat uploads, downloads, licensing, and order processing.
8. Inspect the admin dashboard.
9. Identify hardcoded URLs, credentials, preview modes, mock data, and unfinished features.
10. Identify security vulnerabilities, performance issues, and broken functionality.

Produce a concise technical audit and implementation plan.

Do not assume an existing feature works simply because its interface exists.

Do not delete existing functionality without a clear reason.

## 4. VISUAL DESIGN AND BRAND IDENTITY

Create a premium, modern, immersive music-production experience.

The design should feel like a combination of:
- A premium music production studio.
- A modern beat marketplace.
- An independent record label.
- A professional music-commerce platform.

### Design direction

Use:
- A sophisticated dark visual theme.
- Deep black, charcoal, and dark grey backgrounds.
- Carefully selected accent colours.
- High-quality typography.
- Large editorial headings.
- Beautiful album artwork and beat covers.
- Modern glassmorphism where appropriate.
- Subtle gradients and atmospheric lighting.
- Clean spacing and visual hierarchy.
- Professional cards and interactive elements.

Avoid:
- Generic templates.
- Excessive gradients.
- Overcrowded sections.
- Unnecessary visual effects.
- Tiny text.
- Excessive rounded cards.
- Cheap-looking animations.
- Designs that resemble an ordinary admin dashboard.

The website should feel premium, natural, modern, catchy, and professionally art-directed.

## 5. ADVANCED ANIMATIONS AND 3D INTERACTIONS

Motion and animation are important requirements.

Create a visually engaging experience with purposeful animations throughout the platform.

Implement where appropriate:

### Page animations
- Smooth page transitions.
- Animated section entrances.
- Scroll-triggered reveals.
- Parallax scrolling.
- Smooth navigation transitions.
- Animated background elements.
- Staggered content appearances.

### 3D effects
- Interactive 3D album artwork.
- 3D hover effects on beat cards.
- Perspective-based card transformations.
- Subtle depth and lighting effects.
- Interactive 3D hero elements.
- Smooth rotating or floating visual elements.
- Mouse-responsive perspective effects on desktop.

### Interactive effects
- Animated buttons.
- Smooth hover transitions.
- Magnetic button effects where appropriate.
- Animated navigation indicators.
- Audio waveform visualizations.
- Dynamic loading animations.
- Skeleton loading states.
- Animated modal transitions.
- Smooth cart interactions.

Use appropriate libraries such as:
- GSAP for advanced animation.
- Framer Motion / Motion for interface transitions.
- Three.js or React Three Fiber if the existing stack supports them and genuine 3D is justified.
- CSS transforms and perspective for lightweight 3D effects.

Do not add heavy libraries without considering performance.

IMPORTANT:
Animations must not interfere with usability, accessibility, page loading, or mobile performance.

Respect `prefers-reduced-motion`. Provide simplified effects on low-powered devices and mobile screens.

## 6. RESPONSIVE DESIGN

The entire platform must be fully responsive.

Test and optimize for:

- Small mobile phones.
- Large mobile phones.
- Tablets.
- Laptops.
- Desktop monitors.
- Large desktop displays.

Requirements:

1. Mobile-first layout.
2. Responsive navigation.
3. Mobile-friendly beat cards.
4. Touch-friendly controls.
5. Responsive album artwork.
6. Responsive audio player.
7. Responsive checkout.
8. Responsive booking forms.
9. Responsive admin dashboard.
10. No horizontal overflow.
11. Proper typography scaling.
12. Appropriate spacing on every screen size.

Do not simply shrink the desktop layout for mobile.

Design a proper mobile experience.

## 7. WEBSITE STRUCTURE AND FEATURES

Upgrade the existing website into the following sections.

### A. Homepage

Create an impressive landing page with:

- Premium hero section.
- Strong brand identity.
- Animated headline.
- Call-to-action buttons.
- Featured beats.
- Latest releases.
- Popular beats.
- Featured artists.
- Music production services.
- Studio booking promotion.
- Merchandise showcase.
- Customer testimonials.
- Newsletter subscription.
- Professional footer.

The hero section should immediately communicate what UltBigBoy offers.

### B. Beat Marketplace

Build a professional beat marketplace with:

- Beat search.
- Genre filters.
- Mood filters.
- BPM filters.
- Musical key filters.
- Price filters.
- Featured beats.
- Latest beats.
- Popular beats.
- Sorting options.
- Pagination or efficient infinite scrolling.

Every beat should display:

- Cover artwork.
- Beat title.
- Producer.
- Genre.
- BPM.
- Musical key.
- Duration.
- Price or starting licence price.
- Audio preview.
- Purchase button.

### C. Advanced Audio Player

Implement a professional audio player.

Features:
- Play and pause.
- Seek through tracks.
- Volume control.
- Track duration.
- Progress bar.
- Waveform visualization.
- Next and previous controls where applicable.
- Persistent playback while navigating.
- Mobile-friendly controls.

Only play authorized preview files.

Never expose original downloadable master files through public preview URLs.

### D. Beat Licensing System

Implement professional licensing packages:

1. Basic Licence.
2. Premium Licence.
3. Unlimited Licence.
4. Exclusive Licence.

Each licence must clearly define:

- Price.
- Permitted commercial usage.
- Streaming limits, if applicable.
- Distribution limits.
- Music video rights.
- Radio rights.
- Content ID restrictions.
- Whether the licence is non-exclusive or exclusive.
- Available file formats.
- Download permissions.

Allow the administrator to configure licensing prices and terms.

Generate a licence record for each successful purchase.

Generate a downloadable licence document containing the customer, beat, order, licence type, date, and terms accepted.

Exclusive licences must be handled carefully to prevent further sales of the same exclusive beat once the transaction is confirmed.

### E. Artist Portfolio and Music Placements

Create an impressive artist and producer portfolio.

Include:
- Artist profiles.
- Production credits.
- Music placements.
- Featured collaborations.
- Album and single artwork.
- Streaming links.
- YouTube links.
- Spotify links.
- SoundCloud links.
- Social media links.

Make this section visually attractive and easy to manage through the admin dashboard.

### F. Studio Booking

Upgrade the booking experience.

Include:
- Available studio services.
- Session packages.
- Pricing.
- Session duration.
- Booking calendar.
- Available dates.
- Available time slots.
- Customer information.
- Booking confirmation.
- Deposit payment.
- Booking status.
- Email notifications where configured.

Prevent double bookings using server-side validation and database-level protection where appropriate.

### G. Merchandise Store

Retain and improve merchandise functionality.

Include:
- Product categories.
- Product images.
- Product details.
- Size and colour variations.
- Stock management.
- Shopping cart.
- Checkout.
- Order history.
- Order tracking.

### H. Customer Accounts

Implement secure customer accounts.

Include:
- Registration.
- Login.
- Logout.
- Password reset.
- Email verification where configured.
- Customer profile.
- Purchase history.
- Download library.
- Licence history.
- Booking history.
- Order status.

Customers must only access their own records and purchased downloads.

### I. Admin Dashboard

Create a powerful, modern, responsive administration dashboard.

The dashboard must be connected to the actual backend and database.

Do not use preview mode or hardcoded demo statistics in production.

Include:

**Overview**
- Revenue.
- Orders.
- Beat sales.
- Merchandise sales.
- Bookings.
- Customers.
- Recent transactions.
- Sales charts.

**Beat management**
- Add beats.
- Edit beats.
- Delete beats.
- Upload artwork.
- Upload preview audio.
- Upload master files.
- Configure prices.
- Configure licences.
- Manage featured beats.
- Manage beat availability.

**Merchandise management**
- Add products.
- Edit products.
- Delete products.
- Manage stock.
- Manage categories.

**Booking management**
- View bookings.
- Confirm bookings.
- Cancel bookings.
- Update booking status.
- Manage availability.

**Customer management**
- View customers.
- Review purchase history.
- Manage customer accounts.

**Order management**
- View orders.
- View payment status.
- Manage order fulfilment.
- Handle refunds through a properly authorized process.

**Reviews**
- Moderate reviews.
- Approve or reject submissions.

**Settings**
- Business information.
- Payment settings.
- Pricing.
- Licensing terms.
- Booking prices.
- Notification settings.

## 8. SECURITY REQUIREMENTS

Security is mandatory.

Perform a complete security review and implement appropriate protections.

### Authentication
- Hash passwords using Argon2id or a securely configured alternative.
- Use secure server-side sessions or properly implemented short-lived tokens.
- Configure HttpOnly, Secure, and SameSite cookies appropriately.
- Implement session expiration.
- Implement logout and session invalidation.
- Implement password reset securely.
- Protect against brute-force login attempts.

### Authorization
- Implement role-based access control.
- Separate administrator, manager, and customer permissions.
- Verify permissions on the server for every protected action.
- Never rely on frontend checks as the only access control.

### Database security
- Use parameterized queries.
- Validate all input.
- Prevent SQL injection.
- Use database transactions for critical payment and order operations.
- Protect sensitive database credentials.
- Apply least-privilege database access.

### API security
- Validate request bodies and query parameters.
- Configure CORS for trusted origins.
- Apply rate limiting.
- Implement CSRF protection where applicable.
- Set secure HTTP headers.
- Prevent mass assignment.
- Avoid leaking stack traces and internal errors.
- Use centralized error handling.

### File upload security
- Validate MIME types and file extensions.
- Validate actual file signatures where practical.
- Enforce upload size limits.
- Generate safe filenames.
- Prevent path traversal.
- Prevent executable file uploads.
- Restrict access to private master audio files.
- Use persistent storage suitable for production.

### Payment security
- Never trust payment amounts submitted by the frontend.
- Calculate prices on the server.
- Verify Paystack transactions server-side.
- Verify transaction amount and currency.
- Verify the order associated with the payment.
- Implement idempotent payment processing.
- Prevent duplicate orders and duplicate sales records.
- Implement secure Paystack webhook signature verification.
- Handle pending, successful, failed, abandoned, and reversed payments.
- Never expose Paystack secret keys to frontend code.
- Do not mark an order as paid based only on a frontend redirect.

### Download security
- Check order ownership.
- Confirm payment status.
- Confirm the purchased licence.
- Prevent unauthorized downloads.
- Use short-lived signed download URLs or an equivalent secure delivery mechanism.
- Keep original master files private.

### Admin security
- Remove hardcoded default credentials.
- Remove production preview authentication.
- Store administrator passwords securely.
- Implement admin login rate limiting.
- Audit sensitive administrative actions.
- Protect withdrawal and financial operations with additional verification.

### Secrets
- Store secrets in environment variables.
- Never commit `.env` files.
- Maintain a safe `.env.example`.
- Rotate exposed credentials.
- Never print secrets in logs.

## 9. PAYMENT AND CHECKOUT

Retain and improve the existing Paystack integration.

Support the payment methods enabled for the merchant account, including card and Mobile Money where available.

Implement:
- Secure checkout.
- Server-side pricing.
- Payment initialization.
- Transaction verification.
- Webhook processing.
- Payment status tracking.
- Order confirmation.
- Licence generation.
- Secure downloads.
- Booking payment confirmation.
- Merchandise order confirmation.
- Refund status management.

Ensure that retries and duplicate webhook events cannot create duplicate sales, orders, or bookings.

## 10. DATABASE AND BACKEND ARCHITECTURE

Review the existing database before making schema changes.

Maintain data integrity and existing customer records.

Create or improve database structures for:

- Users.
- Admins.
- Roles and permissions.
- Beats.
- Beat licences.
- Beat files.
- Products.
- Product variations.
- Categories.
- Orders.
- Order items.
- Payments.
- Downloads.
- Bookings.
- Booking availability.
- Artists.
- Music placements.
- Reviews.
- Notifications.
- Audit logs.

Use appropriate:
- Primary keys.
- Foreign keys.
- Unique constraints.
- Indexes.
- Transactions.
- Data validation.

Create safe, reversible database migrations.

Do not drop existing production tables or erase customer data.

## 11. SEO, ACCESSIBILITY AND PERFORMANCE

### SEO
- Semantic HTML.
- Appropriate page titles.
- Meta descriptions.
- Open Graph metadata.
- Social sharing images.
- Structured data where appropriate.
- Sitemap.
- Robots.txt.
- Canonical URLs.

### Accessibility
- Keyboard navigation.
- Visible focus states.
- Accessible forms.
- Proper labels.
- Sufficient colour contrast.
- Alternative text for meaningful images.
- Screen-reader-friendly controls.
- Reduced-motion support.

### Performance
- Optimize images.
- Lazy-load appropriate content.
- Compress assets.
- Minimize unnecessary JavaScript.
- Avoid excessive animation rendering.
- Optimize database queries.
- Use caching appropriately.
- Prevent layout shifts.
- Optimize audio loading.

Target excellent Core Web Vitals without sacrificing the visual experience.

## 12. TECHNICAL IMPLEMENTATION RULES

1. Respect the existing architecture.
2. Reuse working components.
3. Keep the backend and frontend properly separated.
4. Do not hardcode localhost API URLs throughout the application.
5. Use environment-based configuration for API endpoints.
6. Remove production mock data and preview modes.
7. Do not leave dead buttons or non-functional links.
8. Every visible action must perform its intended function.
9. Keep business logic on the backend.
10. Use maintainable, modular code.
11. Add appropriate validation and error handling.
12. Keep the project deployable.
13. Document all new environment variables.
14. Never fabricate successful payment or booking responses.
15. Do not claim a feature is implemented until it has been tested.

## 13. TESTING AND QUALITY ASSURANCE

Test the application thoroughly.

Include:

- Homepage tests.
- Navigation tests.
- Responsive layout tests.
- Authentication tests.
- Authorization tests.
- Beat upload tests.
- Audio preview tests.
- Licensing tests.
- Cart tests.
- Paystack test-mode integration.
- Payment verification tests.
- Webhook signature tests.
- Duplicate payment event tests.
- Booking conflict tests.
- Download permission tests.
- Admin dashboard tests.
- File upload security tests.
- Database integrity tests.

Test on mobile, tablet, and desktop viewports.

Fix all critical errors before considering the project complete.

## 14. IMPLEMENTATION STRATEGY

Work in controlled phases.

**Phase 1 — Audit**
Inspect the repository and produce a technical report.

**Phase 2 — Architecture and security**
Fix critical backend, authentication, payment, database, and file-storage weaknesses.

**Phase 3 — Design system**
Establish typography, colours, spacing, components, responsive rules, and motion principles.

**Phase 4 — Frontend transformation**
Redesign the homepage, marketplace, beat cards, audio player, licensing pages, booking experience, and merchandise pages.

**Phase 5 — Admin dashboard**
Connect all administrative interfaces to real backend functionality.

**Phase 6 — Integration**
Connect payments, downloads, bookings, accounts, notifications, and the database.

**Phase 7 — Testing**
Run functional, security, responsive, and performance tests.

**Phase 8 — Documentation and deployment**
Prepare production configuration, environment documentation, migration instructions, and deployment guidance.

At the end of every phase:
- Explain what was completed.
- List changed files.
- List unresolved issues.
- Run relevant tests.
- Identify the next phase.

Do not stop after producing a design mockup. Implement the actual application.

## 15. FINAL QUALITY STANDARD

The finished platform must be:

- Visually premium.
- Fully responsive.
- Smooth and animation-rich.
- Modern and interactive.
- Secure by design.
- Fast and accessible.
- Database-driven.
- Payment-ready.
- Easy to administer.
- Maintainable.
- Production-deployable.

The overall experience should feel like a premium international music production brand, not a generic template.

**Final instruction:** Start by inspecting the existing SlaughterHouse repository. Understand what is already implemented before changing anything. Prioritize preserving working functionality, fixing security problems, and delivering a complete, tested upgrade. Do not merely describe what you would do—make the changes in the codebase.