import { SupportPortal } from "../../../components/support/support-portal";
export default async function Page({params}:{params:Promise<{portalSlug:string}>}){const {portalSlug}=await params;return <SupportPortal portalSlug={portalSlug}/>;}
