import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import jwt from "jsonwebtoken";

export async function GET(req: NextRequest) {
  try {
    // Get the token from cookies
    const token = req.cookies.get("accessToken")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify the token to extract user ID
    const decoded = jwt.verify(token, process.env.JWT_SECRET_ACCESS as string) as { id: number };

    // Fetch all transactions specific to expense where category id matches and fetch the amount total values of the expense by category
    const expenses = await prisma.transaction.groupBy({
      by: ["categoryId"],
      where: {
        userId: decoded.id,
        type: "EXPENSE",
      },
      _sum: {
        amount: true, // Get total spent per category
      },
    });

    // Fetch budget
    const budgets = await prisma.budget.findMany({
      where: {
        userId: decoded.id,
      },
      select: {
        id: true,
        amount: true,
        categoryId: true,
        createdAt: true,
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!budgets.length) {
      return NextResponse.json({ error: "No budgets found for the user" }, { status: 404 });
    }

    console.log(budgets);

    // Convert expenses into a lookup table
    const expenseMap = Object.fromEntries(
      expenses
        .filter((expense) => expense.categoryId !== null)
        .map((expense) => [expense.categoryId, expense._sum.amount || 0])
    );

    // Attach the percentage used to each budget
    const budgetsWithPercentage = budgets.map((budget) => {
      const totalSpent = budget.categoryId !== null ? expenseMap[budget.categoryId] ?? 0 : 0;
      const percentage = (totalSpent / budget.amount) * 100;

      return { ...budget, totalSpent, percentage };
    });

    // Return categories data
    return NextResponse.json(budgetsWithPercentage, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Invalid token or server error" }, { status: 401 });
  }
}
