"use client";

import Image from "next/image";
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { cn } from "@/lib/utils";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { CONCEPTS } from "@/constants";





export default function ConceptualWorkSection() {
  const sectionRef = useRef<HTMLElement | null>(null);

  useGSAP(
    () => {
      const cards = gsap.utils.toArray<HTMLElement>(".concept-card");

      gsap.set(cards, {
        opacity: 0,
        y: 60,
        scale: 0.98,
      });

      cards.forEach((card, i) => {
        gsap.to(card, {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 1,
          ease: "power3.out",
          delay: i * 0.15,
          scrollTrigger: {
            trigger: card,
            start: "top 85%",
          },
        });
      });
    },
    { scope: sectionRef }
  );

  return (
    <section
      ref={sectionRef}
      className="relative w-full py-24 lg:py-40 bg-brand-white dark:bg-brand-black"
    >
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <div className="max-w-2xl mb-16">
         

         <h2 className="text-4xl font-light uppercase title-2 md:text-6xl w-full">
            Designing ideas <br /> before they become form
          </h2>

          <p className="text-p mt-4 leading-relaxed">
            Every project begins as a conceptual exploration — where structure,
            emotion, and identity are defined before execution.
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {CONCEPTS.map((item, idx) => (
            <Card
              key={idx}
              className={cn(
                "concept-card group relative overflow-hidden",
                "rounded-2xl"
              )}
            >
              {/* Image */}
              
                <Image
                  src={item.image}
                  alt={item.title}
                  width={400}
                  height={300}
                   className="relative z-20 aspect-video w-full object-cover dark:brightness-80"
                />
             

              {/* Content */}
              <CardHeader className="">
                {item.tag && (
                  <span className="text-xs uppercase tracking-wider">
                    {item.tag}
                  </span>
                )}
<CardTitle className="text-xl font-medium mt-2">{item.title}</CardTitle>
                

                <CardDescription className="text-sm mt-2 leading-relaxed">
                  {item.description}
                </CardDescription>
              </CardHeader>

              {/* Hover Accent */}
              <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-t from-black/5 to-transparent" />
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}