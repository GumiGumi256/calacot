"use client";

import React from 'react'
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { SERVICE_COPY } from '@/constants';

interface StartProjectFormProps {
  initialService?: string;
}

export default function StartProjectForm({
  initialService,
}: StartProjectFormProps) {
  const hasService = Boolean(initialService);
const serviceKey = initialService || "";
const serviceData = SERVICE_COPY[serviceKey];
  return (
    <div className="w-full max-w-md md:max-w-2xl lg:max-w-4xl mx-auto">
      {hasService ? (
        <h1>
          Start Your {formatService(initialService)} Project
        </h1>
      ) : (
        <h1>Start Your Project</h1>
      )}
     <p className="mt-4 max-w-2xl text-muted-foreground mb-10 ">
  {serviceData?.description ??
    "Whether you're building a new home, transforming an interior, refreshing a property with paint, developing software, or investing in real estate, we'd love to learn about your vision."}
</p>
      <div className="w-full max-w-md md:max-w-2xl lg:max-w-4xl mx-auto">
        <form>
          <FieldGroup>
            <FieldSet>
              <FieldLegend>Your Information</FieldLegend>
              <FieldDescription>
                Tell us a little about yourself.
              </FieldDescription>

              <FieldGroup className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
                <Field>
                  <FieldLabel>Full Name</FieldLabel>
                  <Input placeholder="John Doe" required />
                </Field>

                <Field>
                  <FieldLabel>Email Address</FieldLabel>
                  <Input type="email" placeholder="john@example.com" required />
                </Field>

                <Field>
                  <FieldLabel>Phone Number</FieldLabel>
                  <Input placeholder="+256 700 000 000" />
                </Field>
              </FieldGroup>
            </FieldSet>

            <FieldSet>
              <FieldLegend>Service Required</FieldLegend>
              <FieldDescription>
                Select the service you&apos;re interested in.
              </FieldDescription>
              {initialService && (
                <input
                  type="hidden"
                  name="service"
                  value={initialService}
                />
              )}

              <Field>
                <FieldLabel>Service</FieldLabel>
                <Input
                  value={formatService(initialService)}
                  readOnly
                />
              </Field>

              {!initialService && (
                <Field>
                  <FieldLabel>Service Required</FieldLabel>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a service" />
                    </SelectTrigger>

                    <SelectContent>
                      <SelectItem value="real-estate">
                        Real Estate
                      </SelectItem>
                      <SelectItem value="architecture">
                        Architecture
                      </SelectItem>
                      <SelectItem value="painting">
                        Painting
                      </SelectItem>
                      <SelectItem value="interior-design">
                        Interior Design
                      </SelectItem>
                      <SelectItem value="software-development">
                        Software Development
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </FieldSet>

            <FieldSet>
              <FieldLegend>Project Details</FieldLegend>

              <FieldGroup className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
                <Field>
                  <FieldLabel>Project Location</FieldLabel>
                  <Input placeholder="Kampala, Uganda" />
                </Field>

                <Field>
                  <FieldLabel>Estimated Budget</FieldLabel>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select budget range" />
                    </SelectTrigger>

                    <SelectContent>
                      <SelectItem value="under-5m">
                        Under UGX 5M
                      </SelectItem>

                      <SelectItem value="5m-20m">
                        UGX 5M - 20M
                      </SelectItem>

                      <SelectItem value="20m-100m">
                        UGX 20M - 100M
                      </SelectItem>

                      <SelectItem value="100m-plus">
                        Above UGX 100M
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel>Timeline</FieldLabel>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="When do you want to start?" />
                    </SelectTrigger>

                    <SelectContent>
                      <SelectItem value="immediately">
                        Immediately
                      </SelectItem>

                      <SelectItem value="1-month">
                        Within 1 Month
                      </SelectItem>

                      <SelectItem value="3-months">
                        Within 3 Months
                      </SelectItem>

                      <SelectItem value="planning">
                        Just Planning
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
            </FieldSet>

            <FieldSet>
              <FieldLegend>Tell Us About Your Project</FieldLegend>

              <Field>
                <FieldLabel>Project Brief</FieldLabel>
                <Textarea
                  className="min-h-40 resize-none"
                  placeholder="Describe your project, goals, style preferences, requirements, or any specific ideas you have..."
                />
              </Field>
            </FieldSet>

            <Field orientation="horizontal" className="flex flex-wrap gap-4 justify-start items-center">
              <Button type="submit" size="lg">
                Start My Project
              </Button>

              <Button variant="outline" type="button">
                Schedule a Call
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </div>
    </div>
  )
}

function formatService(service?: string) {
  if (!service) return "";

  return service
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}