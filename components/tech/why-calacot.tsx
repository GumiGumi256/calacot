"use client";

import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  Camera,
  FileText,
  Glasses,
  Globe,
  HardDrive,
  Mail,
  Infinity as LoopIcon,
  TrendingUp,
  Wifi,
} from "lucide-react";

export function WhyCalacot() {
  return (
    <section className="relative overflow-hidden sm:py-24 lg:py-28 bg-background text-foreground">
     

      <div className="site-container">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-8">
          
          {/* Left Text Block */}
          <div className="max-w-xl lg:col-span-6">
            <h2 className="text-brand-black dark:text-brand-white section-heading">
              We design more than software.
            </h2>

            <p className="mt-6 text-base leading-relaxed text-brand-black-600 dark:text-brand-black-300 sm:text-lg sm:leading-8">
              The real problem is rarely that a business simply needs an app. It
            may be disconnected teams, missed follow-ups, slow approvals or
            limited visibility.
            </p>

           
          </div>

          {/* Right Radar Chart & Floating Tools Illustration */}
          <div className="relative flex justify-center lg:col-span-6 lg:justify-end">
            <div className="relative h-[420px] w-[420px] sm:h-[480px] sm:w-[480px]">
              
              {/* Radar Grid Graphic */}
              <svg
                viewBox="0 0 400 400"
                className="absolute inset-0 h-full w-full"
                aria-hidden="true"
              >
                {/* Concentric Circles */}
                <circle
                  cx="200"
                  cy="200"
                  r="180"
                  fill="none"
                  className="stroke-brand-lavender-200 dark:stroke-brand-lavender-800"
                  strokeWidth="1.5"
                />
                <circle
                  cx="200"
                  cy="200"
                  r="130"
                  fill="none"
                  className="stroke-brand-lavender-200 dark:stroke-brand-lavender-800"
                  strokeWidth="1.5"
                />
                <circle
                  cx="200"
                  cy="200"
                  r="80"
                  fill="none"
                  className="stroke-brand-lavender-200 dark:stroke-brand-lavender-800"
                  strokeWidth="1.5"
                />
                <circle
                  cx="200"
                  cy="200"
                  r="30"
                  fill="none"
                  className="stroke-brand-lavender-200 dark:stroke-brand-lavender-800"
                  strokeWidth="1.5"
                />

                {/* Radar Spoke Lines */}
                <line x1="200" y1="20" x2="200" y2="380" className="stroke-brand-lavender-200 dark:stroke-brand-lavender-800" strokeWidth="1" />
                <line x1="20" y1="200" x2="380" y2="200" className="stroke-brand-lavender-200 dark:stroke-brand-lavender-800" strokeWidth="1" />
                <line x1="72" y1="72" x2="328" y2="328" className="stroke-brand-lavender-200 dark:stroke-brand-lavender-800" strokeWidth="1" />
                <line x1="72" y1="328" x2="328" y2="72" className="stroke-brand-lavender-200 dark:stroke-brand-lavender-800" strokeWidth="1" />

                {/* Filled Polygon Graph */}
                <polygon
                  points="200,60 300,120 340,210 240,310 160,320 135,180"
                  className="fill-brand-lavender-400 stroke-brand-lavender-600" fillOpacity="0.45"
                  strokeWidth="2.5"
                />
              </svg>

              {/* Floating Tool Icons Nodes */}

              {/* Top / Envelope */}
              <div className="absolute top-[3%] left-[48%] flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full bg-white shadow-md">
                <Mail className="h-4 w-4 text-brand-lavender-500" />
              </div>

              {/* Top Right / Google Drive */}
              <div className="absolute top-[12%] right-[16%] flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-lavender-100 text-brand-lavender-700 font-bold text-xs">
                  G
                </div>
              </div>

              {/* Outer Right Upper / Mountain App */}
              <div className="absolute top-[28%] right-[22%] flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md">
                <Globe className="h-5 w-5 text-brand-grey-olive-600" />
              </div>

              {/* Mid Right / Infinity Loop */}
              <div className="absolute top-[44%] right-[3%] flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md">
                <LoopIcon className="h-5 w-5 text-brand-primary-700" />
              </div>

              {/* Lower Right / Wifi */}
              <div className="absolute top-[62%] right-[1%] flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md">
                <Wifi className="h-4 w-4 text-brand-lavender-400" />
              </div>

              {/* Bottom Right / Trending Up */}
              <div className="absolute bottom-[22%] right-[16%] flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md">
                <TrendingUp className="h-4 w-4 text-brand-lavender-600" />
              </div>

              {/* Bottom Outer / Google Drive */}
              <div className="absolute bottom-[10%] right-[30%] flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-lg">
                <HardDrive className="h-6 w-6 text-brand-grey-olive-700" />
              </div>

              {/* Bottom Center / Dropbox */}
              <div className="absolute bottom-[2%] left-[42%] flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-lg">
                <HardDrive className="h-6 w-6 text-brand-lavender-600" />
              </div>

              {/* Bottom Left / VR Glasses */}
              <div className="absolute bottom-[23%] left-[12%] flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md">
                <Glasses className="h-5 w-5 text-brand-primary-700" />
              </div>

              {/* Mid Left / Camera */}
              <div className="absolute top-[50%] left-[2%] flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md">
                <Camera className="h-4 w-4 text-brand-black-700" />
              </div>

              {/* Upper Left / Classroom */}
              <div className="absolute top-[22%] left-[8%] flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-lg">
                <div className="flex h-7 w-7 items-center justify-center rounded bg-brand-primary text-brand-black font-bold text-xs">
                  A
                </div>
              </div>

              {/* INNER NODES (Inside the Radar Polygon) */}
              
              {/* Google Docs Node */}
              <div className="absolute bottom-[30%] left-[45%] flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md">
                <FileText className="h-5 w-5 text-brand-lavender-500" />
              </div>

              {/* Calendar Node */}
              <div className="absolute top-[38%] left-[42%] flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md">
                <Calendar className="h-5 w-5 text-brand-lavender-600" />
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}