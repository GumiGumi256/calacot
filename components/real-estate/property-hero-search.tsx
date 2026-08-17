'use client'

import { Search } from 'lucide-react';
import React, { useState } from 'react'

export default function PropertyHeroSearch() {
     const [activeTab, setActiveTab] = useState<'buy' | 'invest' | 'rent'>('buy');
  return (
   <section id="search" className="max-w-7xl mx-auto px-6 md:px-12 -mt-6 relative z-20 mb-28">
        <div className="bg-white rounded-2xl shadow-xl border border-stone-200/80 p-6 md:p-8 backdrop-blur-xl">
          {/* Tabs */}
          <div className="flex gap-6 border-b border-stone-200 pb-4 mb-6">
            {(['buy', 'invest', 'rent'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`text-xs uppercase tracking-widest font-semibold pb-2 transition-all relative ${
                  activeTab === tab ? 'text-stone-950' : 'text-stone-400 hover:text-stone-600'
                }`}
              >
                {tab === 'buy' && 'Buying Properties'}
                {tab === 'invest' && 'Investment Opportunities'}
                {tab === 'rent' && 'Luxury Rentals'}
                {activeTab === tab && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-full"></span>
                )}
              </button>
            ))}
          </div>

          {/* Search Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="p-3 bg-stone-50 rounded-lg border border-stone-200">
              <label className="block text-[10px] uppercase tracking-wider text-stone-400 font-medium">Looking For</label>
              <select className="w-full bg-transparent text-xs font-medium text-stone-900 outline-none mt-1">
                <option>Residential Villa</option>
                <option>Penthouse</option>
                <option>Commercial Office</option>
                <option>Strategic Land</option>
              </select>
            </div>

            <div className="p-3 bg-stone-50 rounded-lg border border-stone-200">
              <label className="block text-[10px] uppercase tracking-wider text-stone-400 font-medium">Location</label>
              <select className="w-full bg-transparent text-xs font-medium text-stone-900 outline-none mt-1">
                <option>Kololo, Kampala</option>
                <option>Nakasero, Kampala</option>
                <option>Munyonyo, Lake Victoria</option>
                <option>Naguru Hill</option>
                <option>Entebbe Peninsula</option>
              </select>
            </div>

            <div className="p-3 bg-stone-50 rounded-lg border border-stone-200">
              <label className="block text-[10px] uppercase tracking-wider text-stone-400 font-medium">Budget Range</label>
              <select className="w-full bg-transparent text-xs font-medium text-stone-900 outline-none mt-1">
                <option>$250,000 – $500,000</option>
                <option>$500,000 – $1,000,000</option>
                <option>$1,000,000 – $3,000,000</option>
                <option>$3,000,000+</option>
              </select>
            </div>

            <div className="p-3 bg-stone-50 rounded-lg border border-stone-200">
              <label className="block text-[10px] uppercase tracking-wider text-stone-400 font-medium">Bedrooms</label>
              <select className="w-full bg-transparent text-xs font-medium text-stone-900 outline-none mt-1">
                <option>3+ Bedrooms</option>
                <option>4+ Bedrooms</option>
                <option>5+ Bedrooms / Estate</option>
              </select>
            </div>

            <button className="w-full bg-stone-950 hover:bg-amber-600 text-white font-medium text-xs uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 transition-colors duration-300 py-4 lg:py-0">
              <Search size={16} /> Discover Opportunities
            </button>
          </div>

          {/* Trending Locations */}
          <div className="mt-6 pt-4 border-t border-stone-100 flex flex-wrap items-center gap-3">
            <span className="text-xs text-stone-400 uppercase tracking-wider font-medium">Trending Locations:</span>
            {['Kololo', 'Nakasero', 'Munyonyo', 'Entebbe', 'Naguru'].map((loc) => (
              <a
                key={loc}
                href="#map"
                className="text-xs bg-stone-100 hover:bg-stone-900 hover:text-white text-stone-700 px-3 py-1 rounded-full transition-all"
              >
                {loc}
              </a>
            ))}
          </div>
        </div>
      </section>
  )
}
