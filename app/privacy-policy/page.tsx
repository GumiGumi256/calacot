import type { Metadata } from "next";
import { PublicIntro } from "@/components/layout/public-intro";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Learn how Calacot Group Uganda Limited collects, uses, stores, and protects personal information.",
};

export default function PrivacyPolicyPage() {
  return (
    <main aria-labelledby="privacy-title" className="site-container pt-28 pb-(--section-space) md:pt-32">
      <div className="mx-auto max-w-3xl">
        <PublicIntro
          id="privacy-title"
          eyebrow="Calacot Group Uganda Limited"
          title="Privacy Policy"
          description="How we collect, use, store and protect your personal information."
        >
          <p className="mt-4 text-sm text-brand-black-600 dark:text-brand-black-300">Last updated: 10 September 2026</p>
        </PublicIntro>

        {/* Long-form legal text. Styled per element because the Tailwind typography plugin is not installed. */}
        <div className="mt-12 border-t border-brand-black-100 pt-10 text-base leading-7 text-brand-black-700 dark:border-brand-black-800 dark:text-brand-black-200 [&_a]:font-medium [&_a]:text-brand-black [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-brand-primary-800 dark:[&_a]:text-brand-white dark:[&_a:hover]:text-brand-primary [&_h2]:mt-12 [&_h2]:mb-4 [&_h2]:text-2xl [&_h2]:font-medium [&_h2]:tracking-tight [&_h2]:text-brand-black dark:[&_h2]:text-brand-white [&_h2:first-of-type]:mt-10 [&_li]:pl-1 [&_li::marker]:text-brand-primary-700 dark:[&_li::marker]:text-brand-primary [&_p]:mt-4 [&_strong]:font-semibold [&_strong]:text-brand-black dark:[&_strong]:text-brand-white [&_ul]:mt-4 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-6">
          <p>
            Calacot Group Uganda Limited respects
            your privacy. This Privacy Policy explains how we collect,
            use, disclose, and protect your personal information when you use
            calacot.com, contact us, request our services, purchase
            architectural designs, or communicate with us through WhatsApp.
          </p>

          <h2>1. Who we are</h2>
          <p>
            Calacot Group Uganda Limited is a company registered in Uganda,
            operating across real estate, architecture, painting, construction,
            interior design, and technology.
          </p>

          <h2>2. Information we collect</h2>
          <p>Depending on how you interact with us, we may collect:</p>
          <ul>
            <li>Your name, email address, phone number, and location.</li>
            <li>
              Property, architectural-design, project, and service requirements.
            </li>
            <li>
              Account information when you create or use a Calacot account.
            </li>
            <li>
              Order, enquiry, invoice, and customer-support information.
            </li>
            <li>
              Messages and contact details sent to us through WhatsApp, email,
              contact forms, or other communication channels.
            </li>
            <li>
              Technical information such as IP address, browser type, device
              information, and website activity.
            </li>
          </ul>

          <h2>3. How we use your information</h2>
          <p>We use personal information to:</p>
          <ul>
            <li>Respond to enquiries, requests, and support messages.</li>
            <li>Arrange property viewings, consultations, and project calls.</li>
            <li>Process architectural-design enquiries and purchases.</li>
            <li>Send invoices, confirmations, updates, and receipts.</li>
            <li>Provide and improve our website, products, and services.</li>
            <li>Prevent fraud, abuse, and unauthorised access.</li>
            <li>Comply with legal, accounting, and regulatory obligations.</li>
            <li>
              Send marketing communications where you have provided consent.
            </li>
          </ul>

          <h2>4. WhatsApp communications</h2>
          <p>
            If you contact Calacot through WhatsApp or consent to receive
            WhatsApp messages, we may process your WhatsApp phone number,
            profile name, messages, attachments, and message delivery
            information to respond to you and provide customer support.
          </p>
          <p>
            WhatsApp messages are processed using Meta’s WhatsApp Business
            Platform. You may stop receiving marketing messages by replying
            “STOP” or contacting us directly. Service-related messages may still
            be sent when necessary to complete a request or transaction.
          </p>

          <h2>5. Legal basis for processing</h2>
          <p>
            We process personal information where it is necessary to provide a
            service or fulfil a request, where you have given consent, where we
            have a legitimate business interest, or where processing is required
            by law.
          </p>

          <h2>6. Service providers</h2>
          <p>
            We may use trusted technology providers to operate Calacot,
            including hosting, authentication, databases, email delivery,
            content management, analytics, and WhatsApp infrastructure
            providers. These providers may process information only as needed
            to provide services to us and are expected to apply appropriate
            security measures.
          </p>

          <h2>7. Sharing information</h2>
          <p>
            We do not sell your personal information. We may share information
            with service providers, professional advisers, property owners or
            developers where necessary to fulfil your request, government or
            law-enforcement authorities where legally required, or a successor
            entity if Calacot is reorganised or transferred.
          </p>

          <h2>8. Cookies and analytics</h2>
          <p>
            We may use cookies and similar technologies to keep the website
            secure, remember preferences, understand website usage, and improve
            our services. You can control cookies through your browser
            settings, although some website features may not work correctly
            without them.
          </p>

          <h2>9. Data security</h2>
          <p>
            We use reasonable technical and organisational safeguards to protect
            personal information against unauthorised access, alteration,
            disclosure, or destruction. However, no internet transmission or
            storage system can be guaranteed to be completely secure.
          </p>

          <h2>10. Data retention</h2>
          <p>
            We retain personal information only for as long as reasonably
            necessary for the purpose for which it was collected, to maintain
            business and financial records, resolve disputes, enforce
            agreements, or comply with legal obligations. When information is no
            longer required, we securely delete or anonymise it where practical.
          </p>

          <h2>11. Your rights</h2>
          <p>
            Subject to applicable law, you may request access to your personal
            information, correction of inaccurate information, deletion,
            restriction of processing, objection to direct marketing, or
            withdrawal of consent.
          </p>
          <p>
            To exercise a right, contact us using the details below. We may need
            to verify your identity before completing a request.
          </p>

          <h2>12. Transfers outside Uganda</h2>
          <p>
            Some service providers may process information outside Uganda. Where
            this occurs, we take reasonable steps to ensure that appropriate
            contractual, technical, and legal safeguards are applied.
          </p>

          <h2>13. Children’s privacy</h2>
          <p>
            Our website and services are not directed at children. We do not
            knowingly collect personal information from children without
            appropriate consent from a parent or guardian.
          </p>

          <h2>14. Changes to this policy</h2>
          <p>
            We may update this Privacy Policy when our services, technology, or
            legal obligations change. The updated version will be published on
            this page with a new revision date.
          </p>

          <h2>15. Contact us</h2>
          <p>
            For privacy questions, data requests, or complaints, contact:
          </p>

          <p>
            <strong>Calacot Group Uganda Limited</strong>
            <br />
            Kampala, Uganda
            <br />
            Email:{" "}
            <a href="mailto:info@calacot.com">info@calacot.com</a>
            <br />
            Website:{" "}
            <a href="https://www.calacot.com">www.calacot.com</a>
          </p>
        </div>
      </div>
    </main>
  );
}