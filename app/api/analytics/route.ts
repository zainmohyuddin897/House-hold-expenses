import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function GET(request:Request){
  try{
    const user=await requireUser();
    const url=new URL(request.url);
    const monthParam=url.searchParams.get("month");
    const base=monthParam?new Date(`${monthParam}-01T00:00:00`):new Date();
    const start=new Date(base.getFullYear(),base.getMonth(),1);
    const end=new Date(base.getFullYear(),base.getMonth()+1,1);
    const transactions=await db.transaction.findMany({where:{userId:user.id,date:{gte:start,lt:end}},include:{category:true}});
    let income=0,expense=0;
    const categoryMap:Record<string,number>={};
    for(const t of transactions){
      const amount=Number(t.amount);
      if(t.type==="income")income+=amount;
      else{expense+=amount;const key=t.category?.name||"Uncategorized";categoryMap[key]=(categoryMap[key]||0)+amount;}
    }
    const categories=Object.entries(categoryMap).sort((a,b)=>b[1]-a[1]).map(([name,amount])=>({name,amount,percentage:expense?Math.round(amount/expense*1000)/10:0}));
    return NextResponse.json({period:{start,end},metrics:{income,expense,balance:income-expense,savings:income-expense,savingsRate:income?Math.round((income-expense)/income*1000)/10:0,transactionCount:transactions.length},categories});
  }catch(error){if(error instanceof Error&&error.message==="UNAUTHORIZED")return NextResponse.json({error:"Unauthorized"},{status:401});return NextResponse.json({error:"Unable to load analytics."},{status:500});}
}