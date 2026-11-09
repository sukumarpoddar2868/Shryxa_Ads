/**
 * Legal pages (Markdown). Ported from the Streamlit app's dashboard/views/*.py
 * and updated for the Next.js stack: Shryxa Ads name, Vercel hosting,
 * Supabase database/storage (Mumbai), Groq AI, Meta OAuth with encrypted tokens.
 * Edit the text here — pages render it with react-markdown + GFM tables.
 */

export const LAST_UPDATED = "8 November 2026";

export const CONTACT = {
  name: "Sukumar Poddar",
  city: "Bangalore, Karnataka, India",
  email: "sukumarpoddar90@gmail.com",
  whatsapp: "+91 9102916841",
};

// Markdown hard line breaks (two trailing spaces) keep the address on separate lines.
const contactBlock = [CONTACT.name, CONTACT.city, `**${CONTACT.email}**`, `WhatsApp **${CONTACT.whatsapp}**`].join("  \n");

export type LegalDoc = { slug: "privacy" | "terms" | "refund" | "service" | "data-deletion"; title: string; short: string; body: string };

const privacy: LegalDoc = {
  slug: "privacy",
  title: "Privacy Policy",
  short: "Privacy",
  body: `
## 1. Who we are

Shryxa Ads ("the Service") is operated by **${CONTACT.name}**, sole proprietor
based in Bangalore, India. This Privacy Policy explains what personal
data we collect, why we collect it, and how we handle it. By using the
Service you agree to the data practices described below.

## 2. What data we collect

We collect only what is necessary to operate the Service:

| Category | Examples | Why |
|---|---|---|
| Account data | Email address, hashed password, currency preference | To create and secure your account |
| Subscription data | Trial start/end date, subscription status, Razorpay subscription ID | To enforce billing |
| Client data | Client business names, Meta Ad Account IDs, Page IDs | To manage campaigns for each client |
| Meta connection | Meta user ID and name, ad account names, an access token (encrypted) | To launch and manage ads on your or your client's behalf |
| Ad content | Headlines, descriptions you type; images and videos you upload | To create the ad campaigns you request |
| Session data | A randomly generated session token stored in a browser cookie | To keep you logged in |
| Usage data | Basic server logs (page requests, errors) | To diagnose bugs |

We do **not** collect: government ID numbers, financial card numbers
(those go directly to Razorpay), Meta passwords, location data beyond
the cities you enter, or biometric data.

## 3. Where your data is stored

- **Account, subscription and client data**: stored in our PostgreSQL
  database hosted by Supabase in the AWS Asia-Pacific (Mumbai) region.
- **Meta access tokens**: encrypted before they are written to the
  database, and only decrypted on our server when a campaign action
  needs them.
- **Uploaded media files**: stored in our cloud storage (Supabase).
  Media is also uploaded to Meta when you launch a campaign, and from
  that point lives in the connected Meta Ad Account.
- **Payment data**: handled entirely by Razorpay. We never see or store
  card numbers.

## 4. Third parties we use

| Provider | Purpose | What they receive |
|---|---|---|
| **Meta (Facebook)** | Sign-in for ad accounts and running your ad campaigns | Ad account ID, Page ID, ad creative and targeting |
| **Razorpay** | Process subscription payments | Your email, subscription amount |
| **Groq** | Generate ad copy and resolve city locations | Business and product descriptions you enter (text only, no media) |
| **Vercel** | Host the application | Request traffic to the Service |
| **Supabase** | Database and file storage | All persisted account, client and campaign data |

Each provider has its own privacy policy. We choose providers we
believe comply with reasonable data protection standards.

## 5. How we use your data

We use your data only to:

- Operate the Service (signup, login, billing, client management,
  campaign launching).
- Communicate operationally with you (renewal reminders, billing
  failures, account security).
- Improve the Service (debugging, usability).

We do **not**:

- Sell your data to third parties.
- Share your data for advertising other products.
- Use your ad content, business descriptions, or media to train AI
  models. AI requests are transactional only.

## 6. Cookies

We use a single, HTTP-only session cookie (\`shryxa_session\`) to keep
you signed in for up to 30 days. Removing this cookie signs you out. We
do not use tracking cookies or third-party advertising cookies.

## 7. Your rights

You have the right to:

- **Access** the data we hold about you.
- **Correct** inaccurate data.
- **Delete** your account and associated data.
- **Export** your data in a machine-readable format.
- **Disconnect** a Meta account at any time, which deletes the stored
  access token.

To exercise any of these, email **${CONTACT.email}**. We will respond
within 30 days.

## 8. Security

- All connections are over HTTPS.
- Passwords are hashed using bcrypt with a per-user salt.
- Meta access tokens are encrypted at rest.
- Database credentials and API keys are stored as environment variables,
  never in code or version control.
- Session tokens are randomly generated with a 30-day expiry.

No system is perfect. If we discover a breach affecting your data, we
will notify you within 72 hours.

## 9. Data retention

- Account data is retained while your account is active and for 12
  months after deletion, for accounting purposes.
- Uploaded media files are retained for 90 days after launch, then
  purged.
- Session tokens expire after 30 days.

## 10. Children

The Service is not intended for users under 18. We do not knowingly
collect data from minors.

## 11. Changes to this Policy

We may update this Policy. The "Last updated" date at the top reflects
the most recent revision. Material changes will be notified via email.

## 12. Contact

${contactBlock}
`,
};

