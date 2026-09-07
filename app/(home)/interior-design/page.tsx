import { DesignPhilosophy } from '@/components/interior-design/design-philosophy'
import { InteriorsHero } from '@/components/interior-design/interiors-hero'
import { WhatWeDesign } from '@/components/interior-design/what-we-design'
import React from 'react'

export default function InteriorDesign() {
  return (
    <div>
      <InteriorsHero />
      <DesignPhilosophy />
      <WhatWeDesign />
    </div>
  )
}
