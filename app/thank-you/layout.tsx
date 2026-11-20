import Navbar from "@/components/navbar";

/** Public utility page: the site navbar, like the division and account pages. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}