const terms: LegalDoc = {
  slug: "terms",
  title: "Terms of Service",
  short: "Terms",
  body: `
## 1. About this service

Shryxa Ads ("the Service") is a software-as-a-service dashboard operated
by **${CONTACT.name}**, sole proprietor based in Bangalore, India ("we",
"us"). The Service helps you create, preview, launch, and manage
advertising campaigns on Meta platforms (Facebook and Instagram) using
your own — or your clients' — Meta ad accounts.

You access the Service on the web by signing up with an email address
and password.

## 2. Eligibility

To use the Service you must:

- Be at least **18 years old** and legally able to enter into contracts
  in your jurisdiction.
- Have access to a Meta Business account with a Facebook Page and an
  Ad Account (yours or a client's).
- Comply with Meta's Advertising Policies and Community Standards.

## 3. Account registration

You agree to provide accurate information when registering. You are
responsible for keeping your password secure. We hash passwords using
bcrypt and never store them in plain text. You are responsible for all
activity that happens under your account.

## 4. Subscription and billing

- The Service offers a **2-day free trial** on signup. No payment method
  is required during the trial.
- After the trial, continued access requires a paid subscription. The
  Starter plan is **₹999 per month** for users in India, billed monthly
  via Razorpay. International pricing (where supported) is **$21 per
  month**, billed via Razorpay International. Agency plans are priced
  separately and shown before purchase.
- Subscriptions renew automatically each month unless cancelled. By
  subscribing, you authorise Razorpay to charge your registered payment
  method on the renewal date.
- All payments are processed by Razorpay. We do not see, store, or have
  access to your card details — Razorpay's PCI-DSS compliant systems
  handle all card data.

## 5. Your responsibilities

You agree that:

- You will only run campaigns for ad accounts you own or are explicitly
  authorised to operate (for example, a client who connected their Meta
  account through the Service or granted you Partner Access).
- The advertising content you upload through the Service (images,
  videos, text, landing pages) is yours or properly licensed to you.
- You will not use the Service to run ads that violate Meta's policies,
  Indian advertising regulations, or applicable consumer protection laws.
- You will not attempt to reverse engineer, scrape, or interfere with
  the Service.

## 6. Service availability

We aim to keep the Service available continuously but do not guarantee
uninterrupted access. Scheduled maintenance, third-party outages (Meta
API, Razorpay, Vercel, Supabase, Groq), and force majeure events may
cause interruptions.

## 7. Termination

You may cancel your subscription at any time. We may suspend or
terminate your account if you violate these Terms or applicable law. On
termination, your access ends but your Meta campaigns remain in the Meta
Ad Account (we never delete data on Meta's servers).

## 8. Limitation of liability

The Service is provided "as is". To the maximum extent permitted by law,
we are not liable for:

- Indirect, incidental, or consequential damages.
- Loss of advertising spend, revenue, or business opportunity arising
  from your use of the Service.
- Outcomes of Meta's ad delivery, auction performance, or policy
  enforcement.

Our aggregate liability for any claim is limited to the amount you paid
us in the **12 months preceding** the claim.

## 9. Changes to these Terms

We may update these Terms from time to time. Material changes will be
notified by email or via an in-app notice at least 7 days before they
take effect.

## 10. Governing law and jurisdiction

These Terms are governed by the laws of **India**. Any disputes shall be
subject to the exclusive jurisdiction of the **courts of Bangalore,
Karnataka, India**.

## 11. Contact

For questions about these Terms, contact us at **${CONTACT.email}** or
WhatsApp **${CONTACT.whatsapp}**.
`,
};

