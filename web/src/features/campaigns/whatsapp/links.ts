/** WhatsApp link helpers shared by the UI preview and the launch action. */

export const waDigits = (n: string) => n.replace(/\D/g, "");

/** Click-to-chat link: opens WhatsApp with `text` typed in. */
export const waLink = (number: string, text: string) => `https://wa.me/${waDigits(number)}?text=${encodeURIComponent(text)}`;

/** Default per-item message; `{item}` is replaced with the card headline. */
export const ITEM_MESSAGE_TEMPLATE = 'Hi! I\'m interested in "{item}" from your ad. Is it available?';

export const itemMessage = (template: string, headline: string) =>
  (template.trim() || ITEM_MESSAGE_TEMPLATE).replaceAll("{item}", headline.trim() || "this item");

export const GREETING_MAX = 300;
export const PREFILL_MAX = 200;
export const QUESTION_MAX = 80;
export const MAX_QUESTIONS = 4;
