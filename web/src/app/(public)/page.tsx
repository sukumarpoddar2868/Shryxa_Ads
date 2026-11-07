import { SiteNav } from "@/features/marketing/components/site-nav";
import {
  Hero,
  IndustryMarquee,
  Contrast,
  HowItWorks,
  Features,
  Placements,
  Facts,
  Audiences,
  Plans,
  Faq,
  FinalCta,
  SiteFooter,
} from "@/features/marketing/sections";

export default function Home() {
  return (
    <>
      <SiteNav />
      <main>
        <Hero />
        <IndustryMarquee />
        <Contrast />
        <HowItWorks />
        <Features />
        <Placements />
        <Facts />
        <Audiences />
        <Plans />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