const refund: LegalDoc = {
  slug: "refund",
  title: "Refund & Cancellation Policy",
  short: "Refunds",
  body: `
## 1. Free trial

Every new account starts with a **2-day free trial** of the Starter
plan. No payment method is required to start the trial. The trial
expires automatically after 2 days — there is **nothing to refund**
because nothing was charged.

If you do not subscribe before the trial ends, your access is paused
and any active Meta campaigns are automatically paused on Meta's side
(see the Service Delivery Policy).

## 2. Pro-rated refund within 7 days of first payment

If you subscribe (pay your first month's ₹999 or applicable amount) and
decide it's not for you, you may request a **pro-rated refund** within
**7 calendar days** of your first payment.

How the pro-rating works:

| Days used since first payment | Refund |
|---|---|
| 0–2 days | Full refund (₹999) |
| 3 days | ₹999 × (4/7) ≈ ₹571 refund |
| 4 days | ₹999 × (3/7) ≈ ₹428 refund |
| 5 days | ₹999 × (2/7) ≈ ₹286 refund |
| 6 days | ₹999 × (1/7) ≈ ₹143 refund |
| 7 days | Last day of eligibility (1/7 ≈ ₹143) |
| 8+ days | No refund — see Section 3 |

Refunds are issued back to the original payment method via Razorpay
within **5–7 business days** of approval.

## 3. After the 7-day window

Once 7 days have passed from your first payment, **no refund** is issued
for the current month. You may still cancel — see Section 4 — and your
subscription will not renew the following month.

## 4. Cancellation

You can cancel your subscription at any time. Two ways:

1. **Via Razorpay**: open your most recent Razorpay billing email and
   click *Manage subscription* → *Cancel*. The cancellation is
   immediate; no further charges will be made.
2. **Email or WhatsApp**: message us on **${CONTACT.whatsapp}** or email
   **${CONTACT.email}** with the subject line *"Cancel subscription"* and
   your registered email — we'll cancel it for you within one business
   day.

After cancellation:

- Your current paid period continues until the renewal date — you keep
  full access.
- No further charges are made.
- Your Meta campaigns continue to exist on Meta's servers (we do not
  delete data on Meta's side). You retain full control via Meta
  Business Manager.

## 5. Subsequent monthly payments

For months **after the first**, the same pro-rating rule applies if you
request a refund within 7 days of that month's charge. After 7 days into
any month, no refund is issued for that month.

## 6. Failed renewals

If your monthly payment fails (e.g. card expired, insufficient funds),
Razorpay will retry per their standard schedule. After repeated
failures, your account is moved to *past due* status and your active
Meta campaigns are paused automatically. Updating your payment method
restores access and resumes paused campaigns.

## 7. Exceptional refunds

We will consider a full refund outside the 7-day window if:

- The Service was unavailable for **more than 48 consecutive hours**
  during your billing month due to an issue on our side (not a
  third-party outage like Meta, Razorpay, Vercel or Supabase).
- A billing error occurred (double charge, incorrect amount).

Email **${CONTACT.email}** with details and we'll review within 5
business days.

## 8. Chargebacks

If you dispute a charge directly with your bank or card network instead
of contacting us, your account will be suspended pending dispute
resolution. We strongly prefer to handle refund requests directly —
it's faster and avoids dispute fees.

## 9. Contact

${contactBlock}

Refund requests are processed Monday–Friday, 10:00–18:00 IST. Response
time: within 24 hours of receipt.
`,
};

