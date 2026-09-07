
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

export default function CalacotEstatesHomepage() {




  return (
    <div className="min-h-screen  ">
      
   

     
      <RealEstateHero />
<RealEstateApproach />
     

   {/* Choose your journey */}
<section className="bg-brand-white px-6 py-16 text-brand-black dark:bg-brand-black dark:text-brand-white md:px-12 md:py-20">
  <div className="mx-auto max-w-7xl">
    <header className="mb-8 grid gap-5 lg:grid-cols-[1.4fr_1fr] lg:items-end lg:gap-12 md:mb-10">
      <h2 className="max-w-2xl font-serif text-3xl leading-[1.08] tracking-[-0.035em] md:text-4xl lg:text-5xl">
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

      {/* ==================== 9. LIFESTYLE SECTION ==================== */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 mb-32">
        <div className="mb-12">
          <span className="text-xs uppercase tracking-widest text-brand-primary font-semibold">The Calacot Way</span>
          <h2 className="text-3xl md:text-5xl font-serif text-brand-black dark:text-brand-white mt-1">More Than Property. A Way of Living.</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { title: "Waterfront Sanctuaries", img: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80", tag: "Munyonyo & Entebbe" },
            { title: "Urban Sky Mansions", img: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80", tag: "Nakasero Skyline" },
            { title: "Gated Eco-Residences", img: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80", tag: "Naguru Green Hills" }
          ].map((item, idx) => (
            <div key={idx} className="relative h-[420px] rounded-2xl overflow-hidden group">
              <img src={item.img} alt={item.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-stone-950/80 via-transparent to-transparent"></div>
              <div className="absolute bottom-8 left-8 right-8">
                <span className="text-[10px] text-amber-400 uppercase tracking-widest font-semibold">{item.tag}</span>
                <h3 className="text-2xl font-serif text-white mt-1">{item.title}</h3>
              </div>
            </div>
          ))}
        </div>
      </section>

   

  
     {/* ==================== 12. INSIGHTS & MARKET INTELLIGENCE ==================== */}
      <section id="insights" className="max-w-7xl mx-auto px-6 md:px-12 mb-32">
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
      </section>

      {/* ==================== 13. FINAL CALL TO ACTION ==================== */}
      <section className=" text-brand-black dark:text-brand-white py-24 px-6 md:px-12 text-center relative overflow-hidden">

        <div className="max-w-3xl mx-auto relative z-10">
          <h2 className="text-3xl md:text-6xl font-serif leading-tight">Your Next Prime Investment Begins Here.</h2>
          <p className="text-brand-white text-sm md:text-base mt-6 max-w-xl mx-auto font-light">
            Connect with our dedicated advisors to receive custom property dossiers and off-market opportunities tailored to your objectives.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <a href="#search" className="px-8 py-4 bg-amber-500 text-stone-950 font-medium text-xs uppercase tracking-widest hover:bg-amber-400 transition-colors rounded shadow-xl">
              Explore Properties
            </a>
            <a href="#concierge" className="px-8 py-4 border border-stone-700 text-white font-medium text-xs uppercase tracking-widest hover:border-white transition-colors rounded">
              Talk to an Advisor
            </a>
          </div>
        </div>
      </section>

      
    </div>
  );
}