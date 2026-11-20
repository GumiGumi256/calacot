'use client'

import { buttonVariants } from "@/components/ui/button";
import { Search } from 'lucide-react';
import React, { useState } from 'react'

/*
 * Property search card on the real-estate hero (Design System V1, public site).
 * Brand shades replace Tailwind stone/amber; each label is linked to its dropdown; the
 * search button uses the primary style (the "glass" style is only for dark photography).
 */
const fields = [
  { id: "look-for", label: "Looking for", options: ["Residential Villa", "Penthouse", "Commercial Office", "Strategic Land"] },
  { id: "location", label: "Location", options: ["Kololo, Kampala", "Nakasero, Kampala", "Munyonyo, Lake Victoria", "Naguru Hill", "Entebbe Peninsula"] },
  { id: "budget", label: "Budget range", options: ["$250,000 – $500,000", "$500,000 – $1,000,000", "$1,000,000 – $3,000,000", "$3,000,000+"] },
  { id: "bedrooms", label: "Bedrooms", options: ["3+ Bedrooms", "4+ Bedrooms", "5+ Bedrooms / Estate"] },
];

const tabs = [
  { key: "buy", label: "Buying Properties" },
  { key: "invest", label: "Investment Opportunities" },
  { key: "rent", label: "Luxury Rentals" },
] as const;

export default function PropertyHeroSearch() {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["key"]>('buy');
  return (
    <section id="search" className="-mt-6 relative z-20 mb-28 site-container">
      <div className="rounded-2xl border border-brand-black-100 bg-white p-6 shadow-e3 dark:border-brand-black-800 dark:bg-brand-black-900 md:p-8">
        {/* Search mode */}
        <div role="group" aria-label="What are you looking for?" className="mb-6 flex gap-6 overflow-x-auto border-b border-brand-black-100 pb-4 dark:border-brand-black-800">
          {tabs.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                aria-pressed={active}
                onClick={() => setActiveTab(tab.key)}
                className={`relative shrink-0 pb-2 type-eyebrow transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm motion-reduce:transition-none ${
                  active ? 'text-brand-black dark:text-brand-white' : 'text-brand-black-600 hover:text-brand-black dark:text-brand-black-300 dark:hover:text-brand-white'
                }`}
              >
                {tab.label}
                {active && <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-brand-primary" />}
              </button>
            );
          })}
        </div>

        {/* Search inputs */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
          {fields.map((field) => (
            <div
              key={field.id}
              className="rounded-lg border border-brand-black-100 bg-brand-white p-3 focus-within:border-brand-primary-600 focus-within:ring-2 focus-within:ring-brand-primary/40 dark:border-brand-black-800 dark:bg-brand-black-950"
            >
              <label htmlFor={`property-${field.id}`} className="block type-eyebrow text-brand-black-600 dark:text-brand-black-300">
                {field.label}
              </label>
              <select
                id={`property-${field.id}`}
                className="mt-1 w-full bg-transparent text-sm font-medium text-brand-black outline-none dark:text-brand-white [&>option]:text-brand-black"
              >
                {field.options.map((option) => <option key={option}>{option}</option>)}
              </select>
            </div>
          ))}

          <button type="button" className={buttonVariants({ variant: "default", size: "lg", className: "w-full" })}>
            <Search size={16} aria-hidden /> Discover Opportunities
          </button>
        </div>

        {/* Trending locations */}
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-brand-black-100 pt-4 dark:border-brand-black-800">
          <span className="type-eyebrow text-brand-black-600 dark:text-brand-black-300">Trending locations:</span>
          {['Kololo', 'Nakasero', 'Munyonyo', 'Entebbe', 'Naguru'].map((loc) => (
            <a
              key={loc}
              href="#map"
              className="rounded-full bg-brand-black-50 px-3 py-1 text-xs text-brand-black-700 transition-colors hover:bg-brand-black hover:text-brand-white focus-visible:ring-2 focus-visible:ring-ring outline-none motion-reduce:transition-none dark:bg-brand-black-800 dark:text-brand-black-200 dark:hover:bg-brand-primary dark:hover:text-brand-black"
            >
              {loc}
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
