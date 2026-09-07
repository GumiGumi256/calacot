import { ServiceStructuredData } from "@/components/seo/structured-data";
import { pageMetadata } from "@/lib/seo";
import { DesignPhilosophy } from '@/components/interior-design/design-philosophy'
import { InteriorsHero } from '@/components/interior-design/interiors-hero'
import { WhatWeDesign } from '@/components/interior-design/what-we-design'
import React from 'react'

export const metadata = pageMetadata("/interior-design");

export default function InteriorDesign() {
  return (
    <div>
      <ServiceStructuredData path="/interior-design" />
      <InteriorsHero />
      <DesignPhilosophy />
      <WhatWeDesign />
    </div>
  )
}
