import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

const createSchema=z.object({
  description:z.string().trim().min(1).max(200),
  amount:z.coerce.number().positive().finite(),
  type:z.enum(["income","expense"]),
  categoryId:z.string().cuid().optional().nullable(),
  accountId:z.string().cuid().optional().nullable(),
  date:z.coerce.date().optional(),
  notes:z.string().max(1000).optional().nullable(),
  currency:z.string().length(3).default("PKR")
});
const updateSchema=createSchema.partial().extend({id:z.string().cuid()});

export async function GET(request:Request){
  try{
    const user=await requireUser();
    const url=new URL(request.url);
    const q=url.searchParams.get("q")?.trim();
    const type=url.searchParams.get("type");
    const categoryId=url.searchParams.get("categoryId");
    const accountId=url.searchParams.get("accountId");
    const page=Math.max(1,Number(url.searchParams.get("page")||"1"));
    const limit=Math.min(100,Math.max(1,Number(url.searchParams.get("limit")||"25")));
    const where:any={userId:user.id};
    if(q) where.OR=[{description:{contains:q,mode:"insensitive"}},{notes:{contains:q,mode:"insensitive"}}];
    if(type==="income"||type==="expense") where.type=type;
    if(categoryId) where.categoryId=categoryId;
    if(accountId) where.accountId=accountId;
    const [items,total]=await Promise.all([
      db.transaction.findMany({where,include:{category:true,account:true},orderBy:{date:"desc"},skip:(page-1)*limit,take:limit}),
      db.transaction.count({where})
    ]);
    return NextResponse.json({items,total,page,limit,pages:Math.ceil(total/limit)});
  }catch(error){if(error instanceof Error&&error.message==="UNAUTHORIZED")return NextResponse.json({error:"Unauthorized"},{status:401});return NextResponse.json({error:"Unable to load transactions."},{status:500});}
}

async function validateRelations(userId:string,input:{categoryId?:string|null;accountId?:string|null}){
  if(input.categoryId){const c=await db.category.findFirst({where:{id:input.categoryId,userId}});if(!c)throw new Error("Invalid category");}
  if(input.accountId){const a=await db.account.findFirst({where:{id:input.accountId,userId}});if(!a)throw new Error("Invalid account");}
}

export async function POST(request:Request){
  try{
    const user=await requireUser(); const input=createSchema.parse(await request.json());
    await validateRelations(user.id,input);
    const membership=await db.householdMember.findFirst({where:{userId:user.id}});
    const tx=await db.transaction.create({data:{userId:user.id,householdId:membership?.householdId??null,description:input.description,amount:input.amount,type:input.type,categoryId:input.categoryId??null,accountId:input.accountId??null,date:input.date??new Date(),notes:input.notes??null,currency:input.currency},include:{category:true,account:true}});
    await db.auditLog.create({data:{userId:user.id,action:"create",entity:"transaction",entityId:tx.id}});
    return NextResponse.json(tx,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Invalid transaction data."},{status:400});
    if(error instanceof Error&&error.message==="UNAUTHORIZED")return NextResponse.json({error:"Unauthorized"},{status:401});
    return NextResponse.json({error:error instanceof Error?error.message:"Unable to create transaction."},{status:400});
  }
}

export async function PATCH(request:Request){
  try{
    const user=await requireUser(); const input=updateSchema.parse(await request.json());
    const existing=await db.transaction.findFirst({where:{id:input.id,userId:user.id}});
    if(!existing)return NextResponse.json({error:"Transaction not found."},{status:404});
    await validateRelations(user.id,input);
    const {id,...data}=input;
    const tx=await db.transaction.update({where:{id},data:{...data,amount:data.amount===undefined?undefined:data.amount,date:data.date===undefined?undefined:data.date},include:{category:true,account:true}});
    await db.auditLog.create({data:{userId:user.id,action:"update",entity:"transaction",entityId:id}});
    return NextResponse.json(tx);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Invalid transaction data."},{status:400});
    if(error instanceof Error&&error.message==="UNAUTHORIZED")return NextResponse.json({error:"Unauthorized"},{status:401});
    return NextResponse.json({error:"Unable to update transaction."},{status:400});
  }
}

export async function DELETE(request:Request){
  try{
    const user=await requireUser(); const id=new URL(request.url).searchParams.get("id");
    if(!id)return NextResponse.json({error:"Transaction id is required."},{status:400});
    const existing=await db.transaction.findFirst({where:{id,userId:user.id}});
    if(!existing)return NextResponse.json({error:"Transaction not found."},{status:404});
    await db.transaction.delete({where:{id}});
    await db.auditLog.create({data:{userId:user.id,action:"delete",entity:"transaction",entityId:id}});
    return NextResponse.json({ok:true});
  }catch(error){if(error instanceof Error&&error.message==="UNAUTHORIZED")return NextResponse.json({error:"Unauthorized"},{status:401});return NextResponse.json({error:"Unable to delete transaction."},{status:500});}
}