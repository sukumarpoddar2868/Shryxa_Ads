import type { LaunchPayload } from "../launch-actions";
import type { Draft } from "./blueprint";

/** Draft (with local blob previews) → the compact payload the server validates. */
export function toLaunchPayload(d: Draft): LaunchPayload | null {
  if (!d.clientId || !d.objective) return null;
  const m = d.ad.media;
  return {
    clientId: d.clientId,
    objective: d.objective,
    campaign: {
      name: d.campaign.name,
      budgetType: d.campaign.budgetType,
      amount: Number(d.campaign.amount) || 0,
      currency: d.campaign.currency,
      startDate: d.campaign.startDate || undefined,
      endDate: d.campaign.endDate || undefined,
      frequencyCap: d.objective === "OUTCOME_AWARENESS" ? d.campaign.frequencyCap : undefined,
    },
    audience: {
      pins: d.audience.locations.map((p) => ({ lat: p.lat, lng: p.lng, radiusKm: p.radiusKm })),
      ageMin: d.audience.ageMin,
      ageMax: d.audience.ageMax,
      gender: d.audience.gender,
      language: d.audience.language,
      advantage: d.audience.mode === "advantage",
      device: d.audience.device,
    },
    placements: { manual: d.placements.mode === "manual", facebook: d.placements.facebook, instagram: d.placements.instagram },
    ad: {
      destination: d.ad.destination,
      url: d.ad.destination === "website" ? d.ad.url.trim() : d.setup.website.trim(),
      phone: d.ad.phone,
      whatsappNumber: d.ad.whatsappNumber,
      conversionEvent: d.ad.conversionEvent,
      whatsapp: d.ad.whatsapp,
      primaryText: d.ad.primaryText,
      headline: d.ad.headline,
      description: d.ad.description,
      cta: d.ad.cta,
      format: d.ad.format,
      media: {
        feed: m.feed?.path,
        portrait: m.portrait?.path,
        story: m.story?.path,
        video: m.video?.path,
        videoCover: m.video?.thumbnail?.path,
      },
      cards:
        d.ad.format === "carousel"
          ? d.ad.carousel.cards.map((c) => ({ headline: c.headline, description: c.description, link: c.link.trim(), imagePath: c.image?.path ?? "", waMessage: c.waMessage }))
          : [],
      optimizeOrder: d.ad.carousel.optimizeOrder,
      endCard: d.ad.carousel.endCard,
      leadForm:
        d.ad.destination === "lead_form"
          ? {
              name: d.ad.leadForm.name,
              privacyUrl: d.ad.leadForm.privacyUrl.trim(),
              fields: d.ad.leadForm.fields,
              questions: d.ad.leadForm.questions.map((q) => q.trim()).filter(Boolean),
              thankYou: d.ad.leadForm.thankYou,
            }
          : undefined,
    },
  };
}
