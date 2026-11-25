"use client";
import { useActionState } from "react";
import { createProjectMilestone, editProjectMilestone, reviewProjectMilestone, transitionProject } from "@/lib/projects/actions";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
type Staff = {id:string;name:string};
export function CreateMilestone({projectId,milestoneId,staff}:{projectId:string;milestoneId:string;staff:Staff[]}) {
 const [state,action,pending]=useActionState(createProjectMilestone,{ok:false,message:""});
 if(state.ok) return <p role="status" className="text-sm">{state.message} Refresh to add another milestone.</p>;
 return <form action={action} className="mt-3 flex flex-col gap-2">
 <input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="milestoneId" value={milestoneId}/>
 <label htmlFor="milestone-title">Title</label><input id="milestone-title" name="title" required maxLength={200} className="h-9 rounded-md border bg-transparent px-2"/>
 <label htmlFor="milestone-deliverable">Deliverable</label><textarea id="milestone-deliverable" name="deliverable" required maxLength={4000} className="rounded-md border bg-transparent p-2"/>
 <label htmlFor="milestone-staff">Responsible employee</label><NativeSelect id="milestone-staff" name="assigneeId" defaultValue=""><option value="">Unassigned</option>{staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect>
 <label htmlFor="milestone-date">Target date</label><input id="milestone-date" name="dueDate" type="date" className="h-9 rounded-md border bg-transparent px-2"/>
 <label htmlFor="milestone-required">Closure requirement</label><NativeSelect id="milestone-required" name="mandatory" defaultValue="true"><option value="true">Required</option><option value="false">Optional</option></NativeSelect>
 <Button type="submit" disabled={pending}>{pending?"Saving…":"Create milestone"}</Button>{state.message && <p role="status" className="text-sm text-destructive">{state.message}</p>}</form>;
}
export function MilestoneReview({projectId,milestoneId,version,status,admin}:{projectId:string;milestoneId:string;version:string;status:string;admin:boolean}) {
 const [state,action,pending]=useActionState(reviewProjectMilestone,{ok:false,message:""});
 if(!["pending","in_progress","awaiting_approval"].includes(status) || (status==="awaiting_approval"&&!admin)) return null;
 return <form action={action} className="mt-2 flex flex-col gap-2"><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="milestoneId" value={milestoneId}/><input type="hidden" name="updatedAt" value={version}/>
 <label htmlFor={`milestone-note-${milestoneId}`}>{status==="awaiting_approval"?"Review feedback (required for rejection)":"Completion evidence"}</label><textarea id={`milestone-note-${milestoneId}`} name="note" required={status!=="awaiting_approval"} maxLength={4000} className="rounded-md border bg-transparent p-2"/>
 {status==="awaiting_approval"?<><Button type="submit" name="decision" value="approve" disabled={pending}>Approve</Button><Button type="submit" name="decision" value="reject" variant="outline" disabled={pending}>Reject with feedback</Button></>:<Button type="submit" name="decision" value="submit" disabled={pending}>Submit for review</Button>}{state.message&&<p role="status" className={state.ok?"text-sm":"text-sm text-destructive"}>{state.message}</p>}</form>;
}
export function ProjectTransition({projectId,status}:{projectId:string;status:string}) {
 const [state,action,pending]=useActionState(transitionProject,{ok:false,message:""});
 const targets=status==="active"?["on_hold","completed","cancelled"]:status==="on_hold"?["active","completed","cancelled"]:status==="planned"?["cancelled"]:[];
 if(!targets.length)return null;
 return <form action={action} className="mt-2 flex flex-col gap-2"><input type="hidden" name="projectId" value={projectId}/><label htmlFor="project-target">New status</label><NativeSelect id="project-target" name="target">{targets.map(t=><option key={t} value={t}>{t.replaceAll("_"," ")}</option>)}</NativeSelect><label htmlFor="project-reason">Exception reason if required work remains</label><textarea id="project-reason" name="reason" maxLength={4000} className="rounded-md border bg-transparent p-2"/><Button type="submit" disabled={pending}>{pending?"Saving…":"Update status"}</Button>{state.message&&<p role="status" className={state.ok?"text-sm":"text-sm text-destructive"}>{state.message}</p>}</form>;
}

export function EditMilestone({projectId,milestoneId,version,title,deliverable,dueDate,assigneeId,mandatory,staff}:{projectId:string;milestoneId:string;version:string;title:string;deliverable:string;dueDate:string;assigneeId:string;mandatory:boolean;staff:Staff[]}) {
 const [state,action,pending]=useActionState(editProjectMilestone,{ok:false,message:""});
 return <form action={action} className="mt-2 flex flex-col gap-2">
 <input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="milestoneId" value={milestoneId}/><input type="hidden" name="updatedAt" value={version}/>
 <label htmlFor={`edit-milestone-title-${milestoneId}`}>Title</label><input id={`edit-milestone-title-${milestoneId}`} name="title" defaultValue={title} required maxLength={200} className="h-9 rounded-md border bg-transparent px-2"/>
 <label htmlFor={`edit-milestone-deliverable-${milestoneId}`}>Deliverable</label><textarea id={`edit-milestone-deliverable-${milestoneId}`} name="deliverable" defaultValue={deliverable} required maxLength={4000} className="rounded-md border bg-transparent p-2"/>
 <label htmlFor={`edit-milestone-staff-${milestoneId}`}>Responsible employee</label><NativeSelect id={`edit-milestone-staff-${milestoneId}`} name="assigneeId" defaultValue={assigneeId}><option value="">Unassigned</option>{assigneeId&&!staff.some(s=>s.id===assigneeId)&&<option value={assigneeId}>Current employee unavailable ? choose another</option>}{staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect>
 <label htmlFor={`edit-milestone-date-${milestoneId}`}>Target date</label><input id={`edit-milestone-date-${milestoneId}`} name="dueDate" type="date" defaultValue={dueDate} className="h-9 rounded-md border bg-transparent px-2"/>
 <label htmlFor={`edit-milestone-required-${milestoneId}`}>Closure requirement</label><NativeSelect id={`edit-milestone-required-${milestoneId}`} name="mandatory" defaultValue={mandatory?"true":"false"}><option value="true">Required</option><option value="false">Optional</option></NativeSelect>
 <Button type="submit" disabled={pending}>{pending?"Saving?":"Save milestone"}</Button>{state.message&&<p role="status" className={state.ok?"text-sm":"text-sm text-destructive"}>{state.message}</p>}</form>;
}
