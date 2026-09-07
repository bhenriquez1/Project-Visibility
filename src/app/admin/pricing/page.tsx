import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import { getPricingCatalog } from "@/lib/pricingCatalog";
import { PricingEditor } from "./pricing-editor";
import { CustomerOfferEditor } from "./customer-offer-editor";
import { prisma } from "@/lib/prisma";
import { TestBilling } from "./test-billing";

export const dynamic = "force-dynamic";
export default async function PricingPage() {
  if ((await auth())?.user?.role !== "owner") notFound();
  const catalog = await getPricingCatalog();
  const customers = await prisma.prospect.findMany({ select: { id: true, businessName: true }, orderBy: { businessName: "asc" }, take: 500 });
  return <div className="max-w-5xl"><h1 className="text-2xl font-semibold">Pricing & subscriptions</h1>
    <p className="my-4">Production billing is locked. These are configurable offers; planned features require implementation and service approval before sale. Existing customers retain their Stripe subscription price.</p>
    <PricingEditor initial={catalog} /><CustomerOfferEditor catalog={catalog} customers={customers} /><TestBilling catalog={catalog} customers={customers} /></div>;
}
