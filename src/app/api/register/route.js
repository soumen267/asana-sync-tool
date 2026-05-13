import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "../../../lib/db";

export async function POST(req) {
  try {
    const { name, email, password } = await req.json();

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      `
      INSERT INTO users (name, email, password)
      VALUES ($1, $2, $3)
      `,
      [name, email, hashedPassword]
    );

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error: "Registration failed",
      },
      {
        status: 500,
      }
    );
  }
}
