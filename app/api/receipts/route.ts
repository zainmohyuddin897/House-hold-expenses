import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/prisma";
export async function POST(request:Request){
 try{
  const user=await requireUser(); const form=await request.formData(); const file=form.get("file"); const transactionId=typeof form.get("transactionId")==="string"?String(form.get("transactionId")):null;
  if(!(file instanceof File))return NextResponse.json({error:"Receipt file is required."},{status:400});
  const allowed=["image/jpeg","image/png","image/webp","application/pdf"]; if(!allowed.includes(file.type))return NextResponse.json({error:"Only JPG, PNG, WEBP and PDF receipts are supported."},{status:400});
  if(file.size>5*1024*1024)return NextResponse.json({error:"Receipt must be 5MB or smaller."},{status:400});
  if(transactionId){const tx=await db.transaction.findFirst({where:{id:transactionId,userId:user.id}});if(!tx)return NextResponse.json({error:"Transaction not found."},{status:404});}
  const storageKey=`receipts/${user.id}/${randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
  const receipt=await db.receipt.create({data:{userId:user.id,transactionId,fileName:file.name,storageKey,mimeType:file.type,sizeBytes:file.size}});
  await db.auditLog.create({data:{userId:user.id,action:"receipt_upload",entity:"receipt",entityId:receipt.id}});
  return NextResponse.json({receipt,storageKey,uploadRequired:true},{status:201});
 }catch(e){if(e instanceof Error&&e.message==="UNAUTHORIZED")return NextResponse.json({error:"Unauthorized"},{status:401});return NextResponse.json({error:"Unable to save receipt."},{status:500});}
}