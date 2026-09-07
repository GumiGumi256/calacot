import { ServiceStructuredData } from "@/components/seo/structured-data";
import { pageMetadata } from "@/lib/seo";
import ArchAboutSection from '@/components/architecture/arch-about-section'
import ArchHero from '@/components/architecture/arch-hero'
import ConceptualWorkSection from '@/components/architecture/conceptual-work'
import DesignLanguageSection from '@/components/architecture/design-language'
import WhatWeDesignSection from '@/components/architecture/what-we-design'
import React from 'react'

export const metadata = pageMetadata("/architecture");

export default function ArchitecturalDesignPage() {
  return (
    <div>
      <ServiceStructuredData path="/architecture" />
      <ArchHero />
      {/* <ArchAboutSection /> */}
      <WhatWeDesignSection />
      <DesignLanguageSection />
      <ConceptualWorkSection />
    </div>
  )
}
