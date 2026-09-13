import { buttonVariants } from "@/components/ui/button";
import { ServiceStructuredData } from "@/components/seo/structured-data";
import { pageMetadata } from "@/lib/seo";

import {
  Search,
  MapPin,
  Building2,
  TrendingUp,
  ShieldCheck,
  ChevronRight,
  ArrowUpRight,
  SlidersHorizontal,
  Sparkles,
  PhoneCall,
  Calendar,
  Compass,
  FileText,
  Video,
  Layers,
  ChevronDown,
  Menu,
  X,
  CheckCircle2,
  Share2,
  Maximize,
  Bed,
  Bath,
  Grid
} from 'lucide-react';
import RealEstateHero from '@/components/real-estate/real-estate-hero';
import PropertyHeroSearch from '@/components/real-estate/property-hero-search';
import RealEstateApproach from '@/components/real-estate/real-estate-approach';
import Link from 'next/link';
import OwnersAndDevelopers from '@/components/real-estate/owners-and-developers';
import PropertyJourney from '@/components/real-estate/property-journey';

export const metadata = pageMetadata("/real-estate");

export default function CalacotEstatesHomepage() {




  return (
    <div className="min-h-screen ">
      <ServiceStructuredData path="/real-estate" />
      
   

     
      <RealEstateHero />
<RealEstateApproach />
     

   {/* Choose your journey */}
<section className="bg-brand-white px-6 text-brand-black dark:bg-brand-black dark:text-brand-white md:px-12 section-space">
  <div className="mx-auto max-w-7xl">
    <header className="mb-8 grid gap-5 lg:grid-cols-[1.4fr_1fr] lg:items-end lg:gap-12 md:mb-10">
      <h2 className="max-w-2xl font-serif section-heading">
        What does your next
        <br />
        chapter look like?
      </h2>

      <p className="max-w-sm text-sm leading-7 text-brand-black/65 dark:text-brand-white/65 md:text-base lg:justify-self-end">
        Tell us what you have in mind. We’ll begin with what matters to you.
      </p>
    </header>

    <div className="grid gap-6 md:grid-cols-3">
      {[
        {
          title: "Find your next home",
          description:
            "A place that reflects your priorities, your routines and what comes next.",
          cta: "Discuss your search",
          href: "/contact?intent=buy-home",
          image:
            "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1000&q=85",
        },
        {
          title: "Find land to build on",
          description:
            "Start with your vision for the space, its setting and its future use.",
          cta: "Share your requirements",
          href: "/contact?intent=buy-land",
          image:
            "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1000&q=85",
        },
        {
          title: "Sell your property",
          description:
            "Tell us about your property and discuss how Calacot Estates could represent it.",
          cta: "Introduce your property",
          href: "/contact?intent=sell-property",
          image:
            "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1000&q=85",
        },
      ].map((journey) => (
        <Link
          key={journey.title}
          href={journey.href}
          className="group block min-w-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary"
        >
          {/* Illustrative photography */}
          <div className="aspect-[4/3] overflow-hidden bg-brand-black/5 dark:bg-brand-white/5">
            <img
              src={journey.image}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.025] motion-reduce:transform-none motion-reduce:transition-none"
            />
          </div>

          <div className="pt-5">
            <h3 className="font-serif text-2xl leading-tight tracking-[-0.025em] lg:text-3xl">
              {journey.title}
            </h3>

            <p className="mt-3 max-w-[34ch] text-sm leading-6 text-brand-black/65 dark:text-brand-white/65">
              {journey.description}
            </p>

            <span className="mt-5 inline-flex min-h-11 items-center gap-3 text-sm font-semibold">
              {journey.cta}

              <ArrowUpRight
                aria-hidden="true"
                className="size-4 text-brand-black transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 dark:text-brand-primary motion-reduce:transition-none"
              />
            </span>
          </div>
        </Link>
      ))}
    </div>
  </div>
</section>
     

   

<OwnersAndDevelopers />

<PropertyJourney />
   

  
     {/* ==================== 12. INSIGHTS & MARKET INTELLIGENCE ==================== */}
      {/* <section id="insights" className="max-w-7xl mx-auto px-6 md:px-12 mb-32">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12">
          <div>
            
            <h2 className="text-3xl md:text-5xl font-serif text-brand-black dark:text-brand-white mt-1">Market Intelligence</h2>
          </div>
          <a href="#" className="text-xs uppercase tracking-widest font-semibold text-brand-black dark:text-brand-white hover:text-amber-600 flex items-center gap-1 mt-4 md:mt-0">
            View All Reports <ChevronRight size={14} />
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              title: "Uganda Luxury Property Market Outlook 2026",
              category: "Report",
              date: "Q1 2026 Edition",
              img: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80"
            },
            {
              title: "Buying Off-Plan in Kampala: Risk Mitigation & Max ROI",
              category: "Guide",
              date: "5 Min Read",
              img: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=80"
            },
            {
              title: "The Emergence of Entebbe Lakefront Luxury Real Estate",
              category: "Trends",
              date: "7 Min Read",
              img: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80"
            }
          ].map((post, idx) => (
            <div key={idx} className="group cursor-pointer">
              <div className="h-56 rounded-xl overflow-hidden mb-4 border border-stone-200">
                <img src={post.img} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              </div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-amber-600 font-medium">
                <span>{post.category}</span> · <span className="text-brand-white dark:text-brand-black/80">{post.date}</span>
              </div>
              <h3 className="text-xl font-serif text-brand-black dark:text-brand-white mt-2 group-hover:text-brand-primary transition-colors leading-snug">
                {post.title}
              </h3>
            </div>
          ))}
        </div>
      </section> */}

      {/* ==================== 13. FINAL CALL TO ACTION ==================== */}
     <section className="bg-brand-white px-6 text-brand-black dark:bg-brand-black dark:text-brand-white md:px-12 section-space">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="font-serif section-heading">
          Your next chapter
          <br />
          starts with a conversation.
        </h2>

        <p className="mx-auto mt-5 max-w-lg text-sm leading-7 text-brand-black/65 dark:text-brand-white/65 md:text-base">
          Tell us where you’d like to be and what matters to you.
          Let’s discuss the property you have in mind.
        </p>

        <div className="mt-7 flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-7">
          <Link
            href="/contact?intent=buy-home"
            className={buttonVariants({ variant: "default", size: "lg", className: "inline-flex" })}
          >
            Discuss your property search

            <ArrowUpRight
              aria-hidden="true"
              className="size-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none"
            />
          </Link>

          <Link
            href="/list-property?type=individual"
            className="inline-flex min-h-12 items-center justify-center text-sm font-medium text-brand-black/70 transition-colors hover:text-brand-black focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary dark:text-brand-white/70 dark:hover:text-brand-white"
          >
            Have a property to sell?
          </Link>
        </div>
      </div>
    </section>

      
    </div>
  );
}