const service: LegalDoc = {
  slug: "service",
  title: "Service Delivery Policy",
  short: "Service delivery",
  body: `
## 1. Nature of the Service

Shryxa Ads is a **digital software-as-a-service**. There are no physical
goods to ship. Delivery happens entirely online via the web application.

## 2. When access is delivered

| Event | Access activated |
|---|---|
| You sign up for a free trial | **Immediately** on email + password submission |
| You complete a subscription payment via Razorpay | **Within 2 minutes** of Razorpay's payment confirmation |
| You upgrade to an Agency tier via invoice | **Within 24 hours** of payment confirmation |

If you do not see your subscription active within 10 minutes of a
successful Razorpay payment, sign out and back in, or contact us — see
Section 6.

## 3. What "delivery" includes

A delivered subscription gives you:

- Access to the dashboard: campaigns, clients, account and billing.
- The ability to manage up to 1 client Meta Ad Account (Starter tier;
  more on Agency tiers).
- AI-assisted ad copy generation and city resolution for geo-targeting.
- Placement previews and one-click launching of campaigns to the
  connected Meta Ad Account.
- Auto-pause / auto-resume of campaigns based on subscription status.

## 4. Service uptime

We host the Service on **Vercel** with a database and file storage on
**Supabase**. Both providers have their own SLAs. We aim for
**best-effort 99%+ uptime** but do not provide a formal SLA at this
stage. Planned maintenance is rare and announced in advance via in-app
notice or email.

Periods of unavailability that are not our fault — outages of Meta's
API, Razorpay, Vercel, Supabase, or Groq — do not count against our
uptime commitment.

## 5. No physical shipping

This is a fully digital service. We do not ship any physical product.
No shipping address is collected during signup or checkout. No shipping
or handling fees apply.

## 6. Support and issue reporting

If you experience issues with service delivery — signup not working,
payment confirmed but subscription not active, ads not launching,
dashboard not loading — contact us:

- **Email**: ${CONTACT.email}
- **WhatsApp**: ${CONTACT.whatsapp}

**Response time**: within 24 hours, Monday–Friday, 10:00–18:00 IST. For
urgent issues during business hours, WhatsApp is faster.

## 7. Service modifications

We may add new features, change limits on tiers, or modify the
dashboard layout from time to time. Material changes that affect what
you pay or how the Service works will be notified at least 7 days in
advance.

## 8. Termination of service

Your access ends when:

- You cancel your subscription (next renewal does not occur).
- A renewal payment fails repeatedly and is not resolved.
- We terminate your account for violation of the Terms of Service.

On termination, your campaigns remain inside the Meta Ad Account — we do
not delete data on Meta's servers. You retain full control via Meta
Business Manager directly.

## 9. Contact

${contactBlock}
`,
};

const dataDeletion: LegalDoc = {
  slug: "data-deletion",
  title: "Data Deletion",
  short: "Data deletion",
  body: `
## 1. What we keep from Facebook

When you connect Facebook, Shryxa Ads stores only what it needs to run your
ads: an **encrypted access token**, your Facebook user id and name, and the
ids and names of the ad account, Page, Instagram account and Pixel you pick.
We don't store your posts, friends, messages, or the leads collected by your
forms — leads are read live from Meta when you open the Leads page.

## 2. Delete your Facebook data — three ways

1. **From Facebook.** Go to Facebook → *Settings & privacy* → *Settings* →
   *Apps and websites*, find **Shryxa Ads** and choose **Remove**. Facebook
   tells us automatically and we delete your Facebook data from our systems.
   You'll get a confirmation code you can check on this page.
2. **From Shryxa Ads.** Open a client and choose **Disconnect Facebook** to
   delete that connection, or go to **Account → Delete account** to delete
   your whole account and everything in it.
3. **By email.** Write to **${CONTACT.email}** from your account email and
   we'll delete it within 7 days.

## 3. What gets deleted

- Your encrypted Facebook access tokens and connection records.
- The Facebook user id and name we stored with them.
- Deleting your account also removes your clients, saved drafts, uploaded
  ad media and login sessions.

Campaigns you already launched live inside **your own Meta ad account** —
we don't delete them on Meta. You keep full control in Meta Ads Manager.

## 4. Timing

Removal through Facebook or the app happens **immediately**. Email requests
are handled within 7 days.

## 5. Contact

${contactBlock}
`,
};

export const LEGAL_DOCS: LegalDoc[] = [privacy, terms, refund, service, dataDeletion];

export function getLegalDoc(slug: LegalDoc["slug"]): LegalDoc {
  const doc = LEGAL_DOCS.find((d) => d.slug === slug);
  if (!doc) throw new Error(`Unknown legal doc: ${slug}`);
  return doc;
}
