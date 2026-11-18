"use client";
import { useState, useTransition } from "react";
import { reconcileStaffMemberships } from "@/lib/admin/staff-reconciliation";
import { Button } from "@/components/ui/button";
export function RefreshStaff() {
 const [pending,start]=useTransition();const [message,setMessage]=useState("");
 return <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" disabled={pending} onClick={()=>start(async()=>{const result=await reconcileStaffMemberships();setMessage(result.message);})}>{pending?"Refreshing staff…":"Refresh staff from Clerk"}</Button>{message && <p role="status" className="text-sm">{message}</p>}</div>;
}
