import { PAINTING_SERVICES } from "@/constants";
import Image from "next/image";
import React from "react";
import { Card } from "../ui/card";

export default function PaintingServices() {
  return (
    <main className="space-y-10 px-10 md:px-16  ">
      <h2 className="sub-title font-light leading-tight capitalize text-center">
        Professional Painting <br />
        Services for every space
      </h2>

      <section className="flex flex-col md:flex-row flex-wrap justify-center gap-4 w-full">
        {PAINTING_SERVICES.map((service, index) => (
          <Card
            key={index}
            className="flex flex-col md:flex-row gap-5 overflow-hidden rounded-3xl border border-white/10 p-4 w-full md:max-w-160 justify-start"
          >
            {/* Image */}
             <div className="relative h-34 md:h-55 w-full md:w-80 shrink-0">
              <Image
                src={service.image}
                alt={service.title}
                fill
                className="object-cover rounded-xl"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              />
            </div>

            {/* Content */}
            <div className="flex flex-1 flex-col ">
              <h3 className=" text-lg md:text-2xl font-semibold text-brand-black dark:text-brand-white">
                {service.title}
              </h3>

              <p className="mt-3 text-sm leading-relaxed text-brand-black/70 dark:text-brand-white/70">
                {service.description}
              </p>
            </div>
          </Card>
        ))}
      </section>
    </main>
  );
}