'use client';

import React, { useState, useEffect } from 'react';
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

export default function CalacotEstatesHomepage() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
 
  const [selectedMapPin, setSelectedMapPin] = useState<string>('kololo');

  // Track scroll position for transparent -> solid header
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 40);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen  ">
      
   

      {/* ==================== 2. HERO SECTION (Inspired by Image Layout) ==================== */}
      <RealEstateHero />

      {/* ==================== 3. PROPERTY INTELLIGENCE SEARCH ==================== */}
    <PropertyHeroSearch />

      {/* ==================== 4. FEATURED DEVELOPMENTS (Editorial Layout) ==================== */}
      <section id="developments" className="max-w-7xl mx-auto px-6 md:px-12 mb-32">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12">
          <div>
           
            <h2 className="text-3xl md:text-5xl font-serif text-brand-black dark:text-brand-white mt-2">Featured Developments</h2>
          </div>
          <p className="text-brand-black dark:text-brand-white/80 text-sm max-w-md mt-4 md:mt-0 font-light">
            Luxury magazine style curation of Uganda’s premier master-planned luxury compounds and high-yield residences.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {[
            {
              title: "The Paragon Residences",
              location: "Kololo Heights, Kampala",
              price: "From $420,000",
              status: "Selling Off-Plan",
              units: "24 Private Suites",
              completion: "Q4 2027",
              img: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1000&q=80"
            },
            {
              title: "Victoria Crest Villas",
              location: "Munyonyo Waterfront",
              price: "From $890,000",
              status: "Ready For Move-in",
              units: "12 Lakefront Mansions",
              completion: "Completed",
              img: "https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=1000&q=80"
            },
            {
              title: "Nakasero Sky Tower",
              location: "Central Business District",
              price: "From $310,000",
              status: "Under Construction",
              units: "48 Mixed-Use Units",
              completion: "Q2 2028",
              img: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1000&q=80"
            }
          ].map((dev, idx) => (
            <div key={idx} className="group bg-white rounded-xl overflow-hidden border border-stone-200 shadow-lg flex flex-col transition-all duration-500 hover:-translate-y-2">
              <div className="relative h-80 overflow-hidden">
                <img
                  src={dev.img}
                  alt={dev.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute top-4 left-4 bg-stone-950/80 backdrop-blur-md text-amber-400 text-[10px] uppercase tracking-widest px-3 py-1 rounded">
                  {dev.status}
                </div>
                <div className="absolute bottom-4 right-4 bg-white/90 text-stone-950 text-xs font-semibold px-3 py-1 rounded shadow">
                  {dev.price}
                </div>
              </div>

              <div className="p-6 flex-1 flex flex-col justify-between">
                <div>
                  <div className="text-xs text-brand-white uppercase tracking-wider flex items-center gap-1 mb-1">
                    <MapPin size={12} className="text-amber-500" /> {dev.location}
                  </div>
                  <h3 className="text-2xl font-serif text-stone-900 group-hover:text-amber-600 transition-colors">{dev.title}</h3>
                </div>

                <div className="mt-6 pt-4 border-t border-stone-100 grid grid-cols-2 text-xs text-stone-600">
                  <div>
                    <span className="block text-brand-white text-[10px] uppercase">Available Units</span>
                    <span className="font-medium text-stone-900">{dev.units}</span>
                  </div>
                  <div>
                    <span className="block text-brand-white text-[10px] uppercase">Completion</span>
                    <span className="font-medium text-stone-900">{dev.completion}</span>
                  </div>
                </div>

                <a href="#concierge" className="mt-6 w-full py-3 bg-stone-100 hover:bg-stone-950 hover:text-white text-stone-900 font-medium text-xs uppercase tracking-widest text-center transition-colors rounded">
                  Explore Development
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ==================== 5. CHOOSE YOUR JOURNEY ==================== */}
      <section className=" text-brand-black dark:text-brand-white py-24 px-6 md:px-12 mb-32">
        <div className="max-w-7xl mx-auto">
          <div className="mb-16 text-center max-w-2xl mx-auto">
            
            <h2 className="text-3xl md:text-5xl font-serif mt-2">Choose Your Journey</h2>
            <p className=" text-sm mt-3 font-light">
              Whether acquiring a personal residence, growing institutional yield, or securing strategic land assets.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { title: "Buy a Home", desc: "Luxury villas & penthouses", img: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=600&q=80" },
              { title: "Invest", desc: "High-yield asset funds", img: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=600&q=80" },
              { title: "Commercial", desc: "Grade A office space", img: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=600&q=80" },
              { title: "Strategic Land", desc: "Prime development parcels", img: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=600&q=80" },
              { title: "Rent", desc: "Bespoke executive leases", img: "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=600&q=80" }
            ].map((journey, idx) => (
              <div key={idx} className="relative h-96 rounded-xl overflow-hidden group cursor-pointer border border-stone-800">
                <img src={journey.img} alt={journey.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-70 group-hover:opacity-90" />
                <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/40 to-transparent"></div>
                <div className="absolute bottom-6 left-6 right-6">
                  <h3 className="text-xl font-serif text-white group-hover:text-amber-400 transition-colors">{journey.title}</h3>
                  <p className="text-xs text-stone-300 mt-1 font-light">{journey.desc}</p>
                  <div className="mt-4 flex items-center text-xs text-amber-400 font-medium tracking-wider uppercase opacity-0 group-hover:opacity-100 transition-opacity">
                    Discover More <ChevronRight size={12} className="ml-1" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

     

      {/* ==================== 7. FEATURED PROPERTY (Split Layout) ==================== */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 mb-32">
        <div className="bg-brand-black dark:bg-brand-white rounded-3xl overflow-hidden border border-brand-black dark:border-brand-white/20 shadow-xl grid grid-cols-1 lg:grid-cols-12">
          {/* Left Image Column */}
          <div className="lg:col-span-7 relative min-h-[400px] lg:min-h-[600px]">
            <img
              src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80"
              alt="Featured Lakefront Penthouse"
              className="w-full h-full object-cover"
            />
            <div className="absolute top-6 left-6 bg-brand-black text-brand-white text-xs font-semibold px-4 py-2 uppercase tracking-widest rounded">
              Property Of The Month
            </div>
          </div>

          {/* Right Details Column */}
          <div className="lg:col-span-5 p-8 md:p-12 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs text-brand-primary uppercase tracking-widest font-semibold mb-2">
                <Sparkles size={14} /> Crown Jewel Residence
              </div>
              <h2 className="text-3xl md:text-4xl text-brand-white dark:text-brand-black">The Royal Lakefront Villa</h2>
              <p className="text-brand-white dark:text-brand-black text-sm mt-2 font-light">Munyonyo Peninsula · Lake Victoria Views</p>

              <div className="text-3xl font-serif text-brand-white dark:text-brand-black mt-6">$1,650,000</div>

              {/* Specs */}
              <div className="grid grid-cols-3 gap-4 my-8 py-4 border-y border-brand-white text-center">
                <div>
                  <Bed className="mx-auto text-brand-white mb-1" size={18} />
                  <span className="block text-sm font-semibold text-stone-900">5 Beds</span>
                </div>
                <div>
                  <Bath className="mx-auto text-brand-white mb-1" size={18} />
                  <span className="block text-sm font-semibold text-stone-900">6 Baths</span>
                </div>
                <div>
                  <Maximize className="mx-auto text-brand-white mb-1" size={18} />
                  <span className="block text-sm font-semibold text-stone-[900]">780 sqm</span>
                </div>
              </div>

              {/* Amenities */}
              <div className="space-y-2 mb-8 text-xs text-stone-600">
                <div className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-600" /> Infinity Edge Swimming Pool over Lake Victoria</div>
                <div className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-600" /> Private Yacht Docking Slip</div>
                <div className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-600" /> Automated Smart Security & Solar Grid</div>
              </div>
            </div>

            <div className="space-y-3">
              <button className="w-full py-4 bg-stone-950 hover:bg-amber-600 text-white font-medium text-xs uppercase tracking-widest transition-colors rounded">
                Book Private Viewing
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button className="py-3 border border-stone-300 text-stone-800 text-xs font-medium uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-stone-50">
                  <FileText size={14} /> Floor Plan
                </button>
                <button className="py-3 border border-stone-300 text-stone-800 text-xs font-medium uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-stone-50">
                  <Video size={14} /> 3D Virtual Tour
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== 8. DEVELOPER SHOWCASE ==================== */}
      <section id="developers" className="max-w-7xl mx-auto px-6 md:px-12 mb-32">
        <div className="text-center max-w-xl mx-auto mb-16">
          <span className="text-xs uppercase tracking-widest text-brand-primary font-semibold">Institutional Trust</span>
          <h2 className="text-3xl md:text-4xl font-serif text-brand-black dark:text-brand-white mt-2">Partnered Developers</h2>
          <p className="text-brand-black dark:text-brand-white/80 text-sm mt-2 font-light">Collaborating exclusively with Uganda’s most reputable architectural masters.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { name: "Speke Real Estate", projects: "8 Active Projects", years: "18 Years Experience" },
            { name: "Kingdom Developments", projects: "5 Active Projects", years: "12 Years Experience" },
            { name: "Pearl Horizon Group", projects: "11 Active Projects", years: "22 Years Experience" },
            { name: "Victoria Luxury Capital", projects: "4 Active Projects", years: "10 Years Experience" }
          ].map((dev, idx) => (
            <div key={idx} className="bg-brand-black dark:bg-brand-white dark:text-brand-black p-8 rounded-xl border border-stone-200 hover:border-brand-primary transition-all text-center">
              <div className="w-16 h-16 bg-brand-primary rounded-full flex items-center justify-center mx-auto mb-4 text-brand-white font-serif text-xl font-bold">
                {dev.name.charAt(0)}
              </div>
              <h3 className="text-lg font-serif text-brand-white dark:text-brand-black">{dev.name}</h3>
              <p className="text-xs text-brand-white dark:text-brand-black/80 mt-2">{dev.projects}</p>
              <p className="text-[10px] uppercase text-brand-white dark:text-brand-black/80 mt-1">{dev.years}</p>
              <a href="#concierge" className="mt-6 inline-block text-xs uppercase tracking-widest text-brand-white dark:text-brand-black font-semibold hover:underline">
                Explore Portfolio →
              </a>
            </div>
          ))}
        </div>
      </section>

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