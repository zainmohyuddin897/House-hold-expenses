import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/prisma";
const parse=(line:string)=>{const out:string[]=[];let cur="",quote=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'&&line[i+1]==='"'){cur+='"';i++;continue}if(c==='"'){quote=!quote;continue}if(c===","&&!quote){out.push(cur);cur="";}else cur+=c;}out.push(cur);return out;};
export async function POST(request:Request){
 try{
  const user=await requireUser(); const body=await request.json(); const csv=typeof body.csv==="string"?body.csv:"";
  const lines=csv.replace(/^\uFEFF/,"").split(/\r?\n/).filter(Boolean); if(lines.length<2)return NextResponse.json({error:"CSV must contain a header and at least one row."},{status:400});
  const header=parse(lines[0]).map(x=>x.trim().toLowerCase()); const idx=(...names:string[])=>names.map(n=>header.indexOf(n)).find(i=>i>=0)??-1;
  const dateI=idx("date"),typeI=idx("type"),descI=idx("description","title"),amountI=idx("amount"),currencyI=idx("currency"),notesI=idx("notes");
  if([dateI,typeI,descI,amountI].some(i=>i<0))return NextResponse.json({error:"Required columns: Date, Type, Description, Amount."},{status:400});
  const preview:any[]=[]; const errors:string[]=[]; const seen=new Set<string>();
  for(let n=1;n<lines.length;n++){const c=parse(lines[n]);const date=new Date(c[dateI]);const amount=Number(c[amountI]);const type=c[typeI];const description=(c[descI]||"").trim();const key=[c[dateI],type,description,amount,c[currencyI]||"PKR"].join("|");if(!description||!Number.isFinite(amount)||amount<=0||!["income","expense"].includes(type)||Number.isNaN(date.getTime())){errors.push(`Row ${n+1}: invalid date/type/description/amount.`);continue}if(seen.has(key)){errors.push(`Row ${n+1}: duplicate row.`);continue}seen.add(key);preview.push({date,type,description,amount,currency:(c[currencyI]||"PKR").toUpperCase(),notes:c[notesI]||null});}
  if(body.preview===true)return NextResponse.json({preview,errors,total:lines.length-1});
  if(errors.length)return NextResponse.json({error:"Fix validation errors before importing.",preview,errors,total:lines.length-1},{status:400});
  const existing=await db.transaction.findMany({where:{userId:user.id},select:{date:true,type:true,description:true,amount:true,currency:true}});
  const existingKeys=new Set(existing.map(t=>[t.date.toISOString().slice(0,10),t.type,t.description,t.amount.toString(),t.currency].join("|")));
  const fresh=preview.filter(t=>!existingKeys.has([t.date.toISOString().slice(0,10),t.type,t.description,String(t.amount),t.currency].join("|")));
  const membership=await db.householdMember.findFirst({where:{userId:user.id}});
  if(fresh.length)await db.transaction.createMany({data:fresh.map(t=>({...t,userId:user.id,householdId:membership?.householdId??null}))});
  await db.auditLog.create({data:{userId:user.id,action:"import",entity:"transaction",metadata:{rows:lines.length-1,created:fresh.length,duplicates:preview.length-fresh.length}}});
  return NextResponse.json({created:fresh.length,duplicates:preview.length-fresh.length,errors:[]});
 }catch(e){if(e instanceof Error&&e.message==="UNAUTHORIZED")return NextResponse.json({error:"Unauthorized"},{status:401});return NextResponse.json({error:"Unable to import transactions."},{status:500});}
}