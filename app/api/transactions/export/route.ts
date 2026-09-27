import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/prisma";
const esc=(v:unknown)=>`"${String(v??"").replace(/"/g,'""')}"`;
export async function GET(){
 try{
  const user=await requireUser();
  const rows=await db.transaction.findMany({where:{userId:user.id},include:{category:true,account:true},orderBy:{date:"desc"}});
  const header=["Date","Type","Description","Amount","Currency","Category","Account","Notes"];
  const body=rows.map(t=>[t.date.toISOString().slice(0,10),t.type,t.description,t.amount.toString(),t.currency,t.category?.name??"",t.account?.name??"",t.notes??""].map(esc).join(","));
  return new NextResponse([header.map(esc).join(","),...body].join("\n"),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="homebudget-transactions-${new Date().toISOString().slice(0,10)}.csv"`}});
 }catch(e){if(e instanceof Error&&e.message==="UNAUTHORIZED")return NextResponse.json({error:"Unauthorized"},{status:401});return NextResponse.json({error:"Unable to export transactions."},{status:500});}
}