import { ServiceStructuredData } from "@/components/seo/structured-data";
import { pageMetadata } from "@/lib/seo";
import { BusinessTransformation } from '@/components/tech/business-transformation'
import TechHero from '@/components/tech/hero'
import { OurProcess } from '@/components/tech/our-process'
import { SolutionsOverview } from '@/components/tech/solutions-overview'
import { TechCta } from '@/components/tech/tech-cta'
import { WhyCalacot } from '@/components/tech/why-calacot'
import React from 'react'

export const metadata = pageMetadata("/calacot-tech");

export default function CalacotTech() {
  return (
    <div>
      <ServiceStructuredData path="/calacot-tech" />
      <TechHero />
      <BusinessTransformation />
      <OurProcess />
      <SolutionsOverview />
      <WhyCalacot />
      <TechCta />
    </div>
  )
}
