/**
 * Meta Pixel install snippets per campaign goal. Pure (used in the browser).
 * Base code goes in <head> of every page; the event line fires on the page
 * (or action) that counts as a result.
 */

/** Our conversion-event keys → Meta standard event names. */
export const STANDARD_EVENT: Record<string, string> = {
  LEAD: "Lead",
  COMPLETE_REGISTRATION: "CompleteRegistration",
  CONTACT: "Contact",
  SCHEDULE: "Schedule",
  PURCHASE: "Purchase",
  INITIATED_CHECKOUT: "InitiateCheckout",
  ADD_TO_CART: "AddToCart",
};

export function baseCode(pixelId: string): string {
  return `<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1"
/></noscript>
<!-- End Meta Pixel Code -->`;
}

/** Event line for the result page, e.g. the thank-you or order-confirmation page. */
export function eventCode(event: string, currency = "INR"): string {
  const name = STANDARD_EVENT[event] ?? "Lead";
  if (name === "Purchase") {
    return `<script>
  // On the order-confirmation page. Replace 999 with the real order total.
  fbq('track', 'Purchase', { value: 999, currency: '${currency}' });
</script>`;
  }
  return `<script>
  fbq('track', '${name}');
</script>`;
}

/** Same event fired when a form is submitted (no separate thank-you page). */
export function onSubmitCode(event: string): string {
  const name = STANDARD_EVENT[event] ?? "Lead";
  return `<script>
  // Change "#contact-form" to your form's selector.
  document.querySelector('#contact-form')?.addEventListener('submit', function () {
    fbq('track', '${name}');
  });
</script>`;
}

/** Where to paste, by website builder. */
export const PLATFORM_TIPS: { name: string; steps: string }[] = [
  { name: "WordPress", steps: "Install the official “Meta Pixel for WordPress” plugin and enter the Pixel ID — or paste the base code with a header/footer plugin (e.g. WPCode) into the site header." },
  { name: "Shopify", steps: "Install the “Facebook & Instagram” app and connect this Pixel. Purchases, add-to-cart and checkout are tracked automatically — no code needed." },
  { name: "Wix", steps: "Marketing Integrations → Facebook Pixel & CAPI → enter the Pixel ID. Wix tracks page views and purchases for you." },
  { name: "Squarespace", steps: "Settings → Advanced → Code Injection → paste the base code in Header. Add the event code to the thank-you page's Page Header Code Injection." },
  { name: "Custom HTML / React / Next.js", steps: "Paste the base code inside <head> on every page (in React/Next, use your root layout). Fire the event line on the thank-you page or when the form submits." },
];
