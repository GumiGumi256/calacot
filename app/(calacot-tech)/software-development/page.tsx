import { BusinessTransformation } from '@/components/tech/business-transformation'
import TechHero from '@/components/tech/hero'
import { OurProcess } from '@/components/tech/our-process'
import { SolutionsOverview } from '@/components/tech/solutions-overview'
import React from 'react'

export default function SoftwareDevelopment() {
  return (
    <main>
      <TechHero />
      <BusinessTransformation />
      <OurProcess />
      <SolutionsOverview />
    </main>
  )
}
