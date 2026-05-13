import { NextResponse } from "next/server";
import { generateTaskSummary } from "../../../services/aiSummary";

export async function POST(req) {
  try {
    const body = await req.json();

    const summary = await generateTaskSummary(body.task);

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
    });
  }
}