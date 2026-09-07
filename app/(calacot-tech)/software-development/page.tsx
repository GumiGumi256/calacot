import { BusinessTransformation } from '@/components/tech/business-transformation'
import TechHero from '@/components/tech/hero'
import { OurProcess } from '@/components/tech/our-process'
import { SolutionsOverview } from '@/components/tech/solutions-overview'
import { TechCta } from '@/components/tech/tech-cta'
import { WhyCalacot } from '@/components/tech/why-calacot'
import React from 'react'

export default function SoftwareDevelopment() {
  return (
    <main>
      <TechHero />
      <BusinessTransformation />
      <OurProcess />
      <SolutionsOverview />
      <WhyCalacot />
      <TechCta />
    </main>
  )
}